import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Type definitions for records
interface AuctionRecord {
  id: string;
  status: string;
  clearingPrice?: any;
  clearingQuantityMt?: any;
  tradeValue?: any;
  totalSupplyMt?: any;
  totalDemandMt?: any;
  unsoldSupplyMt?: any;
  clearingType?: string;
  reauctionCount?: number;
  parentAuctionId?: string;
  tickSize: any;
  startTime?: Date;
  endTime?: Date;
  closedAt?: Date;
  createdAt: Date;
}

interface AllocationRecord {
  id: string;
  auctionId: string;
  buyerId: string;
  sellerId: string;
  allocatedQuantityMt: any;
  finalPricePerKg: any;
  buyerBidPrice?: any;
  sellerOfferPrice?: any;
  sellerLandedCost?: any;
  tradeValue?: any;
  buyerSavings?: any;
  sellerBonus?: any;
  buyer: { buyerName: string };
  seller: { sellerName: string };
}

interface SupplySnapshotRecord {
  id: string;
  sellerId: string;
  sellerName: string;
  price: any;
  quantity: any;
  cumulativeSupply: any;
  landedCost?: any;
  deliveryCost?: any;
}

interface DemandSnapshotRecord {
  id: string;
  pricePerKg: any;
  totalDemandMt: any;
  cumulativeDemandMt: any;
}

interface GapSnapshotRecord {
  id: string;
  rowIndex: number;
  price: any;
  supply: any;
  demand: any;
  gap: any;
}

