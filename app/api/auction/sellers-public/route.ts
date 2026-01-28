import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const db = prisma as any;

export async function GET(request: NextRequest) {
  try {
    const auction = await db.auction.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json([]);
    }

    // Fetch seller bids with aggregated quantities
    const sellerBids = await db.sellerBid.findMany({
      where: { auctionId: auction.id },
      include: { seller: true },
    });

    // Group by seller and aggregate quantities
    const sellerMap = new Map<string, any>();
    for (const sb of sellerBids) {
      const sellerId = sb.seller.id;
      if (!sellerMap.has(sellerId)) {
        sellerMap.set(sellerId, {
          id: sb.seller.id,
          name: sb.seller.sellerName,
          location: sb.seller.location,
          distanceKm: Number(sb.seller.distanceKm || 0),
          totalQuantity: 0,
          bidsCount: 0,
        });
      }
      const seller = sellerMap.get(sellerId);
      seller.totalQuantity += Number(sb.offerQuantityMt);
      seller.bidsCount += 1;
    }

    // Convert to array and sort by distance
    const sellers = Array.from(sellerMap.values()).sort((a, b) => a.distanceKm - b.distanceKm);

    return NextResponse.json(sellers);
  } catch (error) {
    console.error('Error fetching public sellers:', error);
    return NextResponse.json([], { status: 200 });
  }
}
