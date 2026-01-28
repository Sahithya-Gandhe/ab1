import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auction = await prisma.auction.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json([]);
    }

    // Cast to any to bypass TypeScript cache issues with Prisma client
    const db = prisma as any;

    const bids = await db.bid.findMany({
      where: { auctionId: auction.id },
      include: { 
        user: true,
        splits: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform bids to include price1/quantity1 format for frontend compatibility
    const transformed = bids.map((bid: any) => ({
      ...bid,
      price1: bid.splits[0]?.price ? Number(bid.splits[0].price) : null,
      quantity1: bid.splits[0]?.quantity ? Number(bid.splits[0].quantity) : null,
      price2: bid.splits[1]?.price ? Number(bid.splits[1].price) : null,
      quantity2: bid.splits[1]?.quantity ? Number(bid.splits[1].quantity) : null,
      price3: bid.splits[2]?.price ? Number(bid.splits[2].price) : null,
      quantity3: bid.splits[2]?.quantity ? Number(bid.splits[2].quantity) : null,
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Error fetching bids:', error);
    return NextResponse.json({ error: 'Failed to fetch bids' }, { status: 500 });
  }
}
