import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  executeDoubleAuction,
  getLeftoverQuantities,
  SellerBidData,
  BuyerBidData,
  DistanceSlabData,
} from '@/lib/auctionEngine';

export const dynamic = 'force-dynamic';

// Type definitions for Prisma results
interface AuctionRecord {
  id: string;
  status: string;
  tickSize: any;
  reauctionCount: number;
  parentAuctionId?: string;
  createdAt: Date;
}

interface SellerBidRecord {
  id: string;
  auctionId: string;
  sellerId: string;
  offerPricePerKg: any;
  offerQuantityMt: any;
  distanceKm: any;
  deliveryCostPerKg: any;
  landedCostPerKg: any;
  seller: { sellerName: string };
}

interface BuyerBidRecord {
  id: string;
  auctionId: string;
  buyerId: string;
  bidPricePerKg: any;
  bidQuantityMt: any;
  buyer: { buyerName: string };
}

interface DistanceSlabRecord {
  minKm: any;
  maxKm: any;
  costPerKg: any;
}

/**
 * POST /api/auction/end-new
 * Execute the double auction with the new schema (multi-buyer, multi-seller)
 * Implements Excel-exact clearing with second-price mechanism
 */
export async function POST(request: NextRequest) {
  try {
    // Get the active auction
    const auction = await prisma.auction.findFirst({
      where: { status: 'ACTIVE' as any },
      orderBy: { createdAt: 'desc' },
    }) as AuctionRecord | null;

    if (!auction) {
      return NextResponse.json({ error: 'No active auction found' }, { status: 404 });
    }

    // Fetch all seller bids for this auction
    const sellerBids = await (prisma as any).sellerBid.findMany({
      where: { auctionId: auction.id },
      include: { seller: true },
    }) as SellerBidRecord[];

    // Fetch all buyer bids for this auction
    const buyerBids = await (prisma as any).buyerBid.findMany({
      where: { auctionId: auction.id },
      include: { buyer: true },
    }) as BuyerBidRecord[];

    // Fetch distance slabs for delivery cost calculation
    const distanceSlabs = await (prisma as any).distanceSlab.findMany() as DistanceSlabRecord[];
    const slabData: DistanceSlabData[] = distanceSlabs.map((s: DistanceSlabRecord) => ({
      minKm: Number(s.minKm),
      maxKm: Number(s.maxKm),
      costPerKg: Number(s.costPerKg),
    }));

    // Prepare seller bids with delivery costs
    const preparedSellerBids: SellerBidData[] = sellerBids.map((bid: SellerBidRecord) => ({
      id: bid.id,
      sellerId: bid.sellerId,
      sellerName: bid.seller.sellerName,
      offerPricePerKg: Number(bid.offerPricePerKg),
      offerQuantityMt: Number(bid.offerQuantityMt),
      distanceKm: Number(bid.distanceKm || 0),
      deliveryCostPerKg: Number(bid.deliveryCostPerKg || 0),
      landedCostPerKg: Number(bid.landedCostPerKg || bid.offerPricePerKg),
    }));

    // Prepare buyer bids
    const preparedBuyerBids: BuyerBidData[] = buyerBids.map((bid: BuyerBidRecord) => ({
      id: bid.id,
      buyerId: bid.buyerId,
      buyerName: bid.buyer.buyerName,
      bidPricePerKg: Number(bid.bidPricePerKg),
      bidQuantityMt: Number(bid.bidQuantityMt),
    }));

    // Execute the auction engine
    const results = executeDoubleAuction(
      preparedSellerBids,
      preparedBuyerBids,
      Number(auction.tickSize)
    );

    // Update auction with results
    await (prisma.auction.update as any)({
      where: { id: auction.id },
      data: {
        status: results.clearingType === 'NO_CLEARING' ? 'CLOSED' : 'COMPLETED',
        clearingPrice: results.clearingPrice,
        clearingQuantityMt: results.clearingQuantityMt,
        tradeValue: results.totalTradeValue,
        totalSupplyMt: results.totalSupplyMt,
        totalDemandMt: results.totalDemandMt,
        unsoldSupplyMt: results.unsoldSupplyMt,
        clearingType: results.clearingType,
        endTime: new Date(),
        closedAt: new Date(),
      },
    });

    // Delete existing allocations for this auction
    await (prisma as any).allocation.deleteMany({
      where: { auctionId: auction.id },
    });

    // Save allocations
    for (const alloc of results.allocations) {
      await (prisma as any).allocation.create({
        data: {
          auctionId: auction.id,
          buyerId: alloc.buyerId,
          sellerId: alloc.sellerId,
          allocatedQuantityMt: alloc.allocatedQuantityMt,
          finalPricePerKg: alloc.finalPricePerKg,
          buyerBidPrice: alloc.buyerBidPrice,
          sellerOfferPrice: alloc.sellerOfferPrice,
          sellerLandedCost: alloc.sellerLandedCost,
          tradeValue: alloc.tradeValue,
          buyerSavings: alloc.buyerSavings,
          sellerBonus: alloc.sellerBonus,
        },
      });
    }

    // Update cumulative values on bids
    for (const sp of results.supplyPoints) {
      await (prisma as any).sellerBid.update({
        where: { id: sp.bidId },
        data: { cumulativeSupplyMt: sp.cumulativeSupply },
      });
    }

    for (const dp of results.demandPoints) {
      await (prisma as any).buyerBid.update({
        where: { id: dp.bidId },
        data: { cumulativeDemandMt: dp.cumulativeDemand },
      });
    }

    // Delete existing snapshots
    await (prisma as any).auctionSupplySnapshot.deleteMany({ where: { auctionId: auction.id } });
    await (prisma as any).auctionDemandSnapshot.deleteMany({ where: { auctionId: auction.id } });
    await (prisma as any).auctionGapSnapshot.deleteMany({ where: { auctionId: auction.id } });

    // Save supply snapshots
    for (const sp of results.supplyPoints) {
      await (prisma as any).auctionSupplySnapshot.create({
        data: {
          auctionId: auction.id,
          sellerId: sp.sellerId,
          sellerName: sp.sellerName,
          price: sp.offerPrice,
          quantity: sp.quantity,
          cumulativeSupply: sp.cumulativeSupply,
          landedCost: sp.landedCost,
          deliveryCost: sp.deliveryCost,
        },
      });
    }

    // Save demand snapshots
    for (const dp of results.demandPoints) {
      await (prisma as any).auctionDemandSnapshot.create({
        data: {
          auctionId: auction.id,
          buyerId: dp.buyerId,
          buyerName: dp.buyerName,
          price: dp.bidPrice,
          quantity: dp.quantity,
          cumulativeDemand: dp.cumulativeDemand,
        },
      });
    }

    // Save gap snapshots
    for (const gp of results.gapPoints) {
      await (prisma as any).auctionGapSnapshot.create({
        data: {
          auctionId: auction.id,
          rowIndex: gp.index,
          price: gp.price,
          supply: gp.cumulativeSupply,
          demand: gp.cumulativeDemand,
          gap: gp.gap,
        },
      });
    }

    // Create auction result record (immutable audit trail)
    await (prisma as any).auctionResult.create({
      data: {
        auctionId: auction.id,
        clearingPrice: results.clearingPrice,
        clearingQuantityMt: results.clearingQuantityMt,
        tradeValue: results.totalTradeValue,
        clearingType: results.clearingType,
        totalSupplyMt: results.totalSupplyMt,
        totalDemandMt: results.totalDemandMt,
        unsoldSupplyMt: results.unsoldSupplyMt,
        unsoldDemandMt: results.unsoldDemandMt,
        participatingBuyers: results.eligibleBuyerCount,
        participatingSellers: results.eligibleSellerCount,
        resultJson: {
          clearingPrice: results.clearingPrice,
          clearingQuantityMt: results.clearingQuantityMt,
          clearingType: results.clearingType,
          totalTradeValue: results.totalTradeValue,
          totalSupplyMt: results.totalSupplyMt,
          totalDemandMt: results.totalDemandMt,
          unsoldSupplyMt: results.unsoldSupplyMt,
          unsoldDemandMt: results.unsoldDemandMt,
          allocations: results.allocations,
          supplyPoints: results.supplyPoints,
          demandPoints: results.demandPoints,
          gapPoints: results.gapPoints,
          shouldReauction: results.shouldReauction,
          reauctionReason: results.reauctionReason,
        },
      },
    });

    // Handle re-auction if needed
    let reauctionId = null;
    if (results.shouldReauction) {
      const leftovers = getLeftoverQuantities(results.supplyPoints, results.allocations);
      
      // Create new re-auction
      const reauction = await (prisma.auction.create as any)({
        data: {
          status: 'DRAFT',
          tickSize: auction.tickSize,
          reauctionCount: ((auction as any).reauctionCount || 0) + 1,
          parentAuctionId: auction.id,
        },
      });

      reauctionId = reauction.id;

      // Carry forward leftover seller bids
      for (const leftover of leftovers) {
        // Find original bid to get distance info
        const originalBid = sellerBids.find((b: SellerBidRecord) => b.sellerId === leftover.sellerId);
        
        await (prisma as any).sellerBid.create({
          data: {
            auctionId: reauction.id,
            sellerId: leftover.sellerId,
            offerPricePerKg: leftover.offerPrice,
            offerQuantityMt: leftover.leftoverQuantity,
            distanceKm: originalBid?.distanceKm || 0,
            deliveryCostPerKg: originalBid?.deliveryCostPerKg || 0,
            landedCostPerKg: originalBid?.landedCostPerKg || leftover.offerPrice,
          },
        });
      }

      // Update auction status to REAUCTION
      await (prisma.auction.update as any)({
        where: { id: auction.id },
        data: { status: 'REAUCTION' },
      });
    }

    return NextResponse.json({
      success: true,
      auctionId: auction.id,
      results: {
        clearingPrice: results.clearingPrice,
        clearingQuantityMt: results.clearingQuantityMt,
        clearingType: results.clearingType,
        totalTradeValue: results.totalTradeValue,
        totalSupplyMt: results.totalSupplyMt,
        totalDemandMt: results.totalDemandMt,
        unsoldSupplyMt: results.unsoldSupplyMt,
        unsoldDemandMt: results.unsoldDemandMt,
        eligibleBuyerCount: results.eligibleBuyerCount,
        eligibleSellerCount: results.eligibleSellerCount,
        allocationsCount: results.allocations.length,
        shouldReauction: results.shouldReauction,
        reauctionReason: results.reauctionReason,
        reauctionId,
      },
    });
  } catch (error) {
    console.error('Error ending auction:', error);
    return NextResponse.json({ error: 'Failed to end auction' }, { status: 500 });
  }
}
