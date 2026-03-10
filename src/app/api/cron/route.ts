/**
 * API Cron - Tâches programmées
 * 
 * GET /api/cron?force=true
 * 
 * Tâches exécutées:
 * - 7h UTC: Déplacer les matchs NBA de la nuit vers "terminé" + vérifier les résultats
 * - Vérification des résultats des matchs terminés (Football + NBA)
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Vérifie les résultats NBA via ESPN API
 */
async function checkNBAResults(): Promise<{ checked: number; results: any[] }> {
  try {
    console.log('🏀 Vérification des résultats NBA...');
    
    // Récupérer les scores NBA d'hier via ESPN
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
    
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`,
      { next: { revalidate: 0 } }
    );
    
    if (!response.ok) {
      console.log('⚠️ Impossible de récupérer les scores NBA');
      return { checked: 0, results: [] };
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    const results = events.map((event: any) => {
      const homeTeam = event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.shortDisplayName || '';
      const awayTeam = event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.shortDisplayName || '';
      const homeScore = parseInt(event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.score || '0');
      const awayScore = parseInt(event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.score || '0');
      const status = event.status?.type?.completed ? 'finished' : 'scheduled';
      
      return {
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        status,
        date: event.date
      };
    }).filter((r: any) => r.status === 'finished');
    
    console.log(`✅ ${results.length} résultats NBA trouvés`);
    
    return { checked: results.length, results };
    
  } catch (error) {
    console.error('Erreur vérification NBA:', error);
    return { checked: 0, results: [] };
  }
}

/**
 * Vérifie les résultats Football via Football-Data API
 */
async function checkFootballResults(): Promise<{ checked: number }> {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    // Appeler l'API de vérification des résultats Football
    const response = await fetch(`${baseUrl}/api/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_results' })
    });
    
    const data = await response.json();
    console.log(`⚽ Résultats Football vérifiés: ${data.checked || 0}`);
    
    return { checked: data.checked || 0 };
    
  } catch (error) {
    console.error('Erreur vérification Football:', error);
    return { checked: 0 };
  }
}

/**
 * Met à jour les statistiques dans la base de données
 */
async function updateStats(): Promise<{ success: boolean }> {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    // Forcer le refresh des stats
    await fetch(`${baseUrl}/api/results?action=detailed_stats`, {
      cache: 'no-store'
    });
    
    console.log('📊 Stats mises à jour');
    return { success: true };
    
  } catch (error) {
    console.error('Erreur mise à jour stats:', error);
    return { success: false };
  }
}

/**
 * GET - Exécuter les tâches cron
 * 
 * Params:
 * - key: CRON_SECRET (optionnel)
 * - force: si true, exécute toutes les tâches même si ce n'est pas 7h UTC
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cronKey = searchParams.get('key');
  const force = searchParams.get('force') === 'true';
  
  // Vérifier la clé de sécurité seulement si elle est configurée ET fournie
  const expectedKey = process.env.CRON_SECRET;
  if (expectedKey && cronKey && cronKey !== expectedKey) {
    return NextResponse.json({
      success: false,
      error: 'Clé cron invalide'
    }, { status: 401 });
  }
  
  const results: any = {
    timestamp: new Date().toISOString(),
    currentHourUTC: new Date().getUTCHours(),
    tasks: {}
  };
  
  try {
    const hour = new Date().getUTCHours();
    
    // Tâches à exécuter à 7h UTC ou si force=true
    if (hour === 7 || force) {
      console.log(`⏰ Exécution des tâches cron (${force ? 'forcé' : '7h UTC'})`);
      
      // 1. Vérifier les résultats NBA
      const nbaResults = await checkNBAResults();
      results.tasks.nba_results = nbaResults;
      
      // 2. Vérifier les résultats Football
      const footballResults = await checkFootballResults();
      results.tasks.football_results = footballResults;
      
      // 3. Mettre à jour les stats
      const statsUpdate = await updateStats();
      results.tasks.stats_update = statsUpdate;
      
    } else {
      results.tasks.skipped = {
        reason: `Pas 7h UTC (actuellement ${hour}h). Ajoutez &force=true pour forcer.`
      };
    }
    
    results.success = true;
    
  } catch (error: any) {
    results.success = false;
    results.error = error.message;
  }
  
  return NextResponse.json(results);
}

/**
 * POST - Forcer l'exécution des tâches
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task } = body;
    
    let result: any = {};
    
    switch (task) {
      case 'nba_results':
        result = await checkNBAResults();
        break;
        
      case 'football_results':
        result = await checkFootballResults();
        break;
        
      case 'update_stats':
        result = await updateStats();
        break;
        
      case 'all':
        result = {
          nba_results: await checkNBAResults(),
          football_results: await checkFootballResults(),
          stats_update: await updateStats()
        };
        break;
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Tâche inconnue. Utilisez: nba_results, football_results, update_stats, ou all'
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
