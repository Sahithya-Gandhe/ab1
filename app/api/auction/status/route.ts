import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const auction = await prisma.auction.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json({ status: 'NONE' });
    }

    return NextResponse.json({ status: auction.status });
  } catch (error) {
    console.error('Error fetching auction status:', error);
    return NextResponse.json({ error: 'Failed to fetch auction status' }, { status: 500 });
  }
}
