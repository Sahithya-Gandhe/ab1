import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auction = await (prisma as any).auction.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(auction || {});
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startTime, endTime, tickSize } = body;

    const auction = await (prisma as any).auction.findFirst({
      where: {
        OR: [
          { status: 'DRAFT' },
          { status: 'PENDING' },
          { status: 'ACTIVE' }
        ]
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json(
        { error: 'No auction found. Please create an auction first.' },
        { status: 404 }
      );
    }

    const updated = await (prisma as any).auction.update({
      where: { id: auction.id },
      data: {
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        tickSize: tickSize || auction.tickSize,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}
