# QUICK START GUIDE

## Step 1: Install Dependencies
npm install

## Step 2: Configure Environment
1. Copy .env.example to .env
2. Get Neon DB connection string from https://console.neon.tech/
3. Update DATABASE_URL in .env
4. Generate NEXTAUTH_SECRET:
   - Run: openssl rand -base64 32
   - Or online: https://generate-secret.vercel.app/32
   - Paste result into .env

## Step 3: Set Up Database
npx prisma db push
npx prisma generate

## Step 4: Seed Database
npm run db:seed

## Step 5: Run Development Server
npm run dev

## Step 6: Access Application
Open http://localhost:3000

## Default Login Credentials

Admin:
- Email: admin@auction.com
- Password: admin123

Buyer:
- Email: buyer1@auction.com
- Password: buyer123

## Troubleshooting

If you see database errors:
1. Verify DATABASE_URL is correct
2. Run: npx prisma db push
3. Run: npx prisma generate

If seed fails:
1. Ensure Excel file "2nd Price Auction2.0.xlsx" is in root directory
2. Check Excel has columns: Seller, Quantity, Reserve Price
3. Run seed again: npm run db:seed

## Excel File Format

The Excel file should have these columns:
- Seller Name (or "Seller" or "Name")
- Quantity (or "Qty")
- Reserve Price (or "Price")

Example:
| Seller | Quantity | Reserve Price |
|--------|----------|---------------|
| ABC    | 100      | 10.50         |
| XYZ    | 150      | 12.00         |

## Production Build

npm run build
npm start

## Need Help?

Check README.md for detailed documentation.
