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

    // Fetch seller allocations
    const sellerAllocations = await db.sellerAllocation.findMany({
      where: { auctionId: auction.id },
      include: { seller: true },
      orderBy: { reservePrice: 'asc' },
    });

    // Fetch buyer allocations
    const buyerAllocations = await db.buyerAllocation.findMany({
      where: { auctionId: auction.id },
      include: { buyer: true, seller: true },
    });

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

    // Convert to API response format
    const allocations = sellerAllocations.map((a: any) => ({
      sellerId: a.sellerId,
      sellerName: a.sellerName,
      quantity: Number(a.quantity),
      reservePrice: Number(a.reservePrice),
      clearingPrice: Number(a.clearingPrice),
      tradeValue: Number(a.tradeValue),
      bonus: Number(a.bonus),
    }));

    const supplyPoints = supplySnapshots.map((s: any) => ({
      sellerId: s.sellerId,
      sellerName: s.sellerName,
      price: Number(s.price),
      quantity: Number(s.quantity),
      cumulativeQuantity: Number(s.cumulativeSupply),
    }));

    const demandPoints = demandSnapshots.map((d: any) => ({
      userId: d.buyerId,
      userName: d.buyerName,
      price: Number(d.price),
      quantity: Number(d.quantity),
      cumulativeQuantity: Number(d.cumulativeDemand),
    }));

    const gapPoints = gapSnapshots.map((g: any, index: number) => ({
      index,
      price: Number(g.price),
      cumulativeSupply: Number(g.supply),
      cumulativeDemand: Number(g.demand),
      gap: Number(g.gap),
    }));

    // Group buyer allocations by buyer
    const buyerAllocMap = new Map<string, any>();
    for (const ba of buyerAllocations) {
      if (!buyerAllocMap.has(ba.buyerId)) {
        buyerAllocMap.set(ba.buyerId, {
          userId: ba.buyerId,
          userName: ba.buyerName,
          totalQuantity: 0,
          allocations: [],
        });
      }
      const buyer = buyerAllocMap.get(ba.buyerId);
      buyer.totalQuantity += Number(ba.quantity);
      buyer.allocations.push({
        sellerId: ba.sellerId,
        sellerName: ba.sellerName,
        quantity: Number(ba.quantity),
        price: Number(ba.clearingPrice),
      });
    }

    return NextResponse.json({
      clearingPrice: Number(auction.clearingPrice),
      clearingQuantity: Number(auction.clearingQuantity),
      totalTradeValue: Number(auction.totalTradeValue),
      clearingType: auction.clearingType || 'EXACT',
      auctionId: auction.id,
      startTime: auction.startTime,
      endTime: auction.endTime,
      tickSize: Number(auction.tickSize),
      allocations,
      buyerAllocations: Array.from(buyerAllocMap.values()),
      supplyPoints,
      demandPoints,
      gapPoints,
    });
  } catch (error) {
    console.error('Error fetching results:', error);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}
