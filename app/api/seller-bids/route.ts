import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateDeliveryCost, DistanceSlabData } from '@/lib/auctionEngine';

export const dynamic = 'force-dynamic';

// Type definitions for Prisma results
interface SellerBidRecord {
  id: string;
  auctionId: string;
  sellerId: string;
  offerPricePerKg: any;
  offerQuantityMt: any;
  distanceKm: any;
  deliveryCostPerKg: any;
  landedCostPerKg: any;
  cumulativeSupplyMt: any;
  createdAt: Date;
  updatedAt: Date;
  seller: { sellerName: string; distanceKm?: any };
  auction?: { status: string; tickSize: any };
}

interface SellerRecord {
  id: string;
  sellerName: string;
  location?: string;
  distanceKm?: any;
}

interface DistanceSlabRecord {
  id: string;
  minKm: any;
  maxKm: any;
  costPerKg: any;
}

/**
 * GET /api/seller-bids
 * Fetch all seller bids for a specific auction
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const auctionId = searchParams.get('auctionId');

    let whereClause: any = {};
    if (auctionId) {
      whereClause.auctionId = auctionId;
    }

    const bids = await (prisma as any).sellerBid.findMany({
      where: whereClause,
      include: {
        seller: true,
        auction: true,
      },
      orderBy: [
        { landedCostPerKg: 'asc' },
        { offerPricePerKg: 'asc' },
      ],
    }) as SellerBidRecord[];

    return NextResponse.json(bids.map((bid: SellerBidRecord) => ({
      id: bid.id,
      auctionId: bid.auctionId,
      sellerId: bid.sellerId,
      sellerName: bid.seller.sellerName,
      offerPricePerKg: Number(bid.offerPricePerKg),
      offerQuantityMt: Number(bid.offerQuantityMt),
      distanceKm: bid.distanceKm ? Number(bid.distanceKm) : null,
      deliveryCostPerKg: bid.deliveryCostPerKg ? Number(bid.deliveryCostPerKg) : null,
      landedCostPerKg: bid.landedCostPerKg ? Number(bid.landedCostPerKg) : null,
      cumulativeSupplyMt: bid.cumulativeSupplyMt ? Number(bid.cumulativeSupplyMt) : null,
      createdAt: bid.createdAt,
    })));
  } catch (error) {
    console.error('Error fetching seller bids:', error);
    return NextResponse.json({ error: 'Failed to fetch seller bids' }, { status: 500 });
  }
}

/**
 * POST /api/seller-bids
 * Create a new seller bid (price-quantity slab)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { auctionId, sellerId, offerPricePerKg, offerQuantityMt, distanceKm } = body;

    // Validate required fields
    if (!auctionId || !sellerId || offerPricePerKg === undefined || offerQuantityMt === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: auctionId, sellerId, offerPricePerKg, offerQuantityMt' },
        { status: 400 }
      );
    }

    // Validate auction exists and is active
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const status = auction.status as string;
    if (status !== 'DRAFT' && status !== 'PENDING' && status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Cannot add bids to a closed or completed auction' },
        { status: 400 }
      );
    }

    // Validate seller exists
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    }) as SellerRecord | null;

    if (!seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
    }

    // Get distance from seller if not provided
    const actualDistanceKm = distanceKm ?? (seller.distanceKm ? Number(seller.distanceKm) : 0);

    // Calculate delivery cost from slabs
    const distanceSlabs = await (prisma as any).distanceSlab.findMany() as DistanceSlabRecord[];
    const slabData: DistanceSlabData[] = distanceSlabs.map((s: DistanceSlabRecord) => ({
      minKm: Number(s.minKm),
      maxKm: Number(s.maxKm),
      costPerKg: Number(s.costPerKg),
    }));

    const deliveryCostPerKg = calculateDeliveryCost(actualDistanceKm, slabData);
    const landedCostPerKg = offerPricePerKg + deliveryCostPerKg;

    // Create the seller bid
    const bid = await (prisma as any).sellerBid.create({
      data: {
        auctionId,
        sellerId,
        offerPricePerKg,
        offerQuantityMt,
        distanceKm: actualDistanceKm,
        deliveryCostPerKg,
        landedCostPerKg,
      },
      include: {
        seller: true,
      },
    }) as SellerBidRecord;

    return NextResponse.json({
      id: bid.id,
      auctionId: bid.auctionId,
      sellerId: bid.sellerId,
      sellerName: bid.seller.sellerName,
      offerPricePerKg: Number(bid.offerPricePerKg),
      offerQuantityMt: Number(bid.offerQuantityMt),
      distanceKm: Number(bid.distanceKm),
      deliveryCostPerKg: Number(bid.deliveryCostPerKg),
      landedCostPerKg: Number(bid.landedCostPerKg),
      createdAt: bid.createdAt,
    });
  } catch (error) {
    console.error('Error creating seller bid:', error);
    return NextResponse.json({ error: 'Failed to create seller bid' }, { status: 500 });
  }
}

/**
 * PUT /api/seller-bids
 * Update an existing seller bid
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, offerPricePerKg, offerQuantityMt, distanceKm } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing bid ID' }, { status: 400 });
    }

    // Get the existing bid
    const existingBid = await (prisma as any).sellerBid.findUnique({
      where: { id },
      include: { seller: true, auction: true },
    }) as SellerBidRecord | null;

    if (!existingBid) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    // Check auction status
    const existingStatus = existingBid.auction?.status as string;
    if (existingStatus !== 'DRAFT' && 
        existingStatus !== 'PENDING' && 
        existingStatus !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Cannot modify bids in a closed or completed auction' },
        { status: 400 }
      );
    }

    // Calculate new values
    const newOfferPrice = offerPricePerKg ?? Number(existingBid.offerPricePerKg);
    const newDistanceKm = distanceKm ?? Number(existingBid.distanceKm);

    // Recalculate delivery cost if distance changed
    const distanceSlabs = await (prisma as any).distanceSlab.findMany() as DistanceSlabRecord[];
    const slabData: DistanceSlabData[] = distanceSlabs.map((s: DistanceSlabRecord) => ({
      minKm: Number(s.minKm),
      maxKm: Number(s.maxKm),
      costPerKg: Number(s.costPerKg),
    }));

    const deliveryCostPerKg = calculateDeliveryCost(newDistanceKm, slabData);
    const landedCostPerKg = newOfferPrice + deliveryCostPerKg;

    // Update the bid
    const updateData: any = {
      deliveryCostPerKg,
      landedCostPerKg,
    };

    if (offerPricePerKg !== undefined) updateData.offerPricePerKg = offerPricePerKg;
    if (offerQuantityMt !== undefined) updateData.offerQuantityMt = offerQuantityMt;
    if (distanceKm !== undefined) updateData.distanceKm = distanceKm;

    const bid = await (prisma as any).sellerBid.update({
      where: { id },
      data: updateData,
      include: { seller: true },
    }) as SellerBidRecord;

    return NextResponse.json({
      id: bid.id,
      auctionId: bid.auctionId,
      sellerId: bid.sellerId,
      sellerName: bid.seller.sellerName,
      offerPricePerKg: Number(bid.offerPricePerKg),
      offerQuantityMt: Number(bid.offerQuantityMt),
      distanceKm: Number(bid.distanceKm),
      deliveryCostPerKg: Number(bid.deliveryCostPerKg),
      landedCostPerKg: Number(bid.landedCostPerKg),
    });
  } catch (error) {
    console.error('Error updating seller bid:', error);
    return NextResponse.json({ error: 'Failed to update seller bid' }, { status: 500 });
  }
}

/**
 * DELETE /api/seller-bids
 * Delete a seller bid
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing bid ID' }, { status: 400 });
    }

    // Check auction status before deleting
    const existingBid = await (prisma as any).sellerBid.findUnique({
      where: { id },
      include: { auction: true },
    }) as SellerBidRecord | null;

    if (!existingBid) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const deleteAuctionStatus = existingBid.auction?.status as string;
    if (deleteAuctionStatus !== 'DRAFT' && 
        deleteAuctionStatus !== 'PENDING' && 
        deleteAuctionStatus !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Cannot delete bids from a closed or completed auction' },
        { status: 400 }
      );
    }

    await (prisma as any).sellerBid.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting seller bid:', error);
    return NextResponse.json({ error: 'Failed to delete seller bid' }, { status: 500 });
  }
}
