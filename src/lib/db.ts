import { PrismaClient } from '../generated';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  dbInitialized: boolean;
};

// Créer le client Prisma
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Initialiser les tables si elles n'existent pas
async function initializeDatabase() {
  if (globalForPrisma.dbInitialized) return;

  try {
    // Vérifier si la table predictions existe
    await prisma.$queryRaw`SELECT 1 FROM predictions LIMIT 1`;
    globalForPrisma.dbInitialized = true;
    console.log('✅ Tables déjà existantes');
  } catch {
    console.log('📋 Création des tables Supabase...');

    try {
      // Créer la table predictions avec les colonnes exactes du schéma Prisma
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS predictions (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
          "matchId" TEXT UNIQUE NOT NULL,
          "homeTeam" TEXT NOT NULL,
          "awayTeam" TEXT NOT NULL,
          league TEXT NOT NULL,
          sport TEXT DEFAULT 'Foot',
          "matchDate" TIMESTAMP NOT NULL,
          "oddsHome" DOUBLE PRECISION NOT NULL,
          "oddsDraw" DOUBLE PRECISION,
          "oddsAway" DOUBLE PRECISION NOT NULL,
          "predictedResult" TEXT NOT NULL,
          "predictedGoals" TEXT,
          "predictedCards" TEXT,
          confidence TEXT DEFAULT 'medium',
          "riskPercentage" INTEGER DEFAULT 50,
          "homeScore" INTEGER,
          "awayScore" INTEGER,
          "totalGoals" INTEGER,
          "actualResult" TEXT,
          "resultMatch" BOOLEAN,
          "goalsMatch" BOOLEAN,
          "cardsMatch" BOOLEAN,
          status TEXT DEFAULT 'pending',
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "checkedAt" TIMESTAMP,
          signature TEXT
        );
      `);

      // Créer les index
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS predictions_matchDate_idx ON predictions("matchDate");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS predictions_status_idx ON predictions(status);`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS predictions_sport_idx ON predictions(sport);`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS predictions_riskPercentage_idx ON predictions("riskPercentage");`);

      // Créer la table bankroll_stats
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS bankroll_stats (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
          date TIMESTAMP DEFAULT NOW(),
          balance DOUBLE PRECISION NOT NULL,
          "totalBets" INTEGER DEFAULT 0,
          wins INTEGER DEFAULT 0,
          losses INTEGER DEFAULT 0,
          "profitLoss" DOUBLE PRECISION DEFAULT 0
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS bankroll_stats_date_idx ON bankroll_stats(date);`);

      // Créer la table users
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
          username TEXT UNIQUE NOT NULL,
          "passwordHash" TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "lastLogin" TIMESTAMP
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);`);

      globalForPrisma.dbInitialized = true;
      console.log('✅ Tables Supabase créées avec succès');
    } catch (createError) {
      console.error('❌ Erreur création tables:', createError);
    }
  }
}

// Initialiser au premier import (côté serveur uniquement)
if (typeof window === 'undefined') {
  initializeDatabase().catch(err => {
    console.error('Erreur initialisation DB:', err.message);
  });
}

export default prisma;
