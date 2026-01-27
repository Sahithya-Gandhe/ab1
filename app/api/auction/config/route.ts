import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const auction = await prisma.auction.findFirst({
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

    const auction = await prisma.auction.findFirst({
      where: {
        OR: [
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

    const updated = await prisma.auction.update({
      where: { id: auction.id },
      data: {
        configuredStart: startTime ? new Date(startTime) : null,
        configuredEnd: endTime ? new Date(endTime) : null,
        tickSize: tickSize || auction.tickSize,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}
