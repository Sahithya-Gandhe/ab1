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
  await db.auctionGapSnapshot.deleteMany().catch(() => {})
  await db.marketDemand.deleteMany().catch(() => {})
  await db.auctionSupplySnapshot.deleteMany().catch(() => {})
  await db.allocation.deleteMany().catch(() => {})
  await db.buyerBid.deleteMany().catch(() => {})
  await db.sellerBid.deleteMany().catch(() => {})
  await db.buyerSellerDistance.deleteMany().catch(() => {})
  await db.auction.deleteMany().catch(() => {})
  await db.distanceSlab.deleteMany().catch(() => {})
  await db.seller.deleteMany().catch(() => {})
  await db.buyer.deleteMany().catch(() => {})
  await prisma.user.deleteMany().catch(() => {})

  // ============================
  // 1️⃣ DISTANCE SLABS (Admin-controlled delivery costs)
  // ============================
  console.log('📏 Creating distance slabs...')

  const initialSlabs = [
    { id: 'slab1', minKm: 0, maxKm: 100, costPerKg: 0.50 },
    { id: 'slab2', minKm: 100, maxKm: 200, costPerKg: 1.70 },
    { id: 'slab3', minKm: 200, maxKm: 300, costPerKg: 1.00 },
    { id: 'slab4', minKm: 300, maxKm: 400, costPerKg: 1.50 },
    { id: 'slab5', minKm: 400, maxKm: 600, costPerKg: 2.00 },
  ]

  for (const slab of initialSlabs) {
    await db.distanceSlab.create({ data: slab })
  }
  console.log(`   ✅ ${initialSlabs.length} distance slabs created`)

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
    { email: 'b1@ab.com', password: 'b1', name: 'Alpha Traders', org: 'Alpha Group', latitude: 17.385044, longitude: 78.486671 }, // Hyderabad
    { email: 'b2@ab.com', password: 'b2', name: 'Beta Mills', org: 'Beta Industries', latitude: 17.436240, longitude: 78.498398 },
    { email: 'b3@ab.com', password: 'b3', name: 'Gamma Foods', org: 'Gamma Corp', latitude: 17.401000, longitude: 78.500000 },
    { email: 'b4@ab.com', password: 'b4', name: 'Delta Exports', org: 'Delta Ltd', latitude: 17.450000, longitude: 78.400000 },
  ]

  for (const b of buyers) {
    const hash = await bcrypt.hash(b.password, 10)

    // create auth User first and link to Buyer
    const user = await prisma.user.create({
      data: {
        email: b.email,
        password: hash,
        name: b.name,
        role: 'BUYER',
      },
    })

    await db.buyer.create({
      data: {
        buyerName: b.name,
        organization: b.org,
        email: b.email,
        password: hash,
        creditLimit: 10_000_000,
        latitude: b.latitude,
        longitude: b.longitude,
        userId: user.id,
      },
    })

    console.log(`   ✅ ${b.email} / ${b.password}`)
  }

  // ============================
  // 4️⃣ STATIC SELLERS (with base price & quantity)
  // ============================
  console.log('🏭 Creating static sellers...')

  const sellers = [
    { name: 'Adilabad Agro', location: 'Adilabad', latitude: 19.6667, longitude: 78.5333, basePrice: 20.50, qty: 230 },
    { name: 'Nizamabad Farms', location: 'Nizamabad', latitude: 18.6723, longitude: 78.0933, basePrice: 20.60, qty: 200 },
    { name: 'Karimnagar Grains', location: 'Karimnagar', latitude: 18.4386, longitude: 79.1288, basePrice: 20.40, qty: 250 },
    { name: 'Peddapalli Produce', location: 'Peddapalli', latitude: 18.6296, longitude: 79.3856, basePrice: 20.55, qty: 180 },
    { name: 'Warangal Harvest', location: 'Warangal', latitude: 17.9789, longitude: 79.5917, basePrice: 20.30, qty: 300 },
    { name: 'Hanamkonda Traders', location: 'Hanamkonda', latitude: 18.0000, longitude: 79.5800, basePrice: 20.35, qty: 220 },
    { name: 'Khammam Fields', location: 'Khammam', latitude: 17.2473, longitude: 80.1431, basePrice: 20.70, qty: 190 },
    { name: 'Mahabubabad Crops', location: 'Mahabubabad', latitude: 17.7986, longitude: 80.0094, basePrice: 20.65, qty: 210 },
    { name: 'Nalgonda Supplies', location: 'Nalgonda', latitude: 17.0577, longitude: 79.2676, basePrice: 20.25, qty: 280 },
    { name: 'Suryapet Markets', location: 'Suryapet', latitude: 17.1317, longitude: 79.6241, basePrice: 20.20, qty: 260 },
    { name: 'Medak Agro', location: 'Medak', latitude: 18.0015, longitude: 78.2676, basePrice: 20.15, qty: 240 },
    { name: 'Sangareddy Seeds', location: 'Sangareddy', latitude: 17.6199, longitude: 78.2666, basePrice: 20.10, qty: 270 },
    { name: 'Siddipet Farms', location: 'Siddipet', latitude: 18.1079, longitude: 78.8521, basePrice: 20.12, qty: 230 },
    { name: 'Vikarabad Produce', location: 'Vikarabad', latitude: 17.3333, longitude: 77.9000, basePrice: 20.00, qty: 300 },
    { name: 'Nagarkurnool Growers', location: 'Nagarkurnool', latitude: 16.5056, longitude: 78.2454, basePrice: 20.75, qty: 180 },
    { name: 'Wanaparthy Fields', location: 'Wanaparthy', latitude: 16.3833, longitude: 77.9833, basePrice: 20.80, qty: 170 },
    { name: 'Jogulamba Traders', location: 'Jogulamba', latitude: 17.1278, longitude: 78.6131, basePrice: 20.90, qty: 150 },
    { name: 'Mancherial Agro', location: 'Mancherial', latitude: 18.8742, longitude: 79.4445, basePrice: 20.85, qty: 160 },
    { name: 'Komaram Bheem Crops', location: 'Asifabad', latitude: 19.3177, longitude: 78.5389, basePrice: 21.00, qty: 140 },
    { name: 'Jayashankar Farms', location: 'Bhupalpally', latitude: 18.2475, longitude: 79.8986, basePrice: 20.78, qty: 190 },
    { name: 'Mulugu Growers', location: 'Mulugu', latitude: 18.3514, longitude: 80.3053, basePrice: 20.82, qty: 175 },
  ]

  let totalCapacity = 0

  for (const s of sellers) {
    // create a simple seller User and link
    const sellerEmail = `${s.name.toLowerCase().replace(/\s+/g, '')}@seller.com`
    const sellerPassHash = await bcrypt.hash('seller123', 10)
    const sellerUser = await prisma.user.create({
      data: {
        email: sellerEmail,
        password: sellerPassHash,
        name: s.name,
        role: 'SELLER',
      },
    })

    await db.seller.create({
      data: {
        sellerName: s.name,
        location: s.location,
        latitude: s.latitude,
        longitude: s.longitude,
        basePricePerKg: s.basePrice,
        offerQuantityMt: s.qty,
        userId: sellerUser.id,
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
   - Distance Slabs: ${initialSlabs.length}
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
