/**
 * API Backtest Avancé - Simulation réaliste de paris
 * 
 * GET /api/backtest - Retourne le statut du backtest
 * POST /api/backtest - Lance un backtest avec configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAdvancedBacktest, runMonteCarloSimulation, BacktestResult } from '@/lib/advancedBacktest';
import { getSupabaseAdmin } from '@/lib/supabase';

const CRON_SECRET = process.env.CRON_SECRET || 'steo-elite-cron-2026';

export async function GET() {
  try {
    const adminClient = getSupabaseAdmin();
    
    // Récupérer le nombre de matchs disponibles
    let footballMatches = 0;
    let basketballMatches = 0;
    
    if (adminClient) {
      const [football, basketball] = await Promise.all([
        adminClient.from('football_matches').select('id', { count: 'exact', head: true }).not('home_score', 'is', null),
        adminClient.from('basketball_matches').select('id', { count: 'exact', head: true }).not('home_score', 'is', null)
      ]);
      
      footballMatches = football.count || 0;
      basketballMatches = basketball.count || 0;
    }
    
    return NextResponse.json({
      status: 'ready',
      availableData: {
        football: footballMatches,
        basketball: basketballMatches
      },
      defaultConfig: {
        initialBankroll: 1000,
        kellyFraction: 0.25,
        minConfidence: 50,
        minExpectedValue: 0.02
      },
      endpoints: {
        runBacktest: 'POST /api/backtest { sport, initialBankroll, kellyFraction, minConfidence }',
        monteCarlo: 'POST /api/backtest?action=montecarlo'
      }
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
  const action = url.searchParams.get('action');
  const secret = url.searchParams.get('secret');
  
  // Vérifier l'autorisation
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  
  try {
    const body = await request.json().catch(() => ({}));
    
    const config = {
      initialBankroll: body.initialBankroll || 1000,
      kellyFraction: body.kellyFraction || 0.25,
      minConfidence: body.minConfidence || 50,
      minExpectedValue: body.minExpectedValue || 0.02,
      sport: body.sport || 'football',
      season: body.season,
      league: body.league
    };
    
    console.log('📊 ===== BACKTEST AVANCÉ =====');
    console.log('Configuration:', config);
    
    const startTime = Date.now();
    
    // Exécuter le backtest
    const result = await runAdvancedBacktest(config);
    
    // Si Monte Carlo demandé
    if (action === 'montecarlo') {
      console.log('🎲 Lancement simulation Monte Carlo...');
      
      // Récupérer les matchs avec prédictions
      const monteCarloResult = await runMonteCarloSimulation([], {
        initialBankroll: config.initialBankroll,
        kellyFraction: config.kellyFraction,
        minConfidence: config.minConfidence,
        simulations: body.simulations || 1000
      });
      
      return NextResponse.json({
        backtest: result,
        monteCarlo: monteCarloResult,
        duration: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      });
    }
    
    return NextResponse.json({
      status: 'success',
      duration: `${Date.now() - startTime}ms`,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('❌ Erreur backtest:', error);
    
    return NextResponse.json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
