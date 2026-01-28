import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Use 'any' cast to bypass TypeScript cache issues with Prisma client
const db = prisma as any;

export async function GET() {
  try {
    const auction = await db.auction.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json({ error: 'No completed auction found' }, { status: 404 });
    }

    // Fetch all allocations
    const allocations = await db.allocation.findMany({
      where: { auctionId: auction.id },
      include: { 
        buyer: true,
        seller: true,
      },
      orderBy: { finalPricePerKg: 'asc' },
    });

    // Group allocations by seller for summary
    const sellerAllocMap = new Map<string, any>();
    const buyerAllocMap = new Map<string, any>();
    
    for (const alloc of allocations) {
      // Seller summary
      const sellerId = alloc.seller.id;
      if (!sellerAllocMap.has(sellerId)) {
        sellerAllocMap.set(sellerId, {
          id: sellerId,
          sellerName: alloc.seller.sellerName,
          location: alloc.seller.location,
          totalQuantity: 0,
          tradeValue: 0,
        });
      }
      const sellerData = sellerAllocMap.get(sellerId);
      sellerData.totalQuantity += Number(alloc.allocatedQuantityMt);
      sellerData.tradeValue += Number(alloc.tradeValue || 0);
      
      // Buyer summary
      const buyerId = alloc.buyer.id;
      if (!buyerAllocMap.has(buyerId)) {
        buyerAllocMap.set(buyerId, {
          id: buyerId,
          buyerName: alloc.buyer.buyerName,
          organization: alloc.buyer.organization,
          totalQuantity: 0,
          tradeValue: 0,
          allocations: [],
        });
      }
      const buyerData = buyerAllocMap.get(buyerId);
      buyerData.totalQuantity += Number(alloc.allocatedQuantityMt);
      buyerData.tradeValue += Number(alloc.tradeValue || 0);
      buyerData.allocations.push({
        sellerName: alloc.seller.sellerName,
        quantity: Number(alloc.allocatedQuantityMt),
        price: Number(alloc.finalPricePerKg),
      });
    }
    
    const sellerAllocations = Array.from(sellerAllocMap.values());
    const buyerAllocations = Array.from(buyerAllocMap.values());

    // Fetch supply snapshots
    const supplySnapshots = await db.auctionSupplySnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { price: 'asc' },
    });

    // Fetch demand snapshots
    const demandSnapshots = await db.auctionDemandSnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { price: 'desc' },
    });

    // Fetch gap snapshots
    const gapSnapshots = await db.auctionGapSnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { price: 'asc' },
    });

    // Convert snapshots to API response format
    const supplyPoints = supplySnapshots.map((s: any) => ({
      sellerId: s.sellerId,
      sellerName: s.sellerName,
      price: Number(s.price),
      quantity: Number(s.quantity),
      cumulativeQuantity: Number(s.cumulativeSupply),
      landedCost: Number(s.landedCost || s.price),
      deliveryCost: Number(s.deliveryCost || 0),
    }));

    const demandPoints = demandSnapshots.map((d: any) => ({
      buyerId: d.buyerId,
      buyerName: d.buyerName,
      price: Number(d.price),
      quantity: Number(d.quantity),
      cumulativeQuantity: Number(d.cumulativeDemand),
    }));

    const gapPoints = gapSnapshots.map((g: any, index: number) => ({
      index: g.rowIndex ?? index,
      price: Number(g.price),
      cumulativeSupply: Number(g.supply),
      cumulativeDemand: Number(g.demand),
      gap: Number(g.gap),
    }));

    return NextResponse.json({
      clearingPrice: Number(auction.clearingPrice),
      clearingQuantity: Number(auction.clearingQuantityMt),
      totalTradeValue: Number(auction.tradeValue),
      clearingType: auction.clearingType || 'EXACT',
      auctionId: auction.id,
      startTime: auction.startTime,
      endTime: auction.endTime,
      tickSize: Number(auction.tickSize),
      sellerAllocations,
      buyerAllocations,
      supplyPoints,
      demandPoints,
      gapPoints,
    });
  } catch (error) {
    console.error('Error fetching results:', error);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}
