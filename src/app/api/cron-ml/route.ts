/**
 * API Cron ML - Gestion automatique des données
 * 
 * GET /api/cron-ml?action=check - Vérifie le statut
 * GET /api/cron-ml?action=progress - Progression détaillée
 * POST /api/cron-ml?action=initial - Lance le scraping initial
 * POST /api/cron-ml?action=daily - Mise à jour quotidienne
 * POST /api/cron-ml?action=nba - Scraping NBA
 * POST /api/cron-ml?action=auto - Détecte automatiquement ce qui est nécessaire
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  runInitialScrape, 
  runDailyUpdate, 
  runNBAScrape,
  isInitialScrapeDone,
  isNBAScrapeDone,
  getDatabaseStats,
  getFullProgress,
  sendAlert,
  CronJobResult
} from '@/lib/cronManager';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'check';
    
    if (action === 'progress') {
      const progress = await getFullProgress();
      
      return NextResponse.json({
        status: 'success',
        progress,
        timestamp: new Date().toISOString()
      });
    }
    
    const stats = await getDatabaseStats();
    const initialDone = await isInitialScrapeDone();
    const nbaDone = await isNBAScrapeDone();
    const progress = await getFullProgress();
    
    return NextResponse.json({
      status: 'success',
      database: stats,
      initialScrapeDone: initialDone,
      nbaScrapeDone: nbaDone,
      progress,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      message: error.message
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'auto';
  const secret = url.searchParams.get('secret');

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  console.log(`🔄 [CRON-ML] Démarrage action: ${action}`);
  const startTime = Date.now();

  try {
    let result: CronJobResult;

    switch (action) {
      case 'initial':
        console.log('🚀 Scraping initial demandé...');
        result = await runInitialScrape();
        break;

      case 'daily':
        console.log('📅 Mise à jour quotidienne...');
        result = await runDailyUpdate();
        break;

      case 'nba':
        console.log('🏀 Scraping NBA demandé...');
        result = await runNBAScrape();
        break;

      case 'auto':
        const needsInitial = !(await isInitialScrapeDone());
        const needsNBA = !(await isNBAScrapeDone());
        
        if (needsInitial) {
          console.log('🚀 Scraping initial nécessaire...');
          result = await runInitialScrape();
        } else if (needsNBA) {
          console.log('🏀 Scraping NBA nécessaire...');
          result = await runNBAScrape();
        } else {
          console.log('📅 Mise à jour quotidienne...');
          result = await runDailyUpdate();
        }
        break;

      case 'all':
        console.log('🎯 Scraping complet (Football + NBA)...');
        
        const results: CronJobResult[] = [];
        
        if (!(await isInitialScrapeDone())) {
          results.push(await runInitialScrape());
        }
        
        if (!(await isNBAScrapeDone())) {
          results.push(await runNBAScrape());
        }
        
        result = {
          success: results.every(r => r.success),
          action: 'all',
          matchesAdded: results.reduce((sum, r) => sum + r.matchesAdded, 0),
          matchesUpdated: results.reduce((sum, r) => sum + r.matchesUpdated, 0),
          trainingTriggered: results.some(r => r.trainingTriggered),
          errors: results.flatMap(r => r.errors),
          warnings: results.flatMap(r => r.warnings),
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
        break;

      default:
        return NextResponse.json({
          error: 'Action non reconnue',
          validActions: ['initial', 'daily', 'nba', 'auto', 'all']
        }, { status: 400 });
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [CRON-ML] Terminé en ${duration}ms`);

    if (result.errors && result.errors.length > 0) {
      await sendAlert('warning', 'Cron ML terminé avec erreurs', 
        `${result.errors.length} erreurs rencontrées`, result.errors);
    }

    return NextResponse.json({
      status: result.success ? 'success' : 'partial',
      action,
      matchesAdded: result.matchesAdded,
      matchesUpdated: result.matchesUpdated,
      trainingTriggered: result.trainingTriggered,
      trainingResult: result.trainingResult,
      errors: result.errors,
      warnings: result.warnings,
      duration: `${duration}ms`,
      timestamp: result.timestamp
    });

  } catch (error: any) {
    console.error('❌ [CRON-ML] Erreur:', error);
    
    await sendAlert('error', 'Erreur Cron ML', error.message);

    return NextResponse.json({
      status: 'error',
      action,
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
