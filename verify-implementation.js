const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('🔍 VERIFYING DISTANCE-AWARE AUCTION SYSTEM\n');

  try {
    // 1. Check buyer-seller distances exist
    const distanceCount = await prisma.buyerSellerDistance.count();
    console.log(`✅ BuyerSellerDistance records: ${distanceCount}`);
    
    if (distanceCount === 0) {
      console.log('⚠️  No distances found. Run: node prisma/seed.ts');
      return;
    }

    // 2. Sample distance record
    const sampleDistance = await prisma.buyerSellerDistance.findFirst({
      include: {
        buyer: true,
        seller: true,
        slab: true,
      },
    });

    if (sampleDistance) {
      console.log(`\n📍 Sample Distance Record:`);
      console.log(`   Buyer: ${sampleDistance.buyer.buyerName}`);
      console.log(`   Seller: ${sampleDistance.seller.sellerName}`);
      console.log(`   Distance: ${sampleDistance.distanceKm} km`);
      console.log(`   Slab: ${sampleDistance.slab.minKm}-${sampleDistance.slab.maxKm} km`);
      console.log(`   Delivery Cost: ₹${sampleDistance.costPerKg}/kg`);
    }

    // 3. Check buyers have coordinates
    const buyersWithCoords = await prisma.buyer.count({
      where: {
        latitude: { not: null },
        longitude: { not: null },
      },
    });
    console.log(`\n✅ Buyers with coordinates: ${buyersWithCoords}/4`);

    // 4. Check sellers have coordinates
    const sellersWithCoords = await prisma.seller.count({
      where: {
        latitude: { not: null },
        longitude: { not: null },
      },
    });
    console.log(`✅ Sellers with coordinates: ${sellersWithCoords}/21`);

    // 5. Check MarketDemand table exists and has schema
    const marketDemandCount = await prisma.marketDemand.count();
    console.log(`\n✅ MarketDemand table: ${marketDemandCount} records`);

    // 6. Check distance slabs
    const slabs = await prisma.distanceSlab.findMany({
      orderBy: { minKm: 'asc' },
    });
    console.log(`\n✅ Distance Slabs Configured:`);
    slabs.forEach(s => {
      console.log(`   ${s.minKm}-${s.maxKm} km → ₹${s.costPerKg}/kg`);
    });

    // 7. Check auctions exist
    const auctions = await prisma.auction.findMany({
      take: 1,
      orderBy: { createdAt: 'desc' },
    });
    
    if (auctions.length > 0) {
      const auction = auctions[0];
      console.log(`\n✅ Sample Auction:`);
      console.log(`   ID: ${auction.id}`);
      console.log(`   Status: ${auction.status}`);
      console.log(`   Tick Size: ₹${auction.tickSize}/kg`);

      // Check if this auction has distances computed
      const auctionDistances = await prisma.buyerSellerDistance.count({
        where: { auctionId: auction.id },
      });
      console.log(`   Distances computed: ${auctionDistances}`);
    }

    console.log(`\n✅ VERIFICATION COMPLETE!`);
    console.log(`\n🚀 Next Steps:`);
    console.log(`   1. Start dev server: npm run dev`);
    console.log(`   2. Login as buyer: b1@ab.com / b1`);
    console.log(`   3. Submit bids with distance slabs`);
    console.log(`   4. Admin ends auction → landing costs calculated`);
    console.log(`   5. View results with distance/delivery/landed costs`);
    console.log(`   6. Download PDF with all columns\n`);

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure database is running');
    console.log('   2. Run: npx prisma db push');
    console.log('   3. Run: npx prisma generate');
    console.log('   4. Run: node prisma/seed.ts\n');
  }
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
