# 🚀 COMPLETE INSTALLATION GUIDE

## Prerequisites Check

Before starting, ensure you have:
- [ ] Node.js 18 or higher installed
- [ ] npm 9 or higher installed
- [ ] Git installed
- [ ] A Neon DB account (free tier works)
- [ ] The Excel file "2nd Price Auction2.0.xlsx" in the project root

### Verify Installations

```bash
node --version    # Should show v18.x.x or higher
npm --version     # Should show 9.x.x or higher
```

---

## Step-by-Step Installation

### Step 1: Navigate to Project Directory

```bash
cd "c:\Users\Royal Computer's\Desktop\secondprice"
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages (~5 minutes on first run).

### Step 3: Set Up Neon Database

1. **Create Neon Account**
   - Go to https://console.neon.tech/
   - Sign up for free account
   - Create new project

2. **Get Connection String**
   - Click on your project
   - Go to "Connection Details"
   - Copy the connection string
   - It looks like: `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`

### Step 4: Configure Environment Variables

1. **Open the .env file** in the project root
2. **Update these values**:

```env
# Paste your Neon DB connection string here
DATABASE_URL="postgresql://your-connection-string-here"

# Keep this for local development
NEXTAUTH_URL="http://localhost:3000"

# Generate a secret (see below)
NEXTAUTH_SECRET="your-generated-secret-here"
```

3. **Generate NEXTAUTH_SECRET**

**Option A - Using OpenSSL (Mac/Linux/Git Bash):**
```bash
openssl rand -base64 32
```

**Option B - Using PowerShell (Windows):**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Option C - Online Generator:**
- Visit: https://generate-secret.vercel.app/32
- Copy the generated secret

4. **Paste the secret** into your `.env` file

### Step 5: Initialize Database

```bash
# Push schema to database
npm run db:push

# Generate Prisma Client
npx prisma generate
```

You should see: ✔ Generated Prisma Client

### Step 6: Seed Database

```bash
npm run db:seed
```

Expected output:
```
🌱 Starting seed...
✅ Created admin: admin@auction.com
✅ Created buyer: buyer1@auction.com
✅ Created buyer: buyer2@auction.com
📊 Reading Excel file...
✅ Created X sellers from Excel
✅ Created auction: default-auction
🎉 Seed completed!
```

If Excel loading fails, it will create sample sellers instead.

### Step 7: Start Development Server

```bash
npm run dev
```

You should see:
```
▲ Next.js 14.2.0
- Local:        http://localhost:3000
- Ready in X.Xs
```

### Step 8: Open Application

Open your browser and go to: **http://localhost:3000**

---

## Verification Steps

### ✅ Test 1: Admin Login

1. Go to http://localhost:3000
2. Login with:
   - Email: `admin@auction.com`
   - Password: `admin123`
3. Should redirect to `/admin`
4. Should see "Admin Panel" dashboard

### ✅ Test 2: Configure Auction

1. Set start time (e.g., 2 minutes from now)
2. Set end time (e.g., 10 minutes from now)
3. Set tick size: `0.01`
4. Click "Save Configuration"
5. Should see success message

### ✅ Test 3: View Sellers

1. Scroll down on admin page
2. Should see list of sellers from Excel
3. Verify quantities and reserve prices

### ✅ Test 4: Start Auction

1. Click "START AUCTION" button
2. Confirm when prompted
3. Status should change to "ACTIVE"
4. Should see live auction view

### ✅ Test 5: Buyer Login (New Tab)

1. Open new browser tab/window
2. Go to http://localhost:3000
3. Login with:
   - Email: `buyer1@auction.com`
   - Password: `buyer123`
4. Should redirect to `/buyer`
5. Should see bidding screen

### ✅ Test 6: Submit Bids

1. As buyer, view seller table
2. Enter bid values:
   - Price 1: `15.00`, Quantity 1: `50`
   - Price 2: `12.50`, Quantity 2: `75`
   - Price 3: `10.00`, Quantity 3: `100`
3. Click "Submit Bid"
4. Should see success message

### ✅ Test 7: Admin Views Live Bids

1. Switch to admin tab
2. Should see buyer's bid in live bids table
3. Bid should show all 3 price-quantity pairs

### ✅ Test 8: End Auction

1. As admin, click "End Auction"
2. Confirm when prompted
3. Should see results page with:
   - Clearing price
   - Clearing quantity
   - Total trade value
   - Supply-demand graph
   - Allocation table

### ✅ Test 9: Download PDF Report

1. Click "Download PDF Report"
2. PDF should download
3. Open PDF and verify:
   - Summary data
   - Allocation table
   - Buyer bids
   - Market analysis

### ✅ Test 10: Buyer Views Results

1. Switch to buyer tab
2. Should automatically show results page
3. Should see:
   - Clearing price
   - Your submitted bids
   - Seller allocations
4. Download PDF report

### ✅ Test 11: Reset Auction

1. As admin, click "Reset Auction"
2. Confirm when prompted
3. Status should return to "PENDING"
4. Bids should be cleared
5. Can configure new auction

---

## Troubleshooting

### Issue: Database Connection Error

**Problem:** Cannot connect to database

**Solution:**
1. Verify DATABASE_URL in .env
2. Check Neon dashboard is online
3. Ensure connection string includes `?sslmode=require`
4. Run: `npx prisma db push` again

### Issue: Prisma Client Not Generated

**Problem:** Error about @prisma/client

**Solution:**
```bash
npx prisma generate
npm install
```

### Issue: Seed Script Fails

**Problem:** Excel file not found

**Solution:**
1. Verify file name: `2nd Price Auction2.0.xlsx`
2. File must be in project root
3. If missing, seed will create sample data

### Issue: Port 3000 Already in Use

**Problem:** Port conflict

**Solution:**
```bash
# Kill process on port 3000
npx kill-port 3000

