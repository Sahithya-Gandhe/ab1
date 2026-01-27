# ⚡ QUICK REFERENCE CARD

## 🎯 Get Started in 5 Steps

```bash
# 1. Install
npm install

# 2. Configure .env
# Edit .env with your Neon DB connection

# 3. Setup Database
npx prisma db push && npx prisma generate

# 4. Seed Data
npm run db:seed

# 5. Run
npm run dev
```

**Then open**: http://localhost:3000

---

## 🔑 Default Logins

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@auction.com | admin123 |
| Buyer | buyer1@auction.com | buyer123 |
| Buyer | buyer2@auction.com | buyer123 |

---

## 📝 Essential Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm start                # Run production build

# Database
npm run db:push          # Push schema changes
npm run db:seed          # Seed database
npm run db:studio        # Visual database editor

# Utilities
npm run type-check       # Check TypeScript
npm install              # Install dependencies
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `.env` | Your configuration |
| `README.md` | Full documentation |
| `INSTALLATION.md` | Setup instructions |
| `lib/auctionEngine.ts` | Core auction logic |
| `prisma/schema.prisma` | Database schema |

---

## 🌐 Routes

| URL | Access | Purpose |
|-----|--------|---------|
| `/` | Public | Login page |
| `/admin` | Admin only | Admin dashboard |
| `/buyer` | Buyer only | Buyer dashboard |

---

## 🔧 Environment Variables

```env
# Required
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-this"
```

Generate secret:
```bash
openssl rand -base64 32
```

---

## 🚨 Troubleshooting

### Database Connection Error
```bash
npx prisma db push
```

### Prisma Client Error
```bash
npx prisma generate
npm install
```

### Port 3000 in Use
```bash
npx kill-port 3000
```

### Seed Fails
- Check Excel file: `2nd Price Auction2.0.xlsx`
- File must be in root directory
- Will use sample data as fallback

---

## 📊 Auction Flow

### Admin Steps
1. Login → Configure → START
2. Monitor live bids
3. END → View results → Download PDF
4. RESET for next auction

### Buyer Steps
1. Login → Wait for start
2. Submit up to 3 bids
3. Update anytime
4. View results → Download PDF

---

## 🎨 Features

- ✅ Second price auction (3 cases)
- ✅ Real-time monitoring (admin)
- ✅ Excel seller import
- ✅ PDF report generation
- ✅ Supply-demand charts
- ✅ Role-based access
- ✅ Tick size validation

---

## 📚 Documentation Files

1. **README.md** - Start here
2. **INSTALLATION.md** - Detailed setup
3. **SETUP.md** - Quick start
4. **DEPLOYMENT.md** - Production
5. **PROJECT_SUMMARY.md** - Features
6. **CHECKLIST.md** - Verification
7. **DELIVERY.md** - This summary

---

## 🏗️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind
- **Backend**: Next.js API, Node.js
- **Database**: PostgreSQL (Neon), Prisma
- **Auth**: NextAuth.js
- **Charts**: Recharts
- **PDF**: jsPDF

---

## 🎯 Core Algorithm

1. **Supply**: Sellers sorted by reserve (↑)
2. **Demand**: Bids sorted by price (↓)
3. **Clearing**:
   - Demand > Supply: Second price
   - Supply > Demand: Lowest reserve
   - Match: Max(rejected, reserve)
4. **Allocate**: Sellers ≤ clearing price
5. **Bonus**: (clearing - reserve) × qty

---

## 🔒 Security

- ✅ Bcrypt passwords
- ✅ JWT sessions
- ✅ Protected routes
- ✅ Role-based access
- ✅ Server validation
- ✅ Environment vars

---

## 📞 Quick Help

**Problem**: Can't login
**Fix**: Check credentials, clear cookies

**Problem**: Database error
**Fix**: Verify DATABASE_URL, run db:push

**Problem**: Excel import fails
**Fix**: Check filename, will use sample data

**Problem**: PDF won't generate
**Fix**: Complete auction first, check console

---

## ✅ Verification Checklist

- [ ] npm install successful
- [ ] .env configured
- [ ] Database connected
- [ ] Seed completed
- [ ] Dev server running
- [ ] Admin login works
- [ ] Buyer login works
- [ ] Can start auction
- [ ] Can submit bids
- [ ] Can end auction
- [ ] Results show correctly
- [ ] PDF downloads

---

## 🚀 Production Ready

When deploying:
1. Update DATABASE_URL (production)
2. Update NEXTAUTH_URL (your domain)
3. Generate new NEXTAUTH_SECRET
4. Run: `npm run build`
5. Deploy to Vercel/Railway/AWS

---

## 📈 Status

**✅ COMPLETE & READY**

All features implemented.
All requirements met.
Production ready.

---

## 💡 Remember

- Sellers from Excel (no dashboard)
- Common login (role redirect)
- NO registration
- Manual START button
- Admin sees live bids
- Buyers isolated
- Pure TS engine
- Exact Excel match

---

**For detailed help, read README.md**
**For setup help, read INSTALLATION.md**
**For deployment, read DEPLOYMENT.md**

**🎉 You're ready to go!**
