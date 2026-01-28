import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, price1, quantity1, price2, quantity2, price3, quantity3 } = body;

    if (!userId || !price1 || !quantity1) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get active auction
    const auction = await prisma.auction.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json(
        { error: 'No active auction' },
        { status: 400 }
      );
    }

    // Cast to any to bypass TypeScript cache issues with Prisma client
    const db = prisma as any;

    // Check if user already has a bid
    const existingBid = await db.bid.findFirst({
      where: {
        auctionId: auction.id,
        userId,
      },
      include: {
        splits: true,
      },
    });

    if (existingBid) {
      // Delete existing splits
      await db.bidSplit.deleteMany({
        where: { bidId: existingBid.id },
      });

      // Create new splits
      const splitsData = [];
      if (price1 && quantity1) {
        splitsData.push({ bidId: existingBid.id, price: price1, quantity: quantity1 });
      }
      if (price2 && quantity2) {
        splitsData.push({ bidId: existingBid.id, price: price2, quantity: quantity2 });
      }
      if (price3 && quantity3) {
        splitsData.push({ bidId: existingBid.id, price: price3, quantity: quantity3 });
      }

      await db.bidSplit.createMany({
        data: splitsData,
      });

      // Return updated bid with splits
      const updated = await db.bid.findUnique({
        where: { id: existingBid.id },
        include: { splits: true },
      });

      // Transform for frontend
      return NextResponse.json({
        ...updated,
        price1: updated.splits[0]?.price ? Number(updated.splits[0].price) : null,
        quantity1: updated.splits[0]?.quantity ? Number(updated.splits[0].quantity) : null,
        price2: updated.splits[1]?.price ? Number(updated.splits[1].price) : null,
        quantity2: updated.splits[1]?.quantity ? Number(updated.splits[1].quantity) : null,
        price3: updated.splits[2]?.price ? Number(updated.splits[2].price) : null,
        quantity3: updated.splits[2]?.quantity ? Number(updated.splits[2].quantity) : null,
      });
    } else {
      // Create new bid with splits
      const bid = await db.bid.create({
        data: {
          auctionId: auction.id,
          userId,
          splits: {
            create: [
              ...(price1 && quantity1 ? [{ price: price1, quantity: quantity1 }] : []),
              ...(price2 && quantity2 ? [{ price: price2, quantity: quantity2 }] : []),
              ...(price3 && quantity3 ? [{ price: price3, quantity: quantity3 }] : []),
            ],
          },
        },
        include: {
          splits: true,
        },
      });

      // Transform for frontend
      return NextResponse.json({
        ...bid,
        price1: bid.splits[0]?.price ? Number(bid.splits[0].price) : null,
        quantity1: bid.splits[0]?.quantity ? Number(bid.splits[0].quantity) : null,
        price2: bid.splits[1]?.price ? Number(bid.splits[1].price) : null,
        quantity2: bid.splits[1]?.quantity ? Number(bid.splits[1].quantity) : null,
        price3: bid.splits[2]?.price ? Number(bid.splits[2].price) : null,
        quantity3: bid.splits[2]?.quantity ? Number(bid.splits[2].quantity) : null,
      });
    }
  } catch (error) {
    console.error('Error submitting bid:', error);
    return NextResponse.json(
      { error: 'Failed to submit bid' },
      { status: 500 }
    );
  }
}
