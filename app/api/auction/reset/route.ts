import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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

    // Delete buyer bids
    await db.buyerBid.deleteMany({
      where: { auctionId: auction.id },
    });

    // Delete allocations
    await db.allocation.deleteMany({
      where: { auctionId: auction.id },
    });

    // Delete snapshots
    await db.auctionSupplySnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    await db.marketDemand.deleteMany({
      where: { auctionId: auction.id },
    });
    await db.auctionGapSnapshot.deleteMany({
      where: { auctionId: auction.id },
    });

    // Reset auction status but keep seller bids
    await db.auction.update({
      where: { id: auction.id },
      data: {
        status: 'PENDING',
        startTime: null,
        endTime: null,
        closedAt: null,
        clearingPrice: null,
        clearingQuantityMt: null,
        tradeValue: null,
        totalSupplyMt: null,
        totalDemandMt: null,
        unsoldSupplyMt: null,
        clearingType: null,
      },
    });

    return NextResponse.json({ success: true, message: 'Auction reset successfully' });
  } catch (error) {
    console.error('Error resetting auction:', error);
    return NextResponse.json({ error: 'Failed to reset auction', details: String(error) }, { status: 500 });
  }
}
