/**
 * API Cron - Tâches programmées
 * 
 * GET /api/cron?key=CRON_SECRET
 * 
 * Tâches exécutées:
 * - 7h UTC: Déplacer les matchs NBA de la nuit vers "terminé"
 * - Vérification des résultats des matchs terminés
 */

import { NextRequest, NextResponse } from 'next/server';

// Cache des matchs NBA de la nuit
let nbaNightMatches: any[] = [];
let lastNBACheck: Date | null = null;

/**
 * Vérifie si c'est 7h UTC (± 30 minutes)
 */
function is7hUTC(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  return hour === 7;
}

/**
 * Marque les matchs NBA comme terminés
 */
async function markNBAMatchesFinished(): Promise<{ count: number; matches: any[] }> {
  try {
    // Récupérer les matchs actuels
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/matches`, {
      cache: 'no-store'
    });
    
    const data = await response.json();
    const matches = data.matches || [];
    
    // Filtrer les matchs NBA de la nuit (matchs qui ont eu lieu entre 00h et 07h UTC)
    const now = new Date();
    const today7h = new Date(now);
    today7h.setUTCHours(7, 0, 0, 0);
    
    const today0h = new Date(today7h);
    today0h.setUTCHours(0, 0, 0, 0);
    
    // Matchs NBA qui ont commencé avant 7h UTC aujourd'hui
    const nbaMatchesToFinish = matches.filter((m: any) => {
      if (m.sport !== 'Basket' && m.sport !== 'NBA') return false;
      
      const matchDate = new Date(m.date);
      return matchDate >= today0h && matchDate < today7h;
    });
    
    // Marquer comme terminés
    for (const match of nbaMatchesToFinish) {
      match.status = 'finished';
      match.finishedAt = now.toISOString();
      match.finishedReason = 'auto_nba_night';
    }
    
    // Mettre à jour le cache
    nbaNightMatches = nbaMatchesToFinish;
    lastNBACheck = now;
    
    console.log(`🏀 ${nbaMatchesToFinish.length} matchs NBA marqués comme terminés`);
    
    return {
      count: nbaMatchesToFinish.length,
      matches: nbaMatchesToFinish
    };
    
  } catch (error) {
    console.error('Erreur marquage NBA terminés:', error);
    return { count: 0, matches: [] };
  }
}

/**
 * Vérifie les résultats des matchs terminés
 */
async function checkFinishedResults(): Promise<{ verified: number }> {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    // Appeler l'API de vérification des résultats
    await fetch(`${baseUrl}/api/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_results' })
    });
    
    return { verified: 1 };
    
  } catch (error) {
    console.error('Erreur vérification résultats:', error);
    return { verified: 0 };
  }
}

/**
 * GET - Exécuter les tâches cron
 * Vercel Cron appelle cette route automatiquement
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cronKey = searchParams.get('key');
  
  // Vérifier la clé de sécurité (sauf en local)
  const expectedKey = process.env.CRON_SECRET;
  if (expectedKey && cronKey !== expectedKey) {
    return NextResponse.json({
      success: false,
      error: 'Clé cron invalide'
    }, { status: 401 });
  }
  
  const results: any = {
    timestamp: new Date().toISOString(),
    tasks: {}
  };
  
  try {
    // Tâche 1: Marquer les matchs NBA comme terminés (si 7h UTC)
    const hour = new Date().getUTCHours();
    
    if (hour === 7) {
      console.log('🕒 7h UTC - Exécution tâche NBA terminés');
      const nbaResult = await markNBAMatchesFinished();
      results.tasks.nba_finished = nbaResult;
    } else {
      results.tasks.nba_finished = { skipped: true, reason: `Pas 7h UTC (actuellement ${hour}h)` };
    }
    
    // Tâche 2: Vérifier les résultats
    const verifyResult = await checkFinishedResults();
    results.tasks.verify_results = verifyResult;
    
    results.success = true;
    
  } catch (error: any) {
    results.success = false;
    results.error = error.message;
  }
  
  return NextResponse.json(results);
}

/**
 * POST - Forcer l'exécution des tâches (admin)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task, key } = body;
    
    // Vérifier la clé de sécurité
    const expectedKey = process.env.CRON_SECRET;
    if (expectedKey && key !== expectedKey) {
      return NextResponse.json({
        success: false,
        error: 'Clé admin invalide'
      }, { status: 401 });
    }
    
    let result: any = {};
    
    switch (task) {
      case 'nba_finished':
        result = await markNBAMatchesFinished();
        break;
        
      case 'verify_results':
        result = await checkFinishedResults();
        break;
        
      case 'all':
        result = {
          nba_finished: await markNBAMatchesFinished(),
          verify_results: await checkFinishedResults()
        };
        break;
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Tâche inconnue. Utilisez: nba_finished, verify_results, ou all'
        }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      task,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
