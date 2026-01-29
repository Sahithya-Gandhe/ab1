import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickSize } = body;

    // Check if there's already an active or pending auction
    const existingAuction = await (prisma as any).auction.findFirst({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'ACTIVE' }
        ]
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingAuction) {
      return NextResponse.json(
        { error: 'An auction is already active or pending. Please complete or reset it first.' },
        { status: 400 }
      );
    }

    // Create new auction
    const auction = await (prisma as any).auction.create({
      data: {
        status: 'PENDING',
        tickSize: tickSize || 0.01,
      },
    });

    // Get all static sellers and create seller bids for this auction
    const sellers = await (prisma as any).seller.findMany();
    
    console.log(`Creating seller bids for ${sellers.length} sellers...`);

    // Create seller bids using each seller's stored price and quantity
    for (const seller of sellers) {
      // Use seller's stored base price (default to ₹20 if not set)
      const basePrice = Number(seller.basePricePerKg) || 20.00;
      // Use seller's stored quantity (default to 300 MT if not set)
      const totalQty = Number(seller.offerQuantityMt) || 300;
      
      // Create single bid per seller with their full quantity at their price
      // Note: Distance/delivery/landed costs are buyer-relative and calculated during allocation
      await (prisma as any).sellerBid.create({
        data: {
          sellerId: seller.id,
          auctionId: auction.id,
          offerPricePerKg: basePrice,
          offerQuantityMt: totalQty,
        },
      });
    }

    console.log(`Created seller bids for auction ${auction.id}`);

    return NextResponse.json(auction);
  } catch (error) {
    console.error('Error creating auction:', error);
    return NextResponse.json({ error: 'Failed to create auction' }, { status: 500 });
  }
}
