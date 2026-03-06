import { NextResponse } from 'next/server';
import PredictionStore from '@/lib/store';

/**
 * API pour initialiser des données de démonstration
 * Permet de tester les statistiques par catégorie
 */

// Pronostics de démonstration basés sur des matchs récents
const DEMO_PREDICTIONS = [
  // Matchs du 4 mars 2026 - Avec résultats réels
  {
    matchId: 'demo_2026-03-04_ligue1_1',
    homeTeam: 'Paris SG',
    awayTeam: 'Lille',
    league: 'Ligue 1',
    sport: 'Foot',
    matchDate: '2026-03-04T20:00:00Z',
    oddsHome: 1.45,
    oddsDraw: 4.5,
    oddsAway: 7.0,
    predictedResult: 'home',
    predictedGoals: 'over2.5',
    confidence: 'high',
    riskPercentage: 25, // Sûr
    homeScore: 4,
    awayScore: 1,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-04_pl_1',
    homeTeam: 'Manchester United',
    awayTeam: 'Everton',
    league: 'Premier League',
    sport: 'Foot',
    matchDate: '2026-03-04T15:00:00Z',
    oddsHome: 1.65,
    oddsDraw: 3.8,
    oddsAway: 5.5,
    predictedResult: 'home',
    predictedGoals: 'over1.5',
    confidence: 'high',
    riskPercentage: 28, // Sûr
    homeScore: 3,
    awayScore: 1,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-04_liga_1',
    homeTeam: 'Real Madrid',
    awayTeam: 'Girona',
    league: 'La Liga',
    sport: 'Foot',
    matchDate: '2026-03-04T21:00:00Z',
    oddsHome: 1.35,
    oddsDraw: 5.0,
    oddsAway: 8.5,
    predictedResult: 'home',
    predictedGoals: 'over2.5',
    confidence: 'high',
    riskPercentage: 22, // Sûr
    homeScore: 3,
    awayScore: 0,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-04_serie_1',
    homeTeam: 'Juventus',
    awayTeam: 'Verona',
    league: 'Serie A',
    sport: 'Foot',
    matchDate: '2026-03-04T18:30:00Z',
    oddsHome: 1.55,
    oddsDraw: 4.0,
    oddsAway: 6.0,
    predictedResult: 'home',
    predictedGoals: 'over1.5',
    confidence: 'medium',
    riskPercentage: 32, // Modéré
    homeScore: 2,
    awayScore: 0,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-04_bundes_1',
    homeTeam: 'Bayern Munich',
    awayTeam: 'Mainz',
    league: 'Bundesliga',
    sport: 'Foot',
    matchDate: '2026-03-04T20:30:00Z',
    oddsHome: 1.25,
    oddsDraw: 5.5,
    oddsAway: 12.0,
    predictedResult: 'home',
    predictedGoals: 'over2.5',
    confidence: 'high',
    riskPercentage: 18, // Très Sûr
    homeScore: 3,
    awayScore: 1,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-04_pl_2',
    homeTeam: 'Liverpool',
    awayTeam: 'Newcastle',
    league: 'Premier League',
    sport: 'Foot',
    matchDate: '2026-03-04T20:00:00Z',
    oddsHome: 1.75,
    oddsDraw: 3.6,
    oddsAway: 4.8,
    predictedResult: 'home',
    predictedGoals: 'over2.5',
    confidence: 'medium',
    riskPercentage: 38, // Modéré
    homeScore: 2,
    awayScore: 2,
    actualResult: 'draw',
    resultMatch: false,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-04_liga_2',
    homeTeam: 'Atletico Madrid',
    awayTeam: 'Athletic Bilbao',
    league: 'La Liga',
    sport: 'Foot',
    matchDate: '2026-03-04T18:30:00Z',
    oddsHome: 2.1,
    oddsDraw: 3.4,
    oddsAway: 3.6,
    predictedResult: 'home',
    predictedGoals: 'under2.5',
    confidence: 'low',
    riskPercentage: 55, // Risqué
    homeScore: 0,
    awayScore: 1,
    actualResult: 'away',
    resultMatch: false,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-04_ligue1_2',
    homeTeam: 'Marseille',
    awayTeam: 'Nantes',
    league: 'Ligue 1',
    sport: 'Foot',
    matchDate: '2026-03-04T17:00:00Z',
    oddsHome: 1.85,
    oddsDraw: 3.7,
    oddsAway: 4.5,
    predictedResult: 'home',
    predictedGoals: 'over1.5',
    confidence: 'medium',
    riskPercentage: 42, // Modéré
    homeScore: 2,
    awayScore: 0,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: true,
    status: 'completed' as const
  },
  // Match du 5 mars
  {
    matchId: 'demo_2026-03-05_cl_1',
    homeTeam: 'Real Madrid',
    awayTeam: 'Man City',
    league: 'Champions League',
    sport: 'Foot',
    matchDate: '2026-03-05T21:00:00Z',
    oddsHome: 2.4,
    oddsDraw: 3.5,
    oddsAway: 2.9,
    predictedResult: 'home',
    predictedGoals: 'over2.5',
    confidence: 'low',
    riskPercentage: 52, // Risqué
    homeScore: 3,
    awayScore: 2,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-05_cl_2',
    homeTeam: 'Bayern Munich',
    awayTeam: 'PSG',
    league: 'Champions League',
    sport: 'Foot',
    matchDate: '2026-03-05T21:00:00Z',
    oddsHome: 2.0,
    oddsDraw: 3.7,
    oddsAway: 3.5,
    predictedResult: 'home',
    predictedGoals: 'over2.5',
    confidence: 'medium',
    riskPercentage: 35, // Modéré
    homeScore: 1,
    awayScore: 0,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: false,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-05_nba_1',
    homeTeam: 'Lakers',
    awayTeam: 'Warriors',
    league: 'NBA',
    sport: 'Basket',
    matchDate: '2026-03-05T02:00:00Z',
    oddsHome: 2.1,
    oddsDraw: null,
    oddsAway: 1.75,
    predictedResult: 'away',
    predictedGoals: 'over220.5',
    confidence: 'medium',
    riskPercentage: 40, // Modéré
    homeScore: 118,
    awayScore: 125,
    actualResult: 'away',
    resultMatch: true,
    goalsMatch: true,
    status: 'completed' as const
  },
  {
    matchId: 'demo_2026-03-05_nba_2',
    homeTeam: 'Celtics',
    awayTeam: 'Heat',
    league: 'NBA',
    sport: 'Basket',
    matchDate: '2026-03-05T01:00:00Z',
    oddsHome: 1.45,
    oddsDraw: null,
    oddsAway: 2.8,
    predictedResult: 'home',
    predictedGoals: 'over215.5',
    confidence: 'high',
    riskPercentage: 28, // Sûr
    homeScore: 112,
    awayScore: 98,
    actualResult: 'home',
    resultMatch: true,
    goalsMatch: false,
    status: 'completed' as const
  }
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // Initialiser les données de démo
    if (action === 'init_demo') {
      const store = await PredictionStore.getAll();

      // Ne pas écraser les données existantes
      const existingIds = store.map(p => p.matchId);
      const newPredictions = DEMO_PREDICTIONS.filter(p => !existingIds.includes(p.matchId));

      // Ajouter les pronostics avec les résultats
      let added = 0;
      for (const pred of newPredictions) {
        try {
          await PredictionStore.add({
            matchId: pred.matchId,
            homeTeam: pred.homeTeam,
            awayTeam: pred.awayTeam,
            league: pred.league,
            sport: pred.sport,
            matchDate: pred.matchDate,
            oddsHome: pred.oddsHome,
            oddsDraw: pred.oddsDraw,
            oddsAway: pred.oddsAway,
            predictedResult: pred.predictedResult,
            predictedGoals: pred.predictedGoals,
            confidence: pred.confidence,
            riskPercentage: pred.riskPercentage
          });

          if (pred.status === 'completed') {
            await PredictionStore.complete(pred.matchId, {
              homeScore: pred.homeScore!,
              awayScore: pred.awayScore!,
              actualResult: pred.actualResult!,
              resultMatch: pred.resultMatch!,
              goalsMatch: pred.goalsMatch
            });
          }
          added++;
        } catch (e) {
          console.error('Error adding demo prediction:', e);
        }
      }

      const total = await PredictionStore.getAll();

      return NextResponse.json({
        success: true,
        message: `${added} pronostics de démonstration ajoutés`,
        added,
        total: total.length
      });
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });

  } catch (error) {
    console.error('Erreur API demo:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET() {
  const stats = await PredictionStore.getCompleteStats();

  return NextResponse.json({
    message: 'API de démonstration - Utilisez POST avec action=init_demo',
    currentStats: stats
  });
}
