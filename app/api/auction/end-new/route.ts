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
  seller: { sellerName: string };
}

interface BuyerSellerDistanceRecord {
  id: string;
  buyerId: string;
  sellerId: string;
  distanceKm: any;
  costPerKg: any;
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

    // Fetch buyer-seller distances (pre-computed Haversine distances)
    const buyerSellerDistances = await (prisma as any).buyerSellerDistance.findMany({
      where: { auctionId: auction.id },
    }) as BuyerSellerDistanceRecord[];

    // Create distance lookup map for O(1) access
    const distanceMap = new Map<string, BuyerSellerDistanceRecord>();
    buyerSellerDistances.forEach(d => {
      distanceMap.set(`${d.buyerId}_${d.sellerId}`, d);
    });

    // Fetch distance slabs for delivery cost calculation
    const distanceSlabs = await (prisma as any).distanceSlab.findMany() as DistanceSlabRecord[];
    const slabData: DistanceSlabData[] = distanceSlabs.map((s: DistanceSlabRecord) => ({
      minKm: Number(s.minKm),
      maxKm: Number(s.maxKm),
      costPerKg: Number(s.costPerKg),
    }));

    // Prepare seller bids (distance is buyer-specific, not stored here)
    const preparedSellerBids: SellerBidData[] = sellerBids.map((bid: SellerBidRecord) => ({
      id: bid.id,
      sellerId: bid.sellerId,
      sellerName: bid.seller.sellerName,
      offerPricePerKg: Number(bid.offerPricePerKg),
      offerQuantityMt: Number(bid.offerQuantityMt),
      distanceKm: 0, // Not used in clearing (price-only)
      deliveryCostPerKg: 0, // Not used in clearing
      landedCostPerKg: Number(bid.offerPricePerKg), // Base price only
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

    // Save allocations with buyer-specific landing costs
    for (const alloc of results.allocations) {
      // Get buyer-specific distance and delivery cost
      const distance = distanceMap.get(`${alloc.buyerId}_${alloc.sellerId}`);
      const deliveryCost = distance ? Number(distance.costPerKg) : 0;
      const buyerLandedCost = alloc.finalPricePerKg + deliveryCost;

      await (prisma as any).allocation.create({
        data: {
          auctionId: auction.id,
          buyerId: alloc.buyerId,
          sellerId: alloc.sellerId,
          allocatedQuantityMt: alloc.allocatedQuantityMt,
          finalPricePerKg: alloc.finalPricePerKg, // Clearing price (what buyer pays seller)
          buyerBidPrice: alloc.buyerBidPrice,
          sellerOfferPrice: alloc.sellerOfferPrice,
          sellerLandedCost: buyerLandedCost, // Rename misleading: this is buyer's total cost
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
    await (prisma as any).marketDemand.deleteMany({ where: { auctionId: auction.id } });
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

    // Save MARKET demand (price-aggregated, used for clearing)
    for (const md of results.marketDemand) {
      await (prisma as any).marketDemand.create({
        data: {
          auctionId: auction.id,
          pricePerKg: md.pricePerKg,
          totalDemandMt: md.totalDemandMt,
          cumulativeDemandMt: md.cumulativeDemandMt,
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

    // Handle re-auction if more than 70% supply unsold
    let reauctionId = null;
    const unsoldPercent = results.totalSupplyMt > 0 
      ? (results.unsoldSupplyMt / results.totalSupplyMt) * 100 
      : 0;
    const shouldReauction = unsoldPercent > 70;
    
    if (shouldReauction) {
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

      // Carry forward leftover seller bids (distance is buyer-relative, not copied)
      for (const leftover of leftovers) {
        await (prisma as any).sellerBid.create({
          data: {
            auctionId: reauction.id,
            sellerId: leftover.sellerId,
            offerPricePerKg: leftover.offerPrice,
            offerQuantityMt: leftover.leftoverQuantity,
          },
        });
      }

      // Copy buyer-seller distances to re-auction
      for (const dist of buyerSellerDistances) {
        await (prisma as any).buyerSellerDistance.create({
          data: {
            auctionId: reauction.id,
            buyerId: dist.buyerId,
            sellerId: dist.sellerId,
            distanceKm: dist.distanceKm,
            slabId: (dist as any).slabId,
            costPerKg: dist.costPerKg,
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
        unsoldPercent: unsoldPercent,
        shouldReauction: shouldReauction,
        reauctionReason: shouldReauction ? `${unsoldPercent.toFixed(1)}% of supply unsold (threshold: 70%)` : null,
        reauctionId,
      },
    });
  } catch (error) {
    console.error('Error ending auction:', error);
    return NextResponse.json({ error: 'Failed to end auction' }, { status: 500 });
  }
}
