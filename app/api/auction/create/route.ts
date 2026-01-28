import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickSize } = body;

    // Check if there's already an active or pending auction
    const existingAuction = await prisma.auction.findFirst({
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
    const auction = await prisma.auction.create({
      data: {
        status: 'PENDING',
        tickSize: tickSize || 0.01,
      },
    });

    return NextResponse.json(auction);
  } catch (error) {
    console.error('Error creating auction:', error);
    return NextResponse.json({ error: 'Failed to create auction' }, { status: 500 });
  }
}
