import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const db = prisma as any

async function main() {
  console.log('🌱 Seeding STATIC MASTER DATA...\n')

  // ============================
  // FULL CLEANUP
  // ============================
  console.log('🧹 Cleaning all data...')
  await db.auctionResult.deleteMany().catch(() => {})
  await db.auctionGapSnapshot.deleteMany().catch(() => {})
  await db.auctionDemandSnapshot.deleteMany().catch(() => {})
  await db.auctionSupplySnapshot.deleteMany().catch(() => {})
  await db.allocation.deleteMany().catch(() => {})
  await db.buyerBid.deleteMany().catch(() => {})
  await db.sellerBid.deleteMany().catch(() => {})
  await db.auction.deleteMany().catch(() => {})
  await db.distanceSlab.deleteMany().catch(() => {})
  await db.seller.deleteMany().catch(() => {})
  await db.buyer.deleteMany().catch(() => {})
  await prisma.user.deleteMany().catch(() => {})

  // ============================
  // 1️⃣ DISTANCE SLABS (Admin-controlled delivery costs)
  // ============================
  console.log('📏 Creating distance slabs...')

  const slabs = [
    { minKm: 0, maxKm: 100, costPerKg: 0.50 },
    { minKm: 100, maxKm: 200, costPerKg: 1.70 },
    { minKm: 200, maxKm: 300, costPerKg: 1.00 },
    { minKm: 300, maxKm: 400, costPerKg: 1.50 },
    { minKm: 400, maxKm: 600, costPerKg: 2.00 },
  ]

  for (const slab of slabs) {
    await db.distanceSlab.create({ data: slab })
  }
  console.log(`   ✅ ${slabs.length} distance slabs created`)

  // ============================
  // 2️⃣ ADMIN USER
  // ============================
  console.log('👤 Creating admin...')

  await prisma.user.create({
    data: {
      email: 'admin@auction.com',
      password: await bcrypt.hash('admin123', 10),
      name: 'System Admin',
      role: 'ADMIN',
    },
  })
  console.log('   ✅ admin@auction.com / admin123')

  // ============================
  // 3️⃣ BUYERS (Will bid dynamically via website)
  // ============================
  console.log('🛒 Creating buyers...')

  const buyers = [
    { email: 'b1@ab.com', password: 'b1', name: 'Alpha Traders', org: 'Alpha Group' },
    { email: 'b2@ab.com', password: 'b2', name: 'Beta Mills', org: 'Beta Industries' },
    { email: 'b3@ab.com', password: 'b3', name: 'Gamma Foods', org: 'Gamma Corp' },
    { email: 'b4@ab.com', password: 'b4', name: 'Delta Exports', org: 'Delta Ltd' },
  ]

  for (const b of buyers) {
    const hash = await bcrypt.hash(b.password, 10)

    await db.buyer.create({
      data: {
        buyerName: b.name,
        organization: b.org,
        email: b.email,
        password: hash,
        creditLimit: 10_000_000,
      },
    })

    await prisma.user.create({
      data: {
        email: b.email,
        password: hash,
        name: b.name,
        role: 'BUYER',
      },
    })

    console.log(`   ✅ ${b.email} / ${b.password}`)
  }

  // ============================
  // 4️⃣ STATIC SELLERS (with base price & quantity)
  // ============================
  console.log('🏭 Creating static sellers...')

  const sellers = [
    { name: 'Adilabad Agro', location: 'Adilabad', km: 280, basePrice: 20.50, qty: 230 },
    { name: 'Nizamabad Farms', location: 'Nizamabad', km: 180, basePrice: 20.60, qty: 200 },
    { name: 'Karimnagar Grains', location: 'Karimnagar', km: 160, basePrice: 20.40, qty: 250 },
    { name: 'Peddapalli Produce', location: 'Peddapalli', km: 170, basePrice: 20.55, qty: 180 },
    { name: 'Warangal Harvest', location: 'Warangal', km: 140, basePrice: 20.30, qty: 300 },
    { name: 'Hanamkonda Traders', location: 'Hanamkonda', km: 130, basePrice: 20.35, qty: 220 },
    { name: 'Khammam Fields', location: 'Khammam', km: 260, basePrice: 20.70, qty: 190 },
    { name: 'Mahabubabad Crops', location: 'Mahabubabad', km: 240, basePrice: 20.65, qty: 210 },
    { name: 'Nalgonda Supplies', location: 'Nalgonda', km: 120, basePrice: 20.25, qty: 280 },
    { name: 'Suryapet Markets', location: 'Suryapet', km: 110, basePrice: 20.20, qty: 260 },
    { name: 'Medak Agro', location: 'Medak', km: 100, basePrice: 20.15, qty: 240 },
    { name: 'Sangareddy Seeds', location: 'Sangareddy', km: 90, basePrice: 20.10, qty: 270 },
    { name: 'Siddipet Farms', location: 'Siddipet', km: 95, basePrice: 20.12, qty: 230 },
    { name: 'Vikarabad Produce', location: 'Vikarabad', km: 70, basePrice: 20.00, qty: 300 },
    { name: 'Nagarkurnool Growers', location: 'Nagarkurnool', km: 200, basePrice: 20.75, qty: 180 },
    { name: 'Wanaparthy Fields', location: 'Wanaparthy', km: 210, basePrice: 20.80, qty: 170 },
    { name: 'Jogulamba Traders', location: 'Jogulamba', km: 300, basePrice: 20.90, qty: 150 },
    { name: 'Mancherial Agro', location: 'Mancherial', km: 250, basePrice: 20.85, qty: 160 },
    { name: 'Komaram Bheem Crops', location: 'Asifabad', km: 320, basePrice: 21.00, qty: 140 },
    { name: 'Jayashankar Farms', location: 'Bhupalpally', km: 220, basePrice: 20.78, qty: 190 },
    { name: 'Mulugu Growers', location: 'Mulugu', km: 230, basePrice: 20.82, qty: 175 },
  ]

  let totalCapacity = 0

  for (const s of sellers) {
    await db.seller.create({
      data: {
        sellerName: s.name,
        location: s.location,
        distanceKm: s.km,
        basePricePerKg: s.basePrice,
        offerQuantityMt: s.qty,
      },
    })
    totalCapacity += s.qty
  }

  console.log(`   ✅ ${sellers.length} sellers created`)
  console.log(`   ✅ Total capacity: ${totalCapacity} MT`)

  // ============================
  // SUMMARY
  // ============================
  console.log('\n' + '='.repeat(50))
  console.log('🎉 STATIC MASTER DATA SEEDED')
  console.log('='.repeat(50))
  console.log(`
📊 Summary:
   - Distance Slabs: ${slabs.length}
   - Admin: 1
   - Buyers: ${buyers.length} (bid dynamically)
   - Sellers: ${sellers.length} (static, used in all auctions)

🔐 Login Credentials:
   Admin:   admin@auction.com / admin123
   Buyer 1: b1@ab.com / b1
   Buyer 2: b2@ab.com / b2
   Buyer 3: b3@ab.com / b3
   Buyer 4: b4@ab.com / b4

📝 Workflow:
   1. Admin creates auction (website)
   2. Seller bids auto-generated for auction
   3. Buyers login and submit bids
   4. Admin ends auction → clearing computed
   5. View results & download PDF
`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
