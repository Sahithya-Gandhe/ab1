# Second Price Auction System

A production-ready second price auction platform built with Next.js 14, React, TypeScript, Prisma, and Neon DB.

## 🎯 Features

### Core Functionality
- **Second Price Auction Engine**: Pure TypeScript implementation matching Excel logic exactly
- **Role-based Authentication**: Common login page with automatic redirection (Admin/Buyer)
- **Real-time Auction Monitoring**: Live bid tracking for admins (polling-based)
- **Excel Data Import**: Automatic seller data seeding from Excel file
- **PDF Report Generation**: Comprehensive auction reports with allocations and charts

### Admin Panel
- Configure auction start time, end time, and tick size
- Manual auction start with START button
- Live view of all bids in real-time
- View complete seller supply data
- Post-auction results with clearing price and allocations
- Supply-demand curve visualization
- PDF report generation

### Buyer Panel
- Welcome screen with countdown timer
- View seller supply table
- Submit up to 3 price-quantity bid combinations
- Automatic tick validation and correction
- Post-auction results viewing
- Seller-wise allocation details
- Personal PDF report download

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (Neon DB recommended)
- Git

## 🚀 Installation

### 1. Clone the Repository

```bash
cd "c:\Users\Royal Computer's\Desktop\secondprice"
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Database - Replace with your Neon DB connection string
DATABASE_URL="postgresql://username:password@your-neon-db.neon.tech/secondprice?sslmode=require"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"
```

To generate a secure NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

### 4. Set Up Database

Push the Prisma schema to your database:

```bash
npx prisma db push
```

Generate Prisma Client:

```bash
npx prisma generate
```

### 5. Seed the Database

The seed script will:
- Create admin user (admin@auction.com / admin123)
- Create sample buyers (buyer1@auction.com / buyer123)
- Load sellers from the Excel file `2nd Price Auction2.0.xlsx`

```bash
npm run db:seed
```

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📊 Excel File Format

The system expects the Excel file `2nd Price Auction2.0.xlsx` with the following columns:

| Column Name | Description | Type |
|-------------|-------------|------|
| Seller / Seller Name / Name | Seller identifier | String |
| Quantity / Qty | Units available | Number |
| Reserve Price / Price | Minimum price | Number |

The seed script will automatically parse and import this data.

## 🔐 Default Login Credentials

### Admin
- **Email**: admin@auction.com
- **Password**: admin123

### Buyers
- **Email**: buyer1@auction.com
- **Password**: buyer123

- **Email**: buyer2@auction.com
- **Password**: buyer123

## 🎮 Usage Flow

### Admin Workflow

1. **Login** at `/` with admin credentials
2. **Configure Auction** (/admin)
   - Set start time, end time, tick size
   - Review seller data
   - Click "START AUCTION" button
3. **Monitor Live** (/admin)
   - View all incoming bids in real-time
   - See seller supply data
   - Manually end auction when ready
4. **View Results** (/admin)
   - See clearing price and quantity
   - View supply-demand graph
   - Review seller allocations
   - Download PDF report
   - Reset auction for next round

### Buyer Workflow

1. **Login** at `/` with buyer credentials
2. **Wait for Start** (/buyer)
   - See countdown timer
   - Review auction instructions
3. **Submit Bids** (/buyer)
   - View available seller supply
   - Enter up to 3 price-quantity pairs
   - Prices auto-correct to tick size
   - Update bids anytime during auction
4. **View Results** (/buyer)
   - See clearing price and quantity
   - View your submitted bids
   - See seller allocations
   - Download PDF report

## 🧮 Auction Engine Logic

The auction engine implements the following second price auction rules:

### 1. Supply Calculation
- Sort sellers by reserve price (ascending)
- Calculate cumulative supply at each price point

### 2. Demand Calculation
- Flatten all buyer bids into individual price-quantity pairs
- Sort by price (descending)
- Calculate cumulative demand at each price point

### 3. Clearing Price Determination

