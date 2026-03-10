import { PrismaClient } from '../generated';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Utilise l'URL de pooling pour Vercel serverless
const databaseUrl = process.env['POSTGRES_PRISMA_URL'] || process.env.DATABASE_URL;

// Créer le client Prisma avec l'adapter PostgreSQL
export const prisma = globalForPrisma.prisma ?? (() => {
  if (!databaseUrl) {
    console.warn('⚠️ DATABASE_URL non configurée');
    return new PrismaClient();
  }
  
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
})();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
