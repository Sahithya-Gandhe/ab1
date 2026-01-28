import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const auction = await (prisma as any).auction.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json({ bids: [] });
    }

    // Cast to any to bypass TypeScript cache issues with Prisma client
    const db = prisma as any;

    // Find user first to get email
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ bids: [] });
    }

    // Find buyer by email
    const buyer = await db.buyer.findUnique({
      where: { email: user.email },
    });

    if (!buyer) {
      return NextResponse.json({ bids: [] });
    }

    // Get all buyer's bids for this auction
    const bids = await db.buyerBid.findMany({
      where: {
        auctionId: auction.id,
        buyerId: buyer.id,
      },
      orderBy: {
        bidPricePerKg: 'desc', // Sort by price descending
      },
    });

    if (!bids || bids.length === 0) {
      return NextResponse.json({ bids: [] });
    }

    // Transform to include all bids with distance slab info
    const transformedBids = bids.map((bid: any) => ({
      id: bid.id,
      price: Number(bid.bidPricePerKg),
      quantity: Number(bid.bidQuantityMt),
      distanceSlabId: bid.distanceSlabId,
      distanceSlabMin: bid.distanceSlabMin ? Number(bid.distanceSlabMin) : null,
      distanceSlabMax: bid.distanceSlabMax ? Number(bid.distanceSlabMax) : null,
      createdAt: bid.createdAt,
    }));

    // Also provide legacy format for backward compatibility
    const response = {
      bids: transformedBids,
      // Legacy format
      id: bids[0]?.id,
      price1: bids[0] ? Number(bids[0].bidPricePerKg) : null,
      quantity1: bids[0] ? Number(bids[0].bidQuantityMt) : null,
      price2: bids[1] ? Number(bids[1].bidPricePerKg) : null,
      quantity2: bids[1] ? Number(bids[1].bidQuantityMt) : null,
      price3: bids[2] ? Number(bids[2].bidPricePerKg) : null,
      quantity3: bids[2] ? Number(bids[2].bidQuantityMt) : null,
      createdAt: bids[0]?.createdAt,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching bid:', error);
    return NextResponse.json({ bids: [] }, { status: 200 }); // Return empty instead of error
  }
}