**Case 1: Demand > Supply** (Seller's Market)
- Clearing price = Highest rejected bid (second price)

**Case 2: Supply > Demand** (Buyer's Market)
- Clearing price = Lowest accepted reserve price

**Case 3: Perfect Match**
- Clearing price = max(highest rejected bid, lowest accepted reserve)

### 4. Allocation & Bonus
- Each seller receives: quantity × clearing price
- Seller bonus: (clearing price - reserve price) × quantity
- Only sellers with reserve price ≤ clearing price receive allocation

## 📁 Project Structure

```
secondprice/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/     # NextAuth configuration
│   │   ├── auction/                # Auction management APIs
│   │   ├── bids/                   # Bid submission APIs
│   │   └── sellers/                # Seller data APIs
│   ├── admin/                      # Admin dashboard
│   ├── buyer/                      # Buyer dashboard
│   ├── globals.css                 # Global styles
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Login page
├── lib/
│   ├── auctionEngine.ts           # Core auction logic
│   └── prisma.ts                   # Prisma client
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── seed.ts                     # Database seeding
├── types/
│   └── next-auth.d.ts             # TypeScript definitions
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 API Endpoints

### Auction Management
- `GET /api/auction/status` - Get current auction status
- `GET /api/auction/config` - Get auction configuration
- `POST /api/auction/config` - Save auction configuration
- `POST /api/auction/start` - Start the auction
- `POST /api/auction/end` - End auction and calculate results
- `POST /api/auction/reset` - Reset auction for new round
- `GET /api/auction/results` - Get auction results
- `POST /api/auction/report` - Generate PDF report

### Bid Management
- `GET /api/bids` - Get all bids (admin only)
- `POST /api/bids/submit` - Submit/update buyer bid
- `GET /api/bids/my-bid` - Get current user's bid

### Seller Data
- `GET /api/sellers` - Get all sellers

## 🎨 Technologies Used

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL (Neon DB), Prisma ORM
- **Authentication**: NextAuth.js with Credentials Provider
- **Charts**: Recharts
- **PDF Generation**: jsPDF with autoTable
- **Excel Parsing**: xlsx

## 🔒 Security Features

- Bcrypt password hashing
- JWT-based session management
- Role-based access control
- Server-side authentication checks
- Protected API routes

## 🚀 Production Deployment

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Environment Variables for Production

Update `.env` with production values:
- Set `NEXTAUTH_URL` to your production domain
- Use a strong `NEXTAUTH_SECRET`
- Use production database connection string

### Recommended Hosting

- **Platform**: Vercel, Railway, or AWS
- **Database**: Neon DB (recommended), Supabase, or PostgreSQL
- **File Storage**: Keep Excel file in project root or use cloud storage

## 🧪 Testing

1. **Create test auction**:
   - Login as admin
   - Configure auction times
   - Start auction

2. **Submit test bids**:
   - Login as buyer1
   - Submit bids with various price-quantity combinations
   - Update bids to test modification

3. **Verify calculations**:
   - End auction as admin
   - Compare clearing price with Excel calculations
   - Verify allocations match expected results

## 📝 Notes

- **No Registration**: Users are pre-seeded; no registration flow
- **No Seller Dashboard**: Sellers are database entities only
- **Tick Rounding**: Display only; calculations use exact values
- **Real-time Updates**: Polling-based (2-second intervals)
- **Excel Match**: Auction engine must match Excel output exactly

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Test database connection
npx prisma db push

# View Prisma Studio
npx prisma studio
```

### Excel Import Fails
- Verify Excel file is named `2nd Price Auction2.0.xlsx`
- Check column names match expected format
- Ensure file is in project root directory

### Authentication Issues
- Verify `NEXTAUTH_SECRET` is set
- Clear browser cookies
- Check `NEXTAUTH_URL` matches your domain

## 📄 License

This project is proprietary and confidential.

## 👨‍💻 Support

For issues or questions, please contact the development team.

---

**Built with ❤️ using Next.js and TypeScript**
