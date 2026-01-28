// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcryptjs';
// import * as XLSX from 'xlsx';
// import * as path from 'path';

// const prisma = new PrismaClient();

// async function main() {
//   console.log('🌱 Starting seed...');

//   // Create Admin user
//   const hashedAdminPassword = await bcrypt.hash('admin123', 10);
//   const admin = await prisma.user.upsert({
//     where: { email: 'admin@auction.com' },
//     update: {},
//     create: {
//       email: 'admin@auction.com',
//       password: hashedAdminPassword,
//       name: 'Admin User',
//       role: 'ADMIN',
//     },
//   });
//   console.log('✅ Created admin:', admin.email);

//   // Create 4 buyers with credentials b1@ab.com/b1, b2@ab.com/b2, etc.
//   const buyers = [
//     { email: 'b1@ab.com', password: 'b1', name: 'Buyer 1' },
//     { email: 'b2@ab.com', password: 'b2', name: 'Buyer 2' },
//     { email: 'b3@ab.com', password: 'b3', name: 'Buyer 3' },
//     { email: 'b4@ab.com', password: 'b4', name: 'Buyer 4' },
//   ];

//   for (const buyerData of buyers) {
//     const hashedPassword = await bcrypt.hash(buyerData.password, 10);
//     const buyer = await prisma.user.upsert({
//       where: { email: buyerData.email },
//       update: {},
//       create: {
//         email: buyerData.email,
//         password: hashedPassword,
//         name: buyerData.name,
//         role: 'BUYER',
//       },
//     });
//     console.log('✅ Created buyer:', buyer.email);
//   }

//   // Load 15 sellers from Excel file
//   try {
//     const excelPath = path.join(process.cwd(), '2nd Price Auction2.0.xlsx');
//     const workbook = XLSX.readFile(excelPath);
//     const sheetName = workbook.SheetNames[0];
//     const worksheet = workbook.Sheets[sheetName];
//     const data: any[] = XLSX.utils.sheet_to_json(worksheet);

//     console.log('📊 Reading Excel file for sellers...');

//     // Delete existing sellers
//     await prisma.seller.deleteMany({});

//     // Parse and insert 15 sellers from Excel
//     // Excel columns: "Price (₹/Kg)" for price, "Seller Quantity (MT)" for quantity
//     let sellerCount = 0;
//     for (const row of data) {
//       if (sellerCount >= 15) break; // Limit to 15 sellers
      
//       const reservePrice = parseFloat(row['Price (₹/Kg)'] || 0);
//       const quantity = parseFloat(row['Seller Quantity (MT)'] || 0);
      
//       if (quantity > 0 && reservePrice > 0) {
//         const sellerName = `Seller ${sellerCount + 1}`;
//         await prisma.seller.create({
//           data: {
//             name: sellerName,
//             quantity: Math.round(quantity * 10000) / 10000,
//             reservePrice: Math.round(reservePrice * 100) / 100,
//           },
//         });
//         sellerCount++;
//         console.log(`  ✓ ${sellerName}: Qty: ${quantity} MT, Price: ₹${reservePrice.toFixed(2)}/Kg`);
//       }
//     }

//     console.log(`✅ Created ${sellerCount} sellers from Excel`);
//   } catch (error) {
//     console.error('⚠️  Could not load Excel file:', error);
//     console.log('Creating 15 sample sellers instead...');
    
//     // Fallback: Create 15 sample sellers if Excel loading fails
//     await prisma.seller.deleteMany({});
    
