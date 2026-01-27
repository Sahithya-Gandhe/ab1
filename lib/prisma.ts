import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  // Throw early with a clear message so production logs show the real issue
  throw new Error(
    'Missing DATABASE_URL environment variable. Configure DATABASE_URL in your hosting provider (Netlify/Vercel) to point to your PostgreSQL database.'
  );

}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
