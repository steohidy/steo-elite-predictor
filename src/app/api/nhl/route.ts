/**
 * NHL Predictions API
 * 
 * Endpoint pour les prédictions de hockey sur glace NHL
 * Utilise le moteur de prédiction spécialisé avec:
 * - Corsi & Fenwick (possession)
 * - Expected Goals (xG)
 * - Facteur Gardien (50% de l'équipe)
 * - Fatigue (Back-to-back)
 * - Special Teams (PP%, PK%)
 */

import { NextResponse } from 'next/server';
import { NHLEngine, NHLTeamStats, NHLGoalieStats, NHLMatchData, NHLPrediction } from '@/lib/nhlEngine';
import { getNHLTeamStats, getNHLGoalieStats, getNHLMatches, getNHLTeams } from '@/lib/nhlData';

// Cache pour les prédictions
let cachedPredictions: NHLPredictionResult[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export interface NHLPredictionResult {
  match: NHLMatchData;
  prediction: NHLPrediction;
  homeTeamStats: NHLTeamStats;
  awayTeamStats: NHLTeamStats;
  homeGoalie: NHLGoalieStats;
  awayGoalie: NHLGoalieStats;
}

/**
 * GET - Récupérer les prédictions NHL du jour
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    
    // Vérifier le cache
    const now = Date.now();
    if (!force && cachedPredictions.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
      return NextResponse.json({
        predictions: cachedPredictions,
        cached: true,
        lastUpdate: new Date(lastFetchTime).toISOString(),
        teams: getNHLTeams()
      });
    }
    
    // Récupérer les matchs du jour
    const matches = await getNHLMatches();
    
    if (matches.length === 0) {
      return NextResponse.json({
        message: 'Aucun match NHL prévu aujourd\'hui',
        predictions: [],
        teams: getNHLTeams()
      });
    }
    
    // Générer les prédictions pour chaque match
    const predictions: NHLPredictionResult[] = [];
    
    for (const match of matches) {
      try {
        // Récupérer les stats des équipes
        const homeTeamStats = await getNHLTeamStats(match.homeTeam);
        const awayTeamStats = await getNHLTeamStats(match.awayTeam);
        
        // Récupérer les stats des gardiens (titulaires)
        const homeGoalie = await getNHLGoalieStats(match.homeTeam, true);
        const awayGoalie = await getNHLGoalieStats(match.awayTeam, true);
        
        // Générer la prédiction
        const prediction = NHLEngine.predictMatch(
          match,
          homeTeamStats,
          awayTeamStats,
          homeGoalie,
          awayGoalie
        );
        
        predictions.push({
          match,
          prediction,
          homeTeamStats,
          awayTeamStats,
          homeGoalie,
          awayGoalie
        });
        
      } catch (error) {
        console.error(`Erreur prédiction ${match.homeTeam} vs ${match.awayTeam}:`, error);
      }
    }
    
    // Trier par confiance décroissante
    predictions.sort((a, b) => b.prediction.confidence - a.prediction.confidence);
    
    // Mettre à jour le cache
    cachedPredictions = predictions;
    lastFetchTime = now;
    
    return NextResponse.json({
      predictions,
      cached: false,
      lastUpdate: new Date(now).toISOString(),
      teams: getNHLTeams(),
      summary: {
        total: predictions.length,
        highConfidence: predictions.filter(p => p.prediction.confidence >= 70).length,
        valueBets: predictions.filter(p => p.prediction.valueBet).length,
        overPicks: predictions.filter(p => p.prediction.overUnder.recommendation === 'over').length,
        underPicks: predictions.filter(p => p.prediction.overUnder.recommendation === 'under').length
      }
    });
    
  } catch (error) {
    console.error('Erreur API NHL:', error);
    return NextResponse.json({
      error: 'Erreur lors de la récupération des prédictions NHL',
      message: error instanceof Error ? error.message : 'Erreur inconnue'
    }, { status: 500 });
  }
}

/**
 * POST - Prédiction personnalisée pour un match spécifique
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { homeTeam, awayTeam, oddsHome, oddsAway, totalLine } = body;
    
    if (!homeTeam || !awayTeam) {
      return NextResponse.json({
        error: 'Les équipes domicile et extérieur sont requis'
      }, { status: 400 });
    }
    
    // Récupérer les stats
    const homeTeamStats = await getNHLTeamStats(homeTeam);
    const awayTeamStats = await getNHLTeamStats(awayTeam);
    const homeGoalie = await getNHLGoalieStats(homeTeam, true);
    const awayGoalie = await getNHLGoalieStats(awayTeam, true);
    
    // Créer le match
    const match: NHLMatchData = {
      id: `custom-${Date.now()}`,
      homeTeam,
      awayTeam,
      date: new Date().toISOString(),
      oddsHome: oddsHome || 1.9,
      oddsAway: oddsAway || 1.9,
      totalLine: totalLine || 6.0,
      isBackToBackHome: false,
      isBackToBackAway: false
    };
    
    // Générer la prédiction
    const prediction = NHLEngine.predictMatch(
      match,
      homeTeamStats,
      awayTeamStats,
      homeGoalie,
      awayGoalie
    );
    
    return NextResponse.json({
      match,
      prediction,
      homeTeamStats,
      awayTeamStats,
      homeGoalie,
      awayGoalie
    });
    
  } catch (error) {
    console.error('Erreur prédiction personnalisée:', error);
    return NextResponse.json({
      error: 'Erreur lors de la génération de la prédiction'
    }, { status: 500 });
  }
}
