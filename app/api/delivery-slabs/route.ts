import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Type for distance slab from database
interface DistanceSlabRecord {
  id: string;
  minKm: any;
  maxKm: any;
  costPerKg: any;
  createdAt: Date;
}

/**
 * GET /api/delivery-slabs
 * Fetch all delivery cost slabs
 */
export async function GET() {
  try {
    const slabs = await (prisma as any).distanceSlab.findMany({
      orderBy: { minKm: 'asc' },
    }) as DistanceSlabRecord[];

    return NextResponse.json(slabs.map((slab: DistanceSlabRecord) => ({
      id: slab.id,
      minKm: Number(slab.minKm),
      maxKm: Number(slab.maxKm),
      costPerKg: Number(slab.costPerKg),
    })));
  } catch (error) {
    console.error('Error fetching delivery slabs:', error);
    return NextResponse.json({ error: 'Failed to fetch delivery slabs' }, { status: 500 });
  }
}

/**
 * POST /api/delivery-slabs
 * Create a new delivery cost slab
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { minKm, maxKm, costPerKg } = body;

    if (minKm === undefined || maxKm === undefined || costPerKg === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: minKm, maxKm, costPerKg' },
        { status: 400 }
      );
    }

    if (minKm < 0 || maxKm < 0 || costPerKg < 0) {
      return NextResponse.json(
        { error: 'Values cannot be negative' },
        { status: 400 }
      );
    }

    if (minKm >= maxKm) {
      return NextResponse.json(
        { error: 'minKm must be less than maxKm' },
        { status: 400 }
      );
    }

    // Check for overlapping slabs
    const existingSlabs = await (prisma as any).distanceSlab.findMany() as DistanceSlabRecord[];
    for (const slab of existingSlabs) {
      const existingMin = Number(slab.minKm);
      const existingMax = Number(slab.maxKm);
      
      // Check for overlap
      if ((minKm >= existingMin && minKm < existingMax) ||
          (maxKm > existingMin && maxKm <= existingMax) ||
          (minKm <= existingMin && maxKm >= existingMax)) {
        return NextResponse.json(
          { error: `Overlaps with existing slab: ${existingMin}-${existingMax} km` },
          { status: 400 }
        );
      }
    }

    const slab = await (prisma as any).distanceSlab.create({
      data: {
        minKm,
        maxKm,
        costPerKg,
      },
    }) as DistanceSlabRecord;

    return NextResponse.json({
      id: slab.id,
      minKm: Number(slab.minKm),
      maxKm: Number(slab.maxKm),
      costPerKg: Number(slab.costPerKg),
    });
  } catch (error) {
    console.error('Error creating delivery slab:', error);
    return NextResponse.json({ error: 'Failed to create delivery slab' }, { status: 500 });
  }
}

/**
 * PUT /api/delivery-slabs
 * Update an existing delivery cost slab
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, minKm, maxKm, costPerKg } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing slab ID' }, { status: 400 });
    }

    const updateData: any = {};
    if (minKm !== undefined) updateData.minKm = minKm;
    if (maxKm !== undefined) updateData.maxKm = maxKm;
    if (costPerKg !== undefined) updateData.costPerKg = costPerKg;

    const slab = await (prisma as any).distanceSlab.update({
      where: { id },
      data: updateData,
    }) as DistanceSlabRecord;

    return NextResponse.json({
      id: slab.id,
      minKm: Number(slab.minKm),
      maxKm: Number(slab.maxKm),
      costPerKg: Number(slab.costPerKg),
    });
  } catch (error) {
    console.error('Error updating delivery slab:', error);
    return NextResponse.json({ error: 'Failed to update delivery slab' }, { status: 500 });
  }
}

/**
 * DELETE /api/delivery-slabs
 * Delete a delivery cost slab
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing slab ID' }, { status: 400 });
    }

    await (prisma as any).distanceSlab.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting delivery slab:', error);
    return NextResponse.json({ error: 'Failed to delete delivery slab' }, { status: 500 });
  }
}
