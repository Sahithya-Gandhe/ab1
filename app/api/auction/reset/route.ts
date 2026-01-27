import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Use 'any' cast to bypass TypeScript cache issues with Prisma client
const db = prisma as any;

export async function POST(request: NextRequest) {
  try {
    const auction = await db.auction.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json({ error: 'No auction found' }, { status: 404 });
    }

    // Delete all bids (cascades to BidSplit)
    await db.bid.deleteMany({
      where: { auctionId: auction.id },
    });

    // Delete allocations from new tables
    await db.sellerAllocation.deleteMany({
      where: { auctionId: auction.id },
    });
    await db.buyerAllocation.deleteMany({
      where: { auctionId: auction.id },
    });

    // Delete snapshots
    await db.auctionSupplySnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    await db.auctionDemandSnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    await db.auctionGapSnapshot.deleteMany({
      where: { auctionId: auction.id },
    });

    // Reset auction
    await db.auction.update({
      where: { id: auction.id },
      data: {
        status: 'PENDING',
        startTime: null,
        endTime: null,
        clearingPrice: null,
        clearingQuantity: null,
        totalTradeValue: null,
        clearingType: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resetting auction:', error);
    return NextResponse.json({ error: 'Failed to reset auction' }, { status: 500 });
  }
}
