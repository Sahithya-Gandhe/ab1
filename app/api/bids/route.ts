import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auction = await (prisma as any).auction.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json([]);
    }

    // Cast to any to bypass TypeScript cache issues with Prisma client
    const db = prisma as any;

    // Fetch buyer bids and seller bids separately
    const [buyerBids, sellerBids] = await Promise.all([
      db.buyerBid.findMany({
        where: { auctionId: auction.id },
        include: { 
          buyer: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.sellerBid.findMany({
        where: { auctionId: auction.id },
        include: { 
          seller: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    ]);

    // Transform to unified format for display
    const buyerBidsFormatted = buyerBids.map((bid: any) => ({
      id: bid.id,
      type: 'BUYER',
      name: bid.buyer?.buyerName || 'Unknown Buyer',
      price: Number(bid.bidPricePerKg || 0),
      quantity: Number(bid.bidQuantityMt || 0),
      createdAt: bid.createdAt,
    }));

    const sellerBidsFormatted = sellerBids.map((bid: any) => ({
      id: bid.id,
      type: 'SELLER',
      name: bid.seller?.sellerName || 'Unknown Seller',
      price: Number(bid.offerPricePerKg || 0),
      quantity: Number(bid.offerQuantityMt || 0),
      createdAt: bid.createdAt,
    }));

    // Combine and sort by creation time
    const allBids = [...buyerBidsFormatted, ...sellerBidsFormatted].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json(allBids);
  } catch (error) {
    console.error('Error fetching bids:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array instead of error
  }
}