/**
 * GET /api/auction/results-new
 * Fetch comprehensive auction results for the new schema
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const auctionId = searchParams.get('auctionId');

    // Find the auction
    let auction: AuctionRecord | null;
    if (auctionId) {
      auction = await prisma.auction.findUnique({
        where: { id: auctionId },
      }) as AuctionRecord | null;
    } else {
      // Get most recent completed auction
      auction = await (prisma.auction.findFirst as any)({
        where: {
          OR: [
            { status: 'COMPLETED' },
            { status: 'CLOSED' },
            { status: 'REAUCTION' },
          ],
        },
        orderBy: { closedAt: 'desc' },
      }) as AuctionRecord | null;
    }

    if (!auction) {
      return NextResponse.json({ error: 'No completed auction found' }, { status: 404 });
    }

    // Fetch allocations
    const allocations = await (prisma as any).allocation.findMany({
      where: { auctionId: auction.id },
      include: {
        buyer: true,
        seller: true,
      },
      orderBy: [
        { finalPricePerKg: 'desc' },
        { allocatedQuantityMt: 'desc' },
      ],
    }) as AllocationRecord[];

    // Fetch buyer-seller distances for landing cost calculation
    const buyerSellerDistances = await (prisma as any).buyerSellerDistance.findMany({
      where: { auctionId: auction.id },
    });

    // Create distance lookup map
    const distanceMap = new Map();
    buyerSellerDistances.forEach((d: any) => {
      distanceMap.set(`${d.buyerId}_${d.sellerId}`, {
        distanceKm: Number(d.distanceKm),
        deliveryCost: Number(d.costPerKg),
      });
    });

    // Fetch supply snapshots
    const supplySnapshots = await (prisma as any).auctionSupplySnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { cumulativeSupply: 'asc' },
    }) as SupplySnapshotRecord[];

    // Fetch market demand (price-aggregated demand curve used for clearing)
    const demandSnapshots = await (prisma as any).marketDemand.findMany({
      where: { auctionId: auction.id },
      orderBy: { pricePerKg: 'desc' },
    }) as DemandSnapshotRecord[];

    // Fetch gap snapshots
    const gapSnapshots = await (prisma as any).auctionGapSnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { rowIndex: 'asc' },
    }) as GapSnapshotRecord[];

    // Group allocations by buyer
    const buyerAllocations = new Map<string, {
      buyerId: string;
      buyerName: string;
      totalQuantity: number;
      totalValue: number;
      totalSavings: number;
      allocations: any[];
    }>();

    for (const alloc of allocations) {
      const key = alloc.buyerId;
      if (!buyerAllocations.has(key)) {
        buyerAllocations.set(key, {
          buyerId: alloc.buyerId,
          buyerName: alloc.buyer.buyerName,
          totalQuantity: 0,
          totalValue: 0,
          totalSavings: 0,
          allocations: [],
        });
      }
      const buyer = buyerAllocations.get(key)!;
      buyer.totalQuantity += Number(alloc.allocatedQuantityMt);
      buyer.totalValue += Number(alloc.tradeValue || 0);
      buyer.totalSavings += Number(alloc.buyerSavings || 0);
      
      const distance = distanceMap.get(`${alloc.buyerId}_${alloc.sellerId}`) || { distanceKm: 0, deliveryCost: 0 };
      const landedCost = Number(alloc.finalPricePerKg) + distance.deliveryCost;
      
      buyer.allocations.push({
        sellerId: alloc.sellerId,
        sellerName: alloc.seller.sellerName,
        quantity: Number(alloc.allocatedQuantityMt),
        price: Number(alloc.finalPricePerKg),
        bidPrice: Number(alloc.buyerBidPrice),
        distanceKm: distance.distanceKm,
        deliveryCost: distance.deliveryCost,
        landedCost: landedCost,
        savings: Number(alloc.buyerSavings || 0),
      });
    }

    // Group allocations by seller
    const sellerAllocations = new Map<string, {
      sellerId: string;
      sellerName: string;
      totalQuantity: number;
      totalValue: number;
      totalBonus: number;
      allocations: any[];
    }>();

    for (const alloc of allocations) {
      const key = alloc.sellerId;
      if (!sellerAllocations.has(key)) {
        sellerAllocations.set(key, {
          sellerId: alloc.sellerId,
          sellerName: alloc.seller.sellerName,
          totalQuantity: 0,
          totalValue: 0,
          totalBonus: 0,
          allocations: [],
        });
      }
      const seller = sellerAllocations.get(key)!;
      seller.totalQuantity += Number(alloc.allocatedQuantityMt);
      seller.totalValue += Number(alloc.tradeValue || 0);
      seller.totalBonus += Number(alloc.sellerBonus || 0);
      seller.allocations.push({
        buyerId: alloc.buyerId,
        buyerName: alloc.buyer.buyerName,
        quantity: Number(alloc.allocatedQuantityMt),
        price: Number(alloc.finalPricePerKg),
        offerPrice: Number(alloc.sellerOfferPrice),
        bonus: Number(alloc.sellerBonus || 0),
      });
    }

    // Build response
    return NextResponse.json({
      auction: {
        id: auction.id,
        status: auction.status,
        clearingPrice: Number(auction.clearingPrice || 0),
        clearingQuantityMt: Number(auction.clearingQuantityMt || 0),
        tradeValue: Number(auction.tradeValue || 0),
        totalSupplyMt: Number(auction.totalSupplyMt || 0),
        totalDemandMt: Number(auction.totalDemandMt || 0),
        unsoldSupplyMt: Number(auction.unsoldSupplyMt || 0),
        clearingType: auction.clearingType,
        tickSize: Number(auction.tickSize),
        reauctionCount: auction.reauctionCount,
        parentAuctionId: auction.parentAuctionId,
        createdAt: auction.createdAt,
        startTime: auction.startTime,
        endTime: auction.endTime,
        closedAt: auction.closedAt,
      },
      
      summary: {
        clearingPrice: Number(auction.clearingPrice || 0),
        clearingQuantityMt: Number(auction.clearingQuantityMt || 0),
        totalTradeValue: Number(auction.tradeValue || 0),
        totalSupplyMt: Number(auction.totalSupplyMt || 0),
        totalDemandMt: Number(auction.totalDemandMt || 0),
        unsoldSupplyMt: Number(auction.unsoldSupplyMt || 0),
        unsoldSupplyPercent: auction.totalSupplyMt && Number(auction.totalSupplyMt) > 0
          ? (Number(auction.unsoldSupplyMt || 0) / Number(auction.totalSupplyMt)) * 100
          : 0,
        participatingBuyers: buyerAllocations.size,
        participatingSellers: sellerAllocations.size,
        clearingType: auction.clearingType,
      },

      allocations: allocations.map(alloc => {
        const distance = distanceMap.get(`${alloc.buyerId}_${alloc.sellerId}`) || { distanceKm: 0, deliveryCost: 0 };
        const landedCost = Number(alloc.finalPricePerKg) + distance.deliveryCost;
        
        return {
          id: alloc.id,
          buyerId: alloc.buyerId,
          buyerName: alloc.buyer.buyerName,
          sellerId: alloc.sellerId,
          sellerName: alloc.seller.sellerName,
          allocatedQuantityMt: Number(alloc.allocatedQuantityMt),
          finalPricePerKg: Number(alloc.finalPricePerKg),
          buyerBidPrice: Number(alloc.buyerBidPrice || 0),
          sellerOfferPrice: Number(alloc.sellerOfferPrice || 0),
          sellerLandedCost: Number(alloc.sellerLandedCost || 0),
          distanceKm: distance.distanceKm,
          deliveryCostPerKg: distance.deliveryCost,
          landedCostPerKg: landedCost,
          tradeValue: Number(alloc.tradeValue || 0),
          buyerSavings: Number(alloc.buyerSavings || 0),
          sellerBonus: Number(alloc.sellerBonus || 0),
        };
      }),

      buyerAllocations: Array.from(buyerAllocations.values()),
      sellerAllocations: Array.from(sellerAllocations.values()),

      supplyPoints: supplySnapshots.map(sp => ({
        sellerId: sp.sellerId,
        sellerName: sp.sellerName,
        price: Number(sp.price),
        quantity: Number(sp.quantity),
        cumulativeSupply: Number(sp.cumulativeSupply),
        landedCost: Number(sp.landedCost || sp.price),
        deliveryCost: Number(sp.deliveryCost || 0),
      })),

      demandPoints: demandSnapshots.map(dp => ({
        pricePerKg: Number(dp.pricePerKg),
        totalDemandMt: Number(dp.totalDemandMt),
        cumulativeDemandMt: Number(dp.cumulativeDemandMt),
      })),

      gapPoints: gapSnapshots.map(gp => ({
        index: gp.rowIndex,
        price: Number(gp.price),
        cumulativeSupply: Number(gp.supply),
        cumulativeDemand: Number(gp.demand),
        gap: Number(gp.gap),
      })),

    });
  } catch (error) {
    console.error('Error fetching auction results:', error);
    return NextResponse.json({ error: 'Failed to fetch auction results' }, { status: 500 });
  }
}
