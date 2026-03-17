import { NextResponse } from 'next/server';
import { 
  calculateImpliedProbabilities as calcImpliedProbs,
  getDataStats,
  getMatchesWithRealOdds,
} from '@/lib/combinedDataService';

// Cache
let cachedData: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

/**
 * Calcule les probabilités implicites
 */
function calculateImpliedProbabilities(oddsHome: number, oddsDraw: number | null, oddsAway: number) {
  if (!oddsHome || !oddsAway || oddsHome <= 1 || oddsAway <= 1) {
    return { home: 33, draw: 34, away: 33 };
  }
  
  const homeProb = 1 / oddsHome;
  const awayProb = 1 / oddsAway;
  const drawProb = oddsDraw && oddsDraw > 1 ? 1 / oddsDraw : 0;
  
  const total = homeProb + awayProb + drawProb;
  
  return {
    home: Math.round((homeProb / total) * 100),
    draw: Math.round((drawProb / total) * 100),
    away: Math.round((awayProb / total) * 100),
  };
}

/**
 * Calcule les options de paris football
 */
function calculateFootballBettingOptions(
  oddsHome: number, 
  oddsDraw: number | null, 
  oddsAway: number,
  homeTeam: string,
  awayTeam: string
) {
  const probs = calculateImpliedProbabilities(oddsHome, oddsDraw, oddsAway);
  
  // Expected goals basé sur les probabilités
  const expectedGoals = (probs.home / 100) * 2.5 + (probs.away / 100) * 0.8;
  
  return {
    result: {
      home: probs.home,
      draw: probs.draw,
      away: probs.away,
    },
    goals: {
      expectedTotal: expectedGoals,
      over25: expectedGoals > 2.5 ? 55 : 45,
      under25: expectedGoals > 2.5 ? 45 : 55,
      over15: expectedGoals > 1.5 ? 70 : 60,
      over05: expectedGoals > 0.5 ? 90 : 85,
      over35: expectedGoals > 3.5 ? 35 : 25,
      over45: expectedGoals > 4.5 ? 20 : 15,
      recommendation: expectedGoals > 2.5 ? `Over 2.5 (${expectedGoals.toFixed(1)} buts attendus)` : `Under 2.5`,
    },
    btts: {
      yes: probs.home > 35 && probs.away > 25 ? 55 : 45,
      no: probs.home > 35 && probs.away > 25 ? 45 : 55,
    },
    correctScore: [
      { score: '1-0', probability: 12 },
      { score: '2-0', probability: 10 },
      { score: '2-1', probability: 9 },
      { score: '1-1', probability: 15 },
      { score: '0-1', probability: 8 },
    ],
    halfTime: {
      home: Math.round(probs.home * 0.9),
      draw: Math.round(probs.draw * 1.2),
      away: Math.round(probs.away * 0.9),
    },
  };
}

