import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Type definitions for Prisma results
interface BuyerBidRecord {
  id: string;
  auctionId: string;
  buyerId: string;
  bidPricePerKg: any;
  bidQuantityMt: any;
  cumulativeDemandMt: any;
  createdAt: Date;
  updatedAt: Date;
  buyer: { buyerName: string; creditLimit?: any };
  auction?: { status: string; tickSize: any };
}

interface BuyerRecord {
  id: string;
  buyerName: string;
  organization?: string;
  creditLimit?: any;
  email: string;
}

/**
 * GET /api/buyer-bids
 * Fetch all buyer bids for a specific auction
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const auctionId = searchParams.get('auctionId');
    const buyerId = searchParams.get('buyerId');

    let whereClause: any = {};
    if (auctionId) whereClause.auctionId = auctionId;
    if (buyerId) whereClause.buyerId = buyerId;

    const bids = await (prisma as any).buyerBid.findMany({
      where: whereClause,
      include: {
        buyer: true,
        auction: true,
      },
      orderBy: [
        { bidPricePerKg: 'desc' },
        { bidQuantityMt: 'desc' },
      ],
    }) as BuyerBidRecord[];

    return NextResponse.json(bids.map((bid: BuyerBidRecord) => ({
      id: bid.id,
      auctionId: bid.auctionId,
      buyerId: bid.buyerId,
      buyerName: bid.buyer.buyerName,
      bidPricePerKg: Number(bid.bidPricePerKg),
      bidQuantityMt: Number(bid.bidQuantityMt),
      cumulativeDemandMt: bid.cumulativeDemandMt ? Number(bid.cumulativeDemandMt) : null,
      createdAt: bid.createdAt,
    })));
  } catch (error) {
    console.error('Error fetching buyer bids:', error);
    return NextResponse.json({ error: 'Failed to fetch buyer bids' }, { status: 500 });
  }
}

/**
 * POST /api/buyer-bids
 * Create a new buyer bid (price-quantity pair)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { auctionId, buyerId, bidPricePerKg, bidQuantityMt } = body;

    // Validate required fields
    if (!auctionId || !buyerId || bidPricePerKg === undefined || bidQuantityMt === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: auctionId, buyerId, bidPricePerKg, bidQuantityMt' },
        { status: 400 }
      );
    }

    // Validate values
    if (bidPricePerKg <= 0) {
      return NextResponse.json({ error: 'Bid price must be positive' }, { status: 400 });
    }

    if (bidQuantityMt <= 0) {
      return NextResponse.json({ error: 'Bid quantity must be positive' }, { status: 400 });
    }

    // Validate auction exists and is active
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    if (auction.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Bids can only be submitted to active auctions' },
        { status: 400 }
      );
    }

    // Validate tick size
    const tickSize = Number(auction.tickSize);
    const priceRemainder = (bidPricePerKg * 10000) % (tickSize * 10000);
    if (Math.abs(priceRemainder) > 0.001) {
      return NextResponse.json(
        { error: `Bid price must be a multiple of tick size ${tickSize}` },
        { status: 400 }
      );
    }

    // Validate buyer exists
    const buyer = await (prisma as any).buyer.findUnique({
      where: { id: buyerId },
    }) as BuyerRecord | null;

    if (!buyer) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }

    // Check credit limit if set
    if (buyer.creditLimit) {
      const creditLimit = Number(buyer.creditLimit);
      const existingBids = await (prisma as any).buyerBid.findMany({
        where: { auctionId, buyerId },
      }) as BuyerBidRecord[];

      const totalExistingValue = existingBids.reduce(
        (sum: number, b: BuyerBidRecord) => sum + Number(b.bidPricePerKg) * Number(b.bidQuantityMt) * 1000,
        0
      );
      const newBidValue = bidPricePerKg * bidQuantityMt * 1000;

      if (totalExistingValue + newBidValue > creditLimit) {
        return NextResponse.json(
          { error: `Total bid value exceeds credit limit of ${creditLimit}` },
          { status: 400 }
        );
      }
    }

    // Create the buyer bid
    const bid = await (prisma as any).buyerBid.create({
      data: {
        auctionId,
        buyerId,
        bidPricePerKg,
        bidQuantityMt,
      },
      include: {
        buyer: true,
      },
    }) as BuyerBidRecord;

    return NextResponse.json({
      id: bid.id,
      auctionId: bid.auctionId,
      buyerId: bid.buyerId,
      buyerName: bid.buyer.buyerName,
      bidPricePerKg: Number(bid.bidPricePerKg),
      bidQuantityMt: Number(bid.bidQuantityMt),
      createdAt: bid.createdAt,
    });
  } catch (error) {
    console.error('Error creating buyer bid:', error);
    return NextResponse.json({ error: 'Failed to create buyer bid' }, { status: 500 });
  }
}

/**
 * PUT /api/buyer-bids
 * Update an existing buyer bid
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, bidPricePerKg, bidQuantityMt } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing bid ID' }, { status: 400 });
    }

    // Get the existing bid
    const existingBid = await (prisma as any).buyerBid.findUnique({
      where: { id },
      include: { buyer: true, auction: true },
    }) as BuyerBidRecord | null;

    if (!existingBid) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    // Check auction status
    const updateAuctionStatus = existingBid.auction?.status as string;
    if (updateAuctionStatus !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Can only modify bids in active auctions' },
        { status: 400 }
      );
    }

    // Validate tick size if price is being changed
    if (bidPricePerKg !== undefined) {
      const tickSize = Number(existingBid.auction?.tickSize || 0.01);
      const priceRemainder = (bidPricePerKg * 10000) % (tickSize * 10000);
      if (Math.abs(priceRemainder) > 0.001) {
        return NextResponse.json(
          { error: `Bid price must be a multiple of tick size ${tickSize}` },
          { status: 400 }
        );
      }
    }

    // Update the bid
    const updateData: any = {};
    if (bidPricePerKg !== undefined) updateData.bidPricePerKg = bidPricePerKg;
    if (bidQuantityMt !== undefined) updateData.bidQuantityMt = bidQuantityMt;

    const bid = await (prisma as any).buyerBid.update({
      where: { id },
      data: updateData,
      include: { buyer: true },
    }) as BuyerBidRecord;

    return NextResponse.json({
      id: bid.id,
      auctionId: bid.auctionId,
      buyerId: bid.buyerId,
      buyerName: bid.buyer.buyerName,
      bidPricePerKg: Number(bid.bidPricePerKg),
      bidQuantityMt: Number(bid.bidQuantityMt),
    });
  } catch (error) {
    console.error('Error updating buyer bid:', error);
    return NextResponse.json({ error: 'Failed to update buyer bid' }, { status: 500 });
  }
}

/**
 * DELETE /api/buyer-bids
 * Delete a buyer bid
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing bid ID' }, { status: 400 });
    }

    // Check auction status before deleting
    const existingBid = await (prisma as any).buyerBid.findUnique({
      where: { id },
      include: { auction: true },
    }) as BuyerBidRecord | null;

    if (!existingBid) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const deleteAuctionStatus = existingBid.auction?.status as string;
    if (deleteAuctionStatus !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Can only delete bids from active auctions' },
        { status: 400 }
      );
    }

    await (prisma as any).buyerBid.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting buyer bid:', error);
    return NextResponse.json({ error: 'Failed to delete buyer bid' }, { status: 500 });
  }
}
