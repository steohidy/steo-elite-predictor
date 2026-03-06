import { PrismaClient } from '../generated';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Utilise l'URL de pooling pour Vercel serverless
const databaseUrl = process.env['POSTGRES_PRISMA_URL'] || process.env.DATABASE_URL;

// Créer le client Prisma
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: databaseUrl,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
