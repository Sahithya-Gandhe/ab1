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

    const auction = await prisma.auction.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json(null);
    }

    // Cast to any to bypass TypeScript cache issues with Prisma client
    const db = prisma as any;

    const bid = await db.bid.findFirst({
      where: {
        auctionId: auction.id,
        userId,
      },
      include: { 
        user: true,
        splits: true,
      },
    });

    if (!bid) {
      return NextResponse.json(null);
    }

    // Transform bid splits back to price1/quantity1 format for frontend compatibility
    const transformed = {
      ...bid,
      price1: bid.splits[0]?.price ? Number(bid.splits[0].price) : null,
      quantity1: bid.splits[0]?.quantity ? Number(bid.splits[0].quantity) : null,
      price2: bid.splits[1]?.price ? Number(bid.splits[1].price) : null,
      quantity2: bid.splits[1]?.quantity ? Number(bid.splits[1].quantity) : null,
      price3: bid.splits[2]?.price ? Number(bid.splits[2].price) : null,
      quantity3: bid.splits[2]?.quantity ? Number(bid.splits[2].quantity) : null,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Error fetching bid:', error);
    return NextResponse.json({ error: 'Failed to fetch bid' }, { status: 500 });
  }
}
