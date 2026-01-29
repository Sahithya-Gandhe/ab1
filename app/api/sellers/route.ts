import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get the current active or pending auction
    const currentAuction = await (prisma as any).auction.findFirst({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'ACTIVE' },
          { status: 'COMPLETED' },
        ]
      },
      orderBy: { createdAt: 'desc' },
    });

    const sellers = await (prisma as any).seller.findMany({
      include: {
        bids: currentAuction ? {
          where: { auctionId: currentAuction.id }
        } : true,
      },
      orderBy: {
        sellerName: 'asc',
      },
    });

    // Transform to include seller data and bid data
    const transformed = sellers.map((seller: any) => {
      // If auction exists and has bids, use bid data
      const hasBids = seller.bids && seller.bids.length > 0;
      
      const totalQuantity = hasBids
        ? seller.bids.reduce((sum: number, bid: any) => sum + Number(bid.offerQuantityMt || 0), 0)
        : Number(seller.offerQuantityMt || 0);
      
      const avgPrice = hasBids
        ? seller.bids.reduce((sum: number, bid: any) => sum + Number(bid.offerPricePerKg || 0), 0) / seller.bids.length
        : Number(seller.basePricePerKg || 0);

      return {
        id: seller.id,
        name: seller.sellerName,
        sellerName: seller.sellerName,
        location: seller.location,
        distanceKm: 0, // Distance is buyer-relative, calculated per buyer
        quantity: totalQuantity,
        totalQuantity: totalQuantity,
        offerQuantityMt: totalQuantity,
        reservePrice: avgPrice,
        bidsCount: seller.bids?.length || 0,
      };
    });

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Error fetching sellers:', error);
    return NextResponse.json({ error: 'Failed to fetch sellers' }, { status: 500 });
  }
}