//     const sampleSellers = [
//       { name: 'Seller 1', quantity: 100, reservePrice: 10.00 },
//       { name: 'Seller 2', quantity: 150, reservePrice: 12.00 },
//       { name: 'Seller 3', quantity: 200, reservePrice: 14.00 },
//       { name: 'Seller 4', quantity: 120, reservePrice: 16.00 },
//       { name: 'Seller 5', quantity: 80, reservePrice: 18.00 },
//       { name: 'Seller 6', quantity: 130, reservePrice: 20.00 },
//       { name: 'Seller 7', quantity: 110, reservePrice: 22.00 },
//       { name: 'Seller 8', quantity: 90, reservePrice: 24.00 },
//       { name: 'Seller 9', quantity: 160, reservePrice: 26.00 },
//       { name: 'Seller 10', quantity: 140, reservePrice: 28.00 },
//       { name: 'Seller 11', quantity: 95, reservePrice: 30.00 },
//       { name: 'Seller 12', quantity: 105, reservePrice: 32.00 },
//       { name: 'Seller 13', quantity: 125, reservePrice: 34.00 },
//       { name: 'Seller 14', quantity: 115, reservePrice: 36.00 },
//       { name: 'Seller 15', quantity: 135, reservePrice: 38.00 },
//        { name: 'Seller 16', quantity: 400, reservePrice: 24.00 },
//       { name: 'Seller 2', quantity: 300, reservePrice: 24.20 },
//       { name: 'Seller 3', quantity: 200, reservePrice: 24.40 },
//       { name: 'Seller 4', quantity: 100, reservePrice: 24.60 },
//       { name: 'Seller 5', quantity: 200, reservePrice: 24.80 },
//       { name: 'Seller 6', quantity: 200, reservePrice: 25.00 },
//     ];

//     for (const seller of sampleSellers) {
//       await prisma.seller.create({ data: seller });
//     }
//     console.log('✅ Created 15 sample sellers');
//   }

//   // Don't create auction - let admin create it dynamically
//   console.log('✅ Skipped auction creation - admin will create dynamically');

//   console.log('🎉 Seed completed!');
// }

// main()
//   .catch((e) => {
//     console.error('❌ Seed failed:', e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });


import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ALL sellers from Excel Page 1 (static)...');

  // SAFETY: only Seller table
  await prisma.seller.deleteMany({});
  console.log('🗑️  Seller table cleared');

  const sellers = [
    { name: 'Seller 1',  reservePrice: 21.00, quantity: 200.0000 },
    { name: 'Seller 2',  reservePrice: 21.20, quantity: 300.0000 },
    { name: 'Seller 3',  reservePrice: 21.40, quantity: 400.0000 },
    { name: 'Seller 4',  reservePrice: 21.60, quantity: 600.0000 },
    { name: 'Seller 5',  reservePrice: 21.80, quantity: 500.0000 },
    { name: 'Seller 6',  reservePrice: 22.00, quantity: 300.0000 },
    { name: 'Seller 7',  reservePrice: 22.20, quantity: 200.0000 },
    { name: 'Seller 8',  reservePrice: 22.40, quantity: 600.0000 },
    { name: 'Seller 9',  reservePrice: 22.60, quantity: 200.0000 },
    { name: 'Seller 10', reservePrice: 22.80, quantity: 300.0000 },
    { name: 'Seller 11', reservePrice: 23.00, quantity: 400.0000 },
    { name: 'Seller 12', reservePrice: 23.20, quantity: 300.0000 },
    { name: 'Seller 13', reservePrice: 23.40, quantity: 200.0000 },
    { name: 'Seller 14', reservePrice: 23.60, quantity: 500.0000 },
    { name: 'Seller 15', reservePrice: 23.80, quantity: 600.0000 },
    { name: 'Seller 16', reservePrice: 24.00, quantity: 400.0000 },
    { name: 'Seller 17', reservePrice: 24.20, quantity: 300.0000 },
    { name: 'Seller 18', reservePrice: 24.40, quantity: 200.0000 },
    { name: 'Seller 19', reservePrice: 24.60, quantity: 100.0000 },
    { name: 'Seller 20', reservePrice: 24.80, quantity: 200.0000 },
    { name: 'Seller 21', reservePrice: 25.00, quantity: 200.0000 },
  ];

  for (const seller of sellers) {
    await prisma.seller.create({ data: seller });
    console.log(
      `✓ ${seller.name} | ₹${seller.reservePrice}/Kg | ${seller.quantity} MT`
    );
  }

  console.log(`✅ Seeded ${sellers.length} sellers (Excel Page 1 exact)`);
}

main()
  .catch((e) => {
    console.error('❌ Seller seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
