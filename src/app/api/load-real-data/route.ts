/**
 * API pour charger les données réelles depuis les APIs externes
 * 
 * POST /api/load-real-data
 * Headers: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadRealData, hasFootballDataAPI } from '@/lib/realDataLoader';
import { trainModel, TrainingConfig, TrainingResult } from '@/lib/mlPipeline';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    hasFootballAPI: hasFootballDataAPI(),
    message: hasFootballDataAPI() 
      ? 'Clé API football-data.org configurée'
      : 'Configurez FOOTBALL_DATA_API_KEY pour les données réelles',
    endpoints: {
      load: 'POST /api/load-real-data (requires Authorization header)',
      train: 'POST /api/batch-ml?action=train_supabase'
    }
  });
}

export async function POST(request: NextRequest) {
  // Vérifier l'autorisation
  const authHeader = request.headers.get('authorization');
  const secret = authHeader?.replace('Bearer ', '');
  
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  console.log('🔄 [LOAD-REAL-DATA] Démarrage...');
  const startTime = Date.now();

  try {
    // Charger les données réelles
    const result = await loadRealData();
    
    // Si suffisamment de données, lancer l'entraînement
    let trainingResult: TrainingResult | null = null;
    const totalMatches = result.football.loaded + result.basketball.loaded;
    
    if (totalMatches > 500) {
      console.log('🤖 Lancement de l\'entraînement ML...');
      
      const config: TrainingConfig = {
        season: '2024-2025',
        sport: 'football',
        testSplit: 0.2,
        minMatchesPerTeam: 5
      };
      
      trainingResult = await trainModel(config);
    }

    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'success',
      duration: `${duration}ms`,
      data: result,
      training: trainingResult ? {
        triggered: true,
        accuracy: trainingResult.accuracy,
        roi: trainingResult.roi_percent
      } : {
        triggered: false,
        reason: totalMatches < 500 ? 'Pas assez de données (< 500 matchs)' : 'Non requis'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ [LOAD-REAL-DATA] Erreur:', error);
    
    return NextResponse.json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
