import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeAuction, SellerData, BuyerBid } from '@/lib/auctionEngine';

export const dynamic = 'force-dynamic';

// Use 'any' cast to bypass TypeScript cache issues with Prisma client
const db = prisma as any;

export async function POST(request: NextRequest) {
  try {
    const auction = await db.auction.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json({ error: 'No active auction found' }, { status: 404 });
    }

    // Fetch all sellers
    const sellers = await db.seller.findMany();
    
    // Fetch all bids with splits for this auction
    const bids = await db.bid.findMany({
      where: { auctionId: auction.id },
      include: { 
        user: true,
        splits: {
          orderBy: { price: 'desc' }
        }
      },
    });

    // Convert to engine format
    const sellerData: SellerData[] = sellers.map((s: any) => ({
      id: s.id,
      name: s.name,
      quantity: Number(s.quantity),
      reservePrice: Number(s.reservePrice),
    }));

    // Convert BidSplit to BuyerBid format (price1, quantity1, etc.)
    const bidData: BuyerBid[] = bids.map((b: any) => {
      const splits = b.splits || [];
      return {
        userId: b.userId,
        userName: b.user.name,
        price1: splits[0] ? Number(splits[0].price) : 0,
        quantity1: splits[0] ? Number(splits[0].quantity) : 0,
        price2: splits[1] ? Number(splits[1].price) : undefined,
        quantity2: splits[1] ? Number(splits[1].quantity) : undefined,
        price3: splits[2] ? Number(splits[2].price) : undefined,
        quantity3: splits[2] ? Number(splits[2].quantity) : undefined,
      };
    });

    // Execute auction engine with tick size
    const results = executeAuction(sellerData, bidData, Number(auction.tickSize));

    // Update auction with results
    await db.auction.update({
      where: { id: auction.id },
      data: {
        status: 'COMPLETED',
        clearingPrice: results.clearingPrice,
        clearingQuantity: results.clearingQuantity,
        totalTradeValue: results.totalTradeValue,
        clearingType: results.clearingType,
        endTime: new Date(),
      },
    });

    // Delete existing allocations for this auction
    await db.sellerAllocation.deleteMany({
      where: { auctionId: auction.id },
    });
    await db.buyerAllocation.deleteMany({
      where: { auctionId: auction.id },
    });

    // Save seller allocations
    for (const alloc of results.allocations) {
      await db.sellerAllocation.create({
        data: {
          auctionId: auction.id,
          sellerId: alloc.sellerId,
          sellerName: alloc.sellerName,
          quantity: alloc.quantity,
          reservePrice: alloc.reservePrice,
          clearingPrice: alloc.clearingPrice,
          tradeValue: alloc.tradeValue,
          bonus: alloc.bonus,
        },
      });
    }

    // Save buyer allocations
    for (const buyerAlloc of results.buyerAllocations) {
      for (const sellAlloc of buyerAlloc.allocations) {
        await db.buyerAllocation.create({
          data: {
            auctionId: auction.id,
            buyerId: buyerAlloc.userId,
            buyerName: buyerAlloc.userName,
            sellerId: sellAlloc.sellerId,
            sellerName: sellAlloc.sellerName,
            quantity: sellAlloc.quantity,
            bidPrice: sellAlloc.price,
            clearingPrice: results.clearingPrice,
            tradeValue: sellAlloc.quantity * results.clearingPrice * 1000,
          },
        });
      }
    }

    // Save supply snapshots
    await db.auctionSupplySnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    for (const sp of results.supplyPoints) {
      await db.auctionSupplySnapshot.create({
        data: {
          auctionId: auction.id,
          sellerId: sp.sellerId,
          sellerName: sp.sellerName,
          price: sp.price,
          quantity: sp.quantity,
          cumulativeSupply: sp.cumulativeQuantity,
        },
      });
    }

    // Save demand snapshots
    await db.auctionDemandSnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    for (const dp of results.demandPoints) {
      await db.auctionDemandSnapshot.create({
        data: {
          auctionId: auction.id,
          buyerId: dp.userId,
          buyerName: dp.userName,
          price: dp.price,
          quantity: dp.quantity,
          cumulativeDemand: dp.cumulativeQuantity,
        },
      });
    }

    // Save gap snapshots
    await db.auctionGapSnapshot.deleteMany({
      where: { auctionId: auction.id },
    });
    for (const gp of results.gapPoints) {
      await db.auctionGapSnapshot.create({
        data: {
          auctionId: auction.id,
          price: gp.price,
          supply: gp.cumulativeSupply,
          demand: gp.cumulativeDemand,
          gap: gp.gap,
        },
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Error ending auction:', error);
    return NextResponse.json({ error: 'Failed to end auction' }, { status: 500 });
  }
}
