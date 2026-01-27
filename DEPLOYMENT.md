# Deployment Checklist

## Pre-deployment Steps

### 1. Environment Variables
Set these in your hosting platform:
- `DATABASE_URL` - Production PostgreSQL connection string
- `NEXTAUTH_URL` - Production URL (e.g., https://your-domain.com)
- `NEXTAUTH_SECRET` - Generate new secret for production

### 2. Database Setup
```bash
# Push schema to production database
npx prisma db push

# Generate Prisma client
npx prisma generate

# Seed production database
npm run db:seed
```

### 3. Build Application
```bash
npm run build
```

## Vercel Deployment

1. **Install Vercel CLI** (optional)
```bash
npm i -g vercel
```

2. **Deploy via Dashboard**
- Go to https://vercel.com/new
- Import your GitHub repository
- Add environment variables
- Deploy

3. **Deploy via CLI**
```bash
vercel
vercel --prod
```

## Railway Deployment

1. **Create New Project**
- Go to https://railway.app/
- Create new project
- Add PostgreSQL database
- Connect GitHub repository

2. **Configure Environment**
- Copy DATABASE_URL from Railway PostgreSQL
- Add NEXTAUTH_URL with Railway URL
- Add NEXTAUTH_SECRET

3. **Deploy**
- Railway auto-deploys on git push

## AWS/VPS Deployment

### Using PM2

1. **Install PM2**
```bash
npm install -g pm2
```

2. **Build Application**
```bash
npm run build
```

3. **Start with PM2**
```bash
pm2 start npm --name "auction" -- start
pm2 save
pm2 startup
```

### Using Docker

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t auction-app .
docker run -p 3000:3000 --env-file .env auction-app
```

## Post-Deployment

### 1. Test Authentication
- Test admin login
- Test buyer login
- Verify role-based redirects

### 2. Test Auction Flow
- Configure auction
- Start auction
- Submit bids
- End auction
- Verify results
- Download PDF

### 3. Database Backup
```bash
# Export database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql
```

### 4. Monitoring
- Set up error tracking (Sentry)
- Monitor database performance
- Set up uptime monitoring

## Security Checklist

- ✅ Strong NEXTAUTH_SECRET in production
- ✅ Secure database credentials
- ✅ HTTPS enabled
- ✅ Environment variables not exposed
- ✅ Database backups configured
- ✅ Rate limiting on API routes (optional)
- ✅ CORS configured properly

## Performance Optimization

### Enable Caching
Add to `next.config.mjs`:
```js
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
};
```

### Database Indexing
Already configured in Prisma schema:
- Auction ID indexes
- User ID indexes
- Seller ID indexes

## Troubleshooting

### Build Fails
```bash
# Clear cache
rm -rf .next
rm -rf node_modules
npm install
npm run build
```

### Database Connection Issues
- Verify DATABASE_URL format
- Check firewall rules
- Ensure SSL mode is configured

### Authentication Issues
- Verify NEXTAUTH_URL matches domain
- Check NEXTAUTH_SECRET is set
- Clear browser cookies

## Rollback Plan

1. Keep previous build
2. Database backup before migrations
3. Version control with git tags
4. Document deployment steps

## Maintenance

### Update Dependencies
```bash
npm outdated
npm update
```

### Database Migrations
```bash
npx prisma migrate dev
npx prisma migrate deploy
```

### Monitor Logs
```bash
# PM2 logs
pm2 logs auction

# Vercel logs
vercel logs

# Railway logs
railway logs
```

## Support

For production issues:
1. Check application logs
2. Verify database connectivity
3. Review environment variables
4. Contact development team
