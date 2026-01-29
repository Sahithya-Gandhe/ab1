import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface BidInput {
  distanceSlabId?: string;
  price: number;
  quantity: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, bids, price1, quantity1, price2, quantity2, price3, quantity3 } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user ID' },
        { status: 400 }
      );
    }

    // Get active auction
    const auction = await (prisma as any).auction.findFirst({
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

    // Find user first to get email
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Find buyer by email
    const buyer = await db.buyer.findUnique({
      where: { email: user.email },
    });

    if (!buyer) {
      return NextResponse.json(
        { error: 'Buyer not found' },
        { status: 404 }
      );
    }

    // Delete all existing bids for this buyer in this auction
    await db.buyerBid.deleteMany({
      where: {
        auctionId: auction.id,
        buyerId: buyer.id,
      },
    });

    // Prepare bids array
    let bidsToCreate: any[] = [];

    // Handle new format (array of bids with distance slabs)
    if (bids && Array.isArray(bids)) {
      bidsToCreate = bids
        .filter((bid: BidInput) => bid.price && bid.quantity && bid.quantity > 0)
        .map((bid: BidInput) => {
          const bidData: any = {
            auctionId: auction.id,
            buyerId: buyer.id,
            bidPricePerKg: bid.price,
            bidQuantityMt: bid.quantity,
          };
          
          // Only include distanceSlabId if it's provided and not null
          if (bid.distanceSlabId) {
            bidData.distanceSlabId = bid.distanceSlabId;
          }
          
          return bidData;
        });
    }
    // Handle legacy format (price1/quantity1, price2/quantity2, price3/quantity3)
    else if (price1 && quantity1) {
      bidsToCreate.push({
        auctionId: auction.id,
        buyerId: buyer.id,
        bidPricePerKg: parseFloat(price1),
        bidQuantityMt: parseFloat(quantity1),
      });

      if (price2 && quantity2) {
        bidsToCreate.push({
          auctionId: auction.id,
          buyerId: buyer.id,
          bidPricePerKg: parseFloat(price2),
          bidQuantityMt: parseFloat(quantity2),
        });
      }

      if (price3 && quantity3) {
        bidsToCreate.push({
          auctionId: auction.id,
          buyerId: buyer.id,
          bidPricePerKg: parseFloat(price3),
          bidQuantityMt: parseFloat(quantity3),
        });
      }
    }

    if (bidsToCreate.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid bid is required' },
        { status: 400 }
      );
    }

    // Create all bids
    const createdBids = await Promise.all(
      bidsToCreate.map(bidData => db.buyerBid.create({ data: bidData }))
    );

    // Return response with all created bids
    return NextResponse.json({
      success: true,
      bidsCount: createdBids.length,
      bids: createdBids.map((bid: any) => ({
        id: bid.id,
        price: Number(bid.bidPricePerKg),
        quantity: Number(bid.bidQuantityMt),
        distanceSlabId: bid.distanceSlabId,
      })),
    });
  } catch (error) {
    console.error('Error submitting bid:', error);
    return NextResponse.json(
      { error: 'Failed to submit bid', details: String(error) },
      { status: 500 }
    );
  }
}
