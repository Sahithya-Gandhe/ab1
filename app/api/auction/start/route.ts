import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const auction = await prisma.auction.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json(
        { error: 'No pending auction found. Please create an auction first.' },
        { status: 404 }
      );
    }

    const now = new Date();
    
    const updated = await prisma.auction.update({
      where: { id: auction.id },
      data: {
        status: 'ACTIVE',
        startTime: now,
        endTime: auction.configuredEnd || new Date(now.getTime() + 60 * 60 * 1000), // 1 hour default
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error starting auction:', error);
    return NextResponse.json({ error: 'Failed to start auction' }, { status: 500 });
  }
}