/**
 * GET - Récupérer les matchs avec vraies cotes
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';
  
  try {
    const now = Date.now();
    
    // Vérifier le cache
    if (!forceRefresh && cachedData && (now - lastFetchTime) < CACHE_TTL) {
      console.log('📦 Cache utilisé');
      return NextResponse.json(cachedData);
    }
    
    console.log('🔄 Récupération des matchs avec cotes réelles...');
    
    // Récupérer les matchs avec vraies cotes
    const matches = await getMatchesWithRealOdds();
    const stats = getDataStats();
    
    // Enrichir chaque match avec les prédictions
    const enrichedMatches = matches.map((match: any, i: number) => {
      const isBasket = match.sport === 'NBA' || match.sport === 'Basket';
      const isHockey = match.sport === 'NHL' || match.sport === 'Hockey';
      
      // Calculer le risque basé sur les cotes
      let riskPercentage = 50;
      let favorite = 'home';
      
      if (match.oddsHome > 0 && match.oddsAway > 0) {
        const probs = calculateImpliedProbabilities(
          match.oddsHome, 
          match.oddsDraw, 
          match.oddsAway
        );
        
        riskPercentage = 100 - Math.max(probs.home, probs.away, probs.draw);
        favorite = probs.home > probs.away ? 'home' : 'away';
      }
      
      // Base match data
      const matchData: any = {
        id: match.id || `match_${i}`,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        league: match.league,
        date: match.date,
        oddsHome: match.oddsHome || 2.0,
        oddsDraw: match.oddsDraw || null,
        oddsAway: match.oddsAway || 2.0,
        status: match.status || 'upcoming',
        isLive: match.isLive || false,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        clock: match.clock,
        homeRecord: match.homeRecord,
        awayRecord: match.awayRecord,
        bookmaker: match.bookmaker,
        insight: {
          riskPercentage,
          valueBetDetected: riskPercentage < 35,
          valueBetType: riskPercentage < 35 ? favorite : null,
          confidence: riskPercentage <= 35 ? 'high' : riskPercentage <= 50 ? 'medium' : 'low',
        },
        // Indicateur de qualité des données
        dataQuality: {
          overall: match.hasRealOdds ? 'real' : 'estimated',
          overallScore: match.hasRealOdds ? 85 : 40,
          sources: match.hasRealOdds ? ['The Odds API', 'ESPN'] : ['ESPN'],
          hasRealData: match.hasRealOdds || false,
          warnings: match.hasRealOdds ? [] : ['Cotes estimées - pas de données réelles disponibles'],
          details: {
            form: 'estimated',
            goals: match.hasRealOdds ? 'real' : 'estimated',
            injuries: 'none',
            h2h: 'estimated',
          },
        },
      };
      
      // Prédictions Football
      if (!isBasket && !isHockey && match.oddsDraw) {
        const bettingOptions = calculateFootballBettingOptions(
          matchData.oddsHome,
          matchData.oddsDraw,
          matchData.oddsAway,
          match.homeTeam,
          match.awayTeam
        );
        
        matchData.goalsPrediction = {
          total: bettingOptions.goals.expectedTotal,
          over25: bettingOptions.goals.over25,
          under25: bettingOptions.goals.under25,
          bothTeamsScore: bettingOptions.btts.yes,
          prediction: bettingOptions.goals.recommendation,
          basedOn: match.hasRealOdds ? 'real' : 'estimated',
        };
        
        matchData.advancedPredictions = {
          btts: bettingOptions.btts,
          correctScore: bettingOptions.correctScore.map(s => {
            const parts = s.score.split('-');
            return { home: parseInt(parts[0]), away: parseInt(parts[1]), prob: s.probability };
          }),
          halfTime: bettingOptions.halfTime,
        };
      }
      
      // Prédictions NBA
      if (isBasket) {
        matchData.nbaPredictions = {
          predictedWinner: matchData.oddsHome < matchData.oddsAway ? 'home' : 'away',
          winnerTeam: matchData.oddsHome < matchData.oddsAway ? match.homeTeam : match.awayTeam,
          winnerProb: Math.round(100 - riskPercentage),
          spread: {
            line: Math.round(Math.abs(matchData.oddsHome - matchData.oddsAway) * 5),
            favorite: matchData.oddsHome < matchData.oddsAway ? match.homeTeam : match.awayTeam,
            confidence: 75,
          },
          totalPoints: {
            line: 220,
            predicted: 225,
            overProb: 52,
            recommendation: 'Over 220',
          },
          topScorer: {
            team: match.homeTeam,
            player: 'Joueur Clé',
            predictedPoints: 25,
          },
          keyMatchup: 'Matchup clé',
          confidence: riskPercentage <= 35 ? 'high' : riskPercentage <= 50 ? 'medium' : 'low',
        };
      }
      
      return matchData;
    });
    
    // Trier: live en premier, puis par date
    enrichedMatches.sort((a: any, b: any) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    // Stats de qualité
    const matchesWithRealOdds = enrichedMatches.filter((m: any) => m.dataQuality.hasRealData).length;
    
    const result = {
      matches: enrichedMatches,
      timing: {
        currentHour: new Date().getUTCHours(),
        canRefresh: true,
        nextRefreshTime: '3 min',
        currentPhase: new Date().getUTCHours() < 12 ? 'morning' : new Date().getUTCHours() < 18 ? 'afternoon' : 'evening',
        message: `${enrichedMatches.length} matchs disponibles (${matchesWithRealOdds} avec vraies cotes)`,
      },
      dataStats: {
        totalMatches: enrichedMatches.length,
        matchesWithRealOdds,
        quotaRemaining: stats.quotaRemaining,
        lastOddsUpdate: stats.lastOddsUpdate,
      },
    };
    
    cachedData = result;
    lastFetchTime = now;
    
    console.log(`✅ ${enrichedMatches.length} matchs (${matchesWithRealOdds} avec vraies cotes)`);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Erreur API matches:', error);
    return NextResponse.json({ 
      error: 'Erreur de connexion',
      matches: [],
      timing: {
        currentHour: new Date().getUTCHours(),
        canRefresh: false,
        nextRefreshTime: '1 min',
        currentPhase: 'afternoon',
        message: 'Erreur temporaire'
      }
    }, { status: 500 });
  }
}