# Or use different port
PORT=3001 npm run dev
```

### Issue: Authentication Not Working

**Problem:** Login fails or redirects incorrectly

**Solution:**
1. Verify NEXTAUTH_SECRET is set
2. Clear browser cookies
3. Restart dev server
4. Check NEXTAUTH_URL matches your domain

### Issue: PDF Generation Fails

**Problem:** Cannot download report

**Solution:**
1. Check browser console for errors
2. Verify auction is completed
3. Ensure allocations exist
4. Try different browser

---

## Database Tools

### View Database in Browser

```bash
npm run db:studio
```

Opens Prisma Studio at http://localhost:5555 to view/edit data.

### Reset Database Completely

```bash
# WARNING: This deletes all data
npm run db:push -- --force-reset
npm run db:seed
```

---

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Check TypeScript errors
npm run type-check

# View database
npm run db:studio

# Re-seed database
npm run db:seed
```

---

## Project Structure Overview

```
secondprice/
├── 2nd Price Auction2.0.xlsx    ← Your Excel file goes here
├── .env                          ← Your configuration
├── .env.example                  ← Template
├── package.json                  ← Dependencies
├── prisma/
│   ├── schema.prisma            ← Database schema
│   └── seed.ts                  ← Seeding script
├── app/
│   ├── page.tsx                 ← Login page (/)
│   ├── admin/                   ← Admin dashboard
│   ├── buyer/                   ← Buyer dashboard
│   └── api/                     ← Backend APIs
├── lib/
│   ├── auctionEngine.ts         ← Core auction logic
│   └── prisma.ts                ← DB client
├── README.md                    ← Full documentation
├── SETUP.md                     ← Quick start guide
└── PROJECT_SUMMARY.md           ← Feature overview
```

---

## Next Steps

### For Development
1. ✅ Complete all verification steps
2. ✅ Test with multiple buyers
3. ✅ Verify Excel calculations match
4. ✅ Test edge cases

### For Production
1. [ ] Read DEPLOYMENT.md
2. [ ] Set up production database
3. [ ] Configure environment variables
4. [ ] Deploy to hosting platform
5. [ ] Test in production environment

---

## Support

### Documentation Files
- `README.md` - Complete documentation
- `SETUP.md` - Quick start guide
- `DEPLOYMENT.md` - Production deployment
- `PROJECT_SUMMARY.md` - Feature overview

### Common Issues
- Check `.env` configuration
- Verify database connection
- Ensure Excel file is present
- Review console logs for errors

### Still Need Help?
1. Check application logs in terminal
2. View browser console (F12)
3. Use Prisma Studio to verify data
4. Review error messages carefully

---

## Success Criteria

You're ready to proceed when:
- ✅ Application runs without errors
- ✅ Admin can login and configure auction
- ✅ Buyer can login and submit bids
- ✅ Live bid monitoring works
- ✅ Auction completes successfully
- ✅ Results display correctly
- ✅ PDF generates successfully
- ✅ Reset works properly

---

**Installation Complete! 🎉**

Your second price auction system is now ready to use!
