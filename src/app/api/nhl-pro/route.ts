/**
 * NHL Pro Predictions API - Système PRO
 * 
 * Endpoint pour les prédictions NHL basées sur:
 * - xGF% (Expected Goals For Percentage)
 * - HDCF% (High Danger Chances For)  
 * - PDO (SV% + SH%) - Indicateur de chance/régression
 * - GSAx (Goals Saved Above Expected)
 * - Rolling 10-game form
 * 
 * Formule de calcul:
 * - Score Attaque A = (xGF A + xGA B) / 2
 * - Score Attaque B = (xGF B + xGA A) / 2
 * - Ajustement Gardien: +/- 0.2 but selon GSAx
 * - Avantage Glace: +0.3 but domicile
 */

import { NextResponse } from 'next/server';
import { getProNHLStats, analyzeMatchup } from '@/lib/nhlProStats';
import { getNHLMatches, getNHLTeams } from '@/lib/nhlData';

// Cache
let cachedPredictions: any[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000;

/**
 * GET - Prédictions PRO NHL
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const statsOnly = searchParams.get('stats') === 'true';
    const team = searchParams.get('team');
    
    // Mode stats seulement
    if (statsOnly) {
      const allStats = await getProNHLStats(force);
      const statsArray = Array.from(allStats.values());
      
      // Filtrer par équipe si spécifié
      const filtered = team 
        ? statsArray.filter(s => s.teamAbbr === team.toUpperCase())
        : statsArray;
      
      return NextResponse.json({
        stats: filtered,
        total: filtered.length,
        sources: [...new Set(filtered.flatMap(s => s.source.split(',')))],
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
    const proStats = await getProNHLStats(force);
    
    // Récupérer les matchs du jour
    const matches = await getNHLMatches();
    
    if (matches.length === 0) {
      return NextResponse.json({
        message: 'Aucun match NHL prévu aujourd\'hui',
        predictions: [],
        teams: getNHLTeams(),
        statsAvailable: proStats.size,
      });
    }
    
    // Générer les analyses pour chaque match
    const predictions = [];
    
    for (const match of matches) {
      const analysis = await analyzeMatchup(
        match.homeTeam,
        match.awayTeam,
        match.oddsHome,
        match.oddsAway
      );
      
      if (analysis) {
        predictions.push({
          match,
          analysis,
          homeTeamStats: proStats.get(match.homeTeam),
          awayTeamStats: proStats.get(match.awayTeam),
        });
      }
    }
    
    // Trier par edge décroissant
    predictions.sort((a, b) => 
      (b.analysis?.insights?.valueBet?.edge || 0) - (a.analysis?.insights?.valueBet?.edge || 0)
    );
    
    // Mettre à jour le cache
    cachedPredictions = predictions;
    lastFetchTime = now;
    
    // Calculer les résumés
    const valueBets = predictions.filter(p => p.analysis?.insights?.valueBet?.detected);
    const highConfidence = predictions.filter(p => (p.analysis?.insights?.confidence || 0) >= 70);
    
    return NextResponse.json({
      predictions,
      cached: false,
      lastUpdate: new Date(now).toISOString(),
      teams: getNHLTeams(),
      summary: {
        total: predictions.length,
        valueBets: valueBets.length,
        highConfidence: highConfidence.length,
        avgConfidence: predictions.length > 0 
          ? Math.round(predictions.reduce((sum, p) => sum + (p.analysis?.insights?.confidence || 0), 0) / predictions.length)
          : 0,
      },
      dataQuality: {
        teamsWithRealData: Array.from(proStats.values()).filter(s => s.source !== 'fallback').length,
        totalTeams: proStats.size,
        percentage: proStats.size > 0 
          ? Math.round((Array.from(proStats.values()).filter(s => s.source !== 'fallback').length / proStats.size) * 100)
          : 0,
      },
      topValueBets: valueBets.slice(0, 3).map(p => ({
        match: `${p.match.homeTeam} vs ${p.match.awayTeam}`,
        pick: p.analysis.insights.valueBet.type,
        edge: `${(p.analysis.insights.valueBet.edge * 100).toFixed(1)}%`,
        projected: `${p.analysis.projected.homeGoals} - ${p.analysis.projected.awayGoals}`,
      })),
    });
    
  } catch (error) {
    console.error('Erreur API NHL Pro:', error);
    return NextResponse.json({
      error: 'Erreur lors de la récupération des prédictions',
      message: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 });
  }
}

/**
 * POST - Analyse personnalisée d'un matchup
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { homeTeam, awayTeam, oddsHome, oddsAway } = body;
    
    if (!homeTeam || !awayTeam) {
      return NextResponse.json({
        error: 'Les équipes domicile et extérieur sont requises'
      }, { status: 400 });
    }
    
    const analysis = await analyzeMatchup(
      homeTeam.toUpperCase(),
      awayTeam.toUpperCase(),
      oddsHome || 1.9,
      oddsAway || 1.9
    );
    
    if (!analysis) {
      return NextResponse.json({
        error: 'Impossible d\'analyser ce matchup - stats non disponibles'
      }, { status: 404 });
    }
    
    const proStats = await getProNHLStats();
    
    return NextResponse.json({
      analysis,
      homeTeamStats: proStats.get(homeTeam.toUpperCase()),
      awayTeamStats: proStats.get(awayTeam.toUpperCase()),
    });
    
  } catch (error) {
    console.error('Erreur analyse matchup:', error);
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
      message: 'Cache NHL Pro vidé',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erreur lors du vidage du cache'
    }, { status: 500 });
  }
}
