/**
 * NBA Pro Predictions API - Système PRO avec blessures intégrées
 * 
 * Méthodologie rigoureuse:
 * - Net Rating (ORtg - DRtg)
 * - Pace Factor
 * - Avantage domicile (+3 pts)
 * - Impact blessures (joueurs clés)
 * - Repos (Back-to-back penalty)
 * 
 * Formule:
 * Score = (ORtg_home + DRtg_away) / 2 * Pace/100 + HomeAdj + RestAdj - InjuryAdj
 */

import { NextResponse } from 'next/server';
import { getProNBAStats, analyzeNBAMatchup, fetchESPNNBAGames } from '@/lib/nbaProStats';

// Cache
let cachedPredictions: any[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

/**
 * GET - Prédictions NBA PRO avec blessures
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const statsOnly = searchParams.get('stats') === 'true';
    const team = searchParams.get('team');
    const injuries = searchParams.get('injuries') === 'true';
    
    // Mode blessures seulement
    if (injuries) {
      const { fetchAllNBAInjuries } = await import('@/lib/nbaInjuryService');
      const allInjuries = await fetchAllNBAInjuries();
      
      return NextResponse.json({
        injuries: allInjuries,
        total: allInjuries.length,
        lastUpdate: new Date().toISOString(),
        source: 'espn_nba_official',
      });
    }
    
    // Mode stats seulement
    if (statsOnly) {
      const allStats = await getProNBAStats(force);
      const statsArray = Array.from(allStats.values());
      const uniqueStats = statsArray.filter((s, i, arr) => 
        arr.findIndex(x => x.teamAbbr === s.teamAbbr)
      );
      
      // Filtrer par équipe si spécifié
      const filtered = team 
        ? uniqueStats.filter(s => s.teamAbbr === team.toUpperCase() || s.team === team)
        : uniqueStats;
      
      return NextResponse.json({
        stats: filtered,
        total: filtered.length,
        lastUpdate: new Date().toISOString()
      });
    }
    
    // Vérifier le cache
    const now = Date.now();
    if (!force && cachedPredictions.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
      return NextResponse.json({
        predictions: cachedPredictions,
        cached: true,
        lastUpdate: new Date(lastFetchTime).toISOString(),
      });
    }
    
    // Récupérer les stats PRO
    const proStats = await getProNBAStats(force);
    
    // Récupérer les matchs du jour depuis ESPN
    const games = await fetchESPNNBAGames();
    
    if (games.length === 0) {
      return NextResponse.json({
        message: 'Aucun match NBA prévu aujourd\'hui',
        predictions: [],
        statsAvailable: proStats.size,
      });
    }
    
    // Générer les analyses pour chaque match
    const predictions = [];
    
    for (const game of games) {
      try {
        // Extraire les infos du match ESPN
        const homeTeam = game.homeTeam;
        const awayTeam = game.awayTeam;
        
        // Analyser le matchup
        const analysis = await analyzeNBAMatchup(
          homeTeam,
          awayTeam,
          0, // Spread line (à récupérer depuis ESPN si dispo)
          225 // Total line par défaut
        );
        
        if (analysis) {
          predictions.push({
            match: {
              homeTeam,
              awayTeam,
              date: game.date,
              time: game.time,
              status: game.status,
              isLive: game.isLive,
              homeScore: game.homeScore,
              awayScore: game.awayScore,
            },
            analysis,
            homeTeamStats: proStats.get(homeTeam),
            awayTeamStats: proStats.get(awayTeam),
          });
        }
        
      } catch (error) {
        console.error(`Erreur analyse ${game.homeTeam} vs ${game.awayTeam}:`, error);
      }
    }
    
    // Trier par edge décroissant
    predictions.sort((a, b) => 
      (b.analysis?.insights?.moneyline?.valueBet?.edge || 0) - 
      (a.analysis?.insights?.moneyline?.valueBet?.edge || 1)
    );
    
    // Mettre à jour le cache
    cachedPredictions = predictions;
    lastFetchTime = now;
    
    // Calculer les résumés
    const valueBets = predictions.filter(p => p.analysis?.insights?.moneyline?.valueBet?.detected);
    const highConfidence = predictions.filter(p => (p.analysis?.insights?.confidence || 0) >= 70);
    const withInjuries = predictions.filter(p => 
      p.analysis?.injuryReport?.totalImpact > 0
    );
    
    return NextResponse.json({
      predictions,
      cached: false,
      lastUpdate: new Date(now).toISOString(),
      summary: {
        total: predictions.length,
        valueBets: valueBets.length,
        highConfidence: highConfidence.length,
        withInjuries: withInjuries.length,
        avgConfidence: predictions.length > 0 
          ? Math.round(predictions.reduce((sum, p) => sum + (p.analysis?.insights?.confidence || 0), 0) / predictions.length)
          : 0,
      },
      injurySummary: {
        totalInjuries: withInjuries.reduce((sum, p) => sum + (p.analysis?.injuryReport?.totalImpact || 0), 0),
        gamesAffected: withInjuries.length,
      },
      topValueBets: valueBets.slice(0, 3).map(p => ({
        match: `${p.match.homeTeam} vs ${p.match.awayTeam}`,
        pick: p.analysis.insights.moneyline.valueBet.type,
        edge: `${(p.analysis.insights.moneyline.valueBet.edge * 100).toFixed(1)}%`,
        projected: `${p.analysis.projected.homePoints} - ${p.analysis.projected.awayPoints}`,
        injuryImpact: p.analysis.injuryReport.summary,
      })),
    });
    
  } catch (error) {
    console.error('Erreur API NBA Pro:', error);
    return NextResponse.json({
      error: 'Erreur lors de la récupération des prédictions',
      message: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 });
  }
}

/**
 * POST - Analyse personnalisée d'un matchup NBA
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { homeTeam, awayTeam, spreadLine, totalLine } = body;
    
    if (!homeTeam || !awayTeam) {
      return NextResponse.json({
        error: 'Les équipes domicile et extérieur sont requises'
      }, { status: 400 });
    }
    
    const analysis = await analyzeNBAMatchup(
      homeTeam,
      awayTeam,
      spreadLine || 0,
      totalLine || 225
    );
    
    if (!analysis) {
      return NextResponse.json({
        error: 'Impossible d\'analyser ce matchup - stats non disponibles'
      }, { status: 404 });
    }
    
    const proStats = await getProNBAStats();
    
    return NextResponse.json({
      analysis,
      homeTeamStats: proStats.get(homeTeam),
      awayTeamStats: proStats.get(awayTeam),
    });
    
  } catch (error) {
    console.error('Erreur analyse matchup NBA:', error);
    return NextResponse.json({
      error: 'Erreur lors de l\'analyse du matchup'
    }, { status: 500 });
  }
}

/**
 * DELETE - Vider le cache
 */
export async function DELETE() {
  try {
    cachedPredictions = [];
    lastFetchTime = 0;
    
    return NextResponse.json({
      success: true,
      message: 'Cache NBA Pro vidé',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erreur lors du vidage du cache'
    }, { status: 500 });
  }
}
