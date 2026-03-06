import { NextResponse } from 'next/server';
import PredictionStore from '@/lib/store';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'predictions_old.json');

/**
 * GET - Infos du stockage
 */
export async function GET() {
  try {
    const info = await PredictionStore.getInfo();
    const stats = await PredictionStore.getStats();

    return NextResponse.json({
      success: true,
      message: '✅ Stockage Supabase PostgreSQL opérationnel',
      storage: 'Supabase PostgreSQL via Prisma',
      info,
      stats
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * POST - Actions de maintenance
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'cleanup') {
      const deleted = await PredictionStore.cleanup();
      return NextResponse.json({
        success: true,
        message: `${deleted} anciens pronostics supprimés`
      });
    }

    if (action === 'clear_all') {
      const cleared = await PredictionStore.clearAll();
      return NextResponse.json({
        success: cleared,
        message: cleared ? 'Toutes les données ont été supprimées' : 'Erreur lors de la suppression'
      });
    }

    // Importer les données de l'ancien projet
    if (action === 'import_old_data') {
      if (!fs.existsSync(DATA_FILE)) {
        return NextResponse.json({
          success: false,
          error: 'Fichier predictions_old.json non trouvé'
        }, { status: 404 });
      }

      const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(rawData);
      const predictions = data.predictions || [];

      let imported = 0;
      let skipped = 0;

      for (const pred of predictions) {
        try {
          // Vérifier si déjà existant
          const exists = await prisma.prediction.findUnique({
            where: { matchId: pred.matchId }
          });

          if (exists) {
            skipped++;
            continue;
          }

          // Créer le pronostic
          await prisma.prediction.create({
            data: {
              matchId: pred.matchId,
              homeTeam: pred.homeTeam,
              awayTeam: pred.awayTeam,
              league: pred.league,
              sport: pred.sport || 'Foot',
              matchDate: new Date(pred.matchDate),
              oddsHome: pred.oddsHome,
              oddsDraw: pred.oddsDraw,
              oddsAway: pred.oddsAway,
              predictedResult: pred.predictedResult,
              predictedGoals: pred.predictedGoals,
              confidence: pred.confidence || 'medium',
              riskPercentage: pred.riskPercentage || 50,
              homeScore: pred.homeScore,
              awayScore: pred.awayScore,
              actualResult: pred.actualResult,
              resultMatch: pred.resultMatch,
              goalsMatch: pred.goalsMatch,
              status: pred.status || 'pending',
              signature: pred.signature,
              checkedAt: pred.checkedAt ? new Date(pred.checkedAt) : null
            }
          });
          imported++;
        } catch (err) {
          console.error(`Erreur import ${pred.matchId}:`, err);
          skipped++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Import terminé: ${imported} pronostics importés, ${skipped} ignorés`,
        imported,
        skipped,
        total: predictions.length
      });
    }

    // Vérifier la connexion Supabase
    if (action === 'test_connection') {
      try {
        await prisma.$queryRaw`SELECT 1`;
        const count = await prisma.prediction.count();

        return NextResponse.json({
          success: true,
          message: '✅ Connexion Supabase réussie',
          predictionsCount: count
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: `Erreur connexion: ${err.message}`
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Action non reconnue. Actions disponibles: cleanup, clear_all, import_old_data, test_connection'
    }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
