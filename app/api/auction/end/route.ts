import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeAuction, SellerData, BuyerBid } from '@/lib/auctionEngine';

export const dynamic = 'force-dynamic';

// Use 'any' cast to bypass TypeScript cache issues with Prisma client
const db = prisma as any;

export async function POST(request: NextRequest) {
  try {
    const auction = await db.auction.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json({ error: 'No active auction found' }, { status: 404 });
    }

    // Fetch distance slabs for delivery cost calculation
    const distanceSlabs = await db.distanceSlab.findMany({
      orderBy: { minKm: 'asc' },
    });

    // Helper function to get delivery cost from distance
    function getDeliveryCost(distanceKm: number): number {
      for (const slab of distanceSlabs) {
        if (distanceKm >= Number(slab.minKm) && distanceKm <= Number(slab.maxKm)) {
          return Number(slab.costPerKg);
        }
      }
      // Default to last slab's cost if distance exceeds all slabs
      if (distanceSlabs.length > 0) {
        return Number(distanceSlabs[distanceSlabs.length - 1].costPerKg);
      }
      return 0;
    }

    // Fetch all seller bids for this auction
    const sellerBids = await db.sellerBid.findMany({
      where: { auctionId: auction.id },
      include: { seller: true },
      orderBy: { offerPricePerKg: 'asc' },
    });

    // Fetch all buyer bids for this auction
    const buyerBids = await db.buyerBid.findMany({
      where: { auctionId: auction.id },
      include: { buyer: true },
      orderBy: { bidPricePerKg: 'desc' },
    });

    if (sellerBids.length === 0) {
      return NextResponse.json({ error: 'No seller bids found' }, { status: 400 });
    }

    if (buyerBids.length === 0) {
      return NextResponse.json({ error: 'No buyer bids found' }, { status: 400 });
    }

    // Convert SellerBid to SellerData format
    // Calculate delivery cost and landed cost for each seller bid
    const sellerData: SellerData[] = sellerBids.map((sb: any) => {
      const distanceKm = Number(sb.distanceKm || sb.seller.distanceKm || 0);
      const offerPrice = Number(sb.offerPricePerKg);
      const deliveryCost = sb.deliveryCostPerKg ? Number(sb.deliveryCostPerKg) : getDeliveryCost(distanceKm);
      const landedCost = sb.landedCostPerKg ? Number(sb.landedCostPerKg) : offerPrice + deliveryCost;
      
      return {
        id: sb.seller.id,
        name: sb.seller.sellerName,
        quantity: Number(sb.offerQuantityMt),
        reservePrice: landedCost, // Use landed cost for sorting (Excel-exact)
        // Store extra data for allocation
        _offerPrice: offerPrice,
        _deliveryCost: deliveryCost,
        _landedCost: landedCost,
        _distanceKm: distanceKm,
      };
    });

    // Group buyer bids by buyer ID
    const buyerBidsByBuyer = new Map<string, any[]>();
    for (const bb of buyerBids) {
      const buyerId = bb.buyer.id;
      if (!buyerBidsByBuyer.has(buyerId)) {
        buyerBidsByBuyer.set(buyerId, []);
      }
      buyerBidsByBuyer.get(buyerId)!.push(bb);
    }

    // Convert to BuyerBid format (up to 3 bids per buyer)
    const bidData: BuyerBid[] = [];
    for (const [buyerId, bids] of buyerBidsByBuyer) {
      const sortedBids = bids.sort((a: any, b: any) => 
        Number(b.bidPricePerKg) - Number(a.bidPricePerKg)
      );
      
      bidData.push({
        userId: buyerId,
        userName: bids[0].buyer.buyerName,
        price1: Number(sortedBids[0].bidPricePerKg),
        quantity1: Number(sortedBids[0].bidQuantityMt),
        price2: sortedBids[1] ? Number(sortedBids[1].bidPricePerKg) : undefined,
        quantity2: sortedBids[1] ? Number(sortedBids[1].bidQuantityMt) : undefined,
        price3: sortedBids[2] ? Number(sortedBids[2].bidPricePerKg) : undefined,
        quantity3: sortedBids[2] ? Number(sortedBids[2].bidQuantityMt) : undefined,
      });
    }

    // Execute auction engine with tick size
    const results = executeAuction(sellerData, bidData, Number(auction.tickSize));

    // Calculate totals
    const totalSupply = results.supplyPoints.reduce((sum, s) => sum + s.quantity, 0);
    const totalDemand = results.demandPoints.reduce((sum, d) => sum + d.quantity, 0);
    const allocatedQty = results.allocations.reduce((sum, a) => sum + a.quantity, 0);
    const unsoldSupply = totalSupply - allocatedQty;

    // Update auction with results
    await db.auction.update({
      where: { id: auction.id },
      data: {
        status: 'COMPLETED',
        clearingPrice: results.clearingPrice,
        clearingQuantityMt: results.clearingQuantity,
        tradeValue: results.totalTradeValue,
        clearingType: results.clearingType,
        totalSupplyMt: totalSupply,
        totalDemandMt: totalDemand,
        unsoldSupplyMt: unsoldSupply,
        endTime: new Date(),
        closedAt: new Date(),
      },
    });

    // Delete existing allocations for this auction
    await db.allocation.deleteMany({
      where: { auctionId: auction.id },
    });

    // Create a map of seller data for lookup
    const sellerDataMap = new Map<string, any>();
    for (const sd of sellerData) {
      sellerDataMap.set(sd.id, sd);
    }

    // Save allocations (buyer-seller pairs)
    for (const buyerAlloc of results.buyerAllocations) {
      for (const sellAlloc of buyerAlloc.allocations) {
        const sellerInfo = sellerDataMap.get(sellAlloc.sellerId) || {};
        
        await db.allocation.create({
          data: {
            auctionId: auction.id,
            buyerId: buyerAlloc.userId,
            sellerId: sellAlloc.sellerId,
            allocatedQuantityMt: sellAlloc.quantity,
            finalPricePerKg: results.clearingPrice,
            buyerBidPrice: sellAlloc.price,
            sellerOfferPrice: sellerInfo._offerPrice || results.clearingPrice,
            sellerLandedCost: sellerInfo._landedCost || results.clearingPrice,
            tradeValue: sellAlloc.quantity * results.clearingPrice * 1000,
            buyerSavings: (sellAlloc.price - results.clearingPrice) * sellAlloc.quantity * 1000,
            sellerBonus: (results.clearingPrice - (sellerInfo._offerPrice || results.clearingPrice)) * sellAlloc.quantity * 1000,
          },
        });
      }
    }

    // Save supply snapshots (use correct field names from schema)
    await db.auctionSupplySnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    for (const sp of results.supplyPoints) {
      const sellerInfo = sellerDataMap.get(sp.sellerId) || {};
      await db.auctionSupplySnapshot.create({
        data: {
          auctionId: auction.id,
          sellerId: sp.sellerId,
          sellerName: sp.sellerName,
          price: sp.price,
          quantity: sp.quantity,
          cumulativeSupply: sp.cumulativeQuantity,
          landedCost: sellerInfo._landedCost || sp.price,
          deliveryCost: sellerInfo._deliveryCost || 0,
        },
      });
    }

    // Save demand snapshots
    await db.auctionDemandSnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    for (const dp of results.demandPoints) {
      await db.auctionDemandSnapshot.create({
        data: {
          auctionId: auction.id,
          buyerId: dp.userId,
          buyerName: dp.userName,
          price: dp.price,
          quantity: dp.quantity,
          cumulativeDemand: dp.cumulativeQuantity,
        },
      });
    }

    // Save gap snapshots
    await db.auctionGapSnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    for (let i = 0; i < results.gapPoints.length; i++) {
      const gp = results.gapPoints[i];
      await db.auctionGapSnapshot.create({
        data: {
          auctionId: auction.id,
          rowIndex: i,
          price: gp.price,
          supply: gp.cumulativeSupply,
          demand: gp.cumulativeDemand,
          gap: gp.gap,
        },
      });
    }

    // Save auction result summary
    await db.auctionResult.deleteMany({
      where: { auctionId: auction.id },
    });
    await db.auctionResult.create({
      data: {
        auctionId: auction.id,
        clearingPrice: results.clearingPrice,
        clearingQuantityMt: results.clearingQuantity,
        tradeValue: results.totalTradeValue,
        clearingType: results.clearingType,
        totalSupplyMt: totalSupply,
        totalDemandMt: totalDemand,
        unsoldSupplyMt: unsoldSupply,
        unsoldDemandMt: Math.max(0, totalDemand - allocatedQty),
        participatingBuyers: results.buyerAllocations.length,
        participatingSellers: results.allocations.length,
        resultJson: JSON.stringify(results),
      },
    });

    return NextResponse.json({ 
      success: true, 
      results: {
        clearingPrice: results.clearingPrice,
        clearingQuantity: results.clearingQuantity,
        clearingType: results.clearingType,
        totalTradeValue: results.totalTradeValue,
        totalSupply,
        totalDemand,
        unsoldSupply,
        allocations: results.buyerAllocations.length,
      }
    });
  } catch (error) {
    console.error('Error ending auction:', error);
    return NextResponse.json({ 
      error: 'Failed to end auction', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}