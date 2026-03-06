import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * API pour initialiser les tables Supabase
 * Appeler cette route après le déploiement
 * GET /api/init-db
 */
export async function GET() {
  try {
    console.log('🔧 Initialisation des tables Supabase...');

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

        -- Résultats
        "homeScore" INTEGER,
        "awayScore" INTEGER,
        "totalGoals" INTEGER,
        "actualResult" TEXT,
        "resultMatch" BOOLEAN,
        "goalsMatch" BOOLEAN,
        "cardsMatch" BOOLEAN,

        -- Statut
        status TEXT DEFAULT 'pending',

        -- Métadonnées
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

    console.log('✅ Tables créées avec succès');

    // Vérifier la connexion en comptant les enregistrements
    let predictionCount = 0;
    try {
      const result = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM predictions`;
      predictionCount = (result as any[])?.[0]?.count || 0;
    } catch {
      // Table vide ou erreur mineure
    }

    return NextResponse.json({
      success: true,
      message: '✅ Tables Supabase créées avec succès',
      tables: ['predictions', 'bankroll_stats', 'users'],
      predictionCount
    });

  } catch (error: any) {
    console.error('❌ Erreur initialisation:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      hint: 'Vérifiez que DATABASE_URL est correctement configuré dans Vercel'
    }, { status: 500 });
  }
}
