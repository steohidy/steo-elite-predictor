import { NextResponse } from 'next/server';
import PredictionStore from '@/lib/store';

/**
 * API Cron pour l'automatisation des tâches
 * Appelée automatiquement par Vercel Cron Jobs
 * Sécurisée par vérification du header CRON_SECRET
 */

// Vérifier l'autorisation
function isAuthorized(request: Request): boolean {
  // Vérifier le header d'autorisation Vercel Cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'steo-cron-secret-2026';

  // Vercel ajoute automatiquement ce header pour les cron jobs
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Aussi accepter les appels locaux en développement
  const host = request.headers.get('host') || '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return true;
  }

  return false;
}

/**
 * Tâche: Récupérer et sauvegarder les matchs du jour
 */
async function fetchMatches(): Promise<{ success: boolean; message: string; count: number }> {
  try {
    console.log('📥 [CRON] Récupération des matchs du jour...');

    const { getCrossValidatedMatches } = await import('@/lib/crossValidation');
    const result = await getCrossValidatedMatches();

    if (!result.matches || result.matches.length === 0) {
      return { success: true, message: 'Aucun match disponible', count: 0 };
    }

    // Filtrer les matchs sûrs (risque ≤ 40%)
    const safeMatches = result.matches.filter(
      (m: any) => m.insight && m.insight.riskPercentage <= 40 && m.status === 'upcoming'
    );

    let savedCount = 0;
    for (const match of safeMatches) {
      try {
        PredictionStore.add({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.league || 'Unknown',
          sport: match.sport || 'Foot',
          matchDate: match.date,
          oddsHome: match.oddsHome,
          oddsDraw: match.oddsDraw,
          oddsAway: match.oddsAway,
          predictedResult: match.oddsHome < match.oddsAway ? 'home' : 'away',
          predictedGoals: match.goalsPrediction?.prediction,
          confidence: match.insight?.confidence || 'medium',
          riskPercentage: match.insight?.riskPercentage || 50
        });
        savedCount++;
      } catch {
        // Ignorer si déjà existant
      }
    }

    console.log(`✅ [CRON] ${savedCount} pronostics sauvegardés`);
    return { success: true, message: `${savedCount} pronostics sauvegardés`, count: savedCount };

  } catch (error) {
    console.error('❌ [CRON] Erreur fetch_matches:', error);
    return { success: false, message: 'Erreur lors de la récupération', count: 0 };
  }
}

/**
 * Tâche: Vérifier les résultats des matchs terminés
 */
async function verifyResults(): Promise<{ success: boolean; message: string; checked: number; correct: number }> {
  try {
    console.log('🔍 [CRON] Vérification des résultats...');

    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!apiKey) {
      return { success: false, message: 'API key non configurée', checked: 0, correct: 0 };
    }

    // Récupérer les résultats d'hier
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const response = await fetch(
      `https://api.football-data.org/v4/matches?date=${dateStr}`,
      {
        headers: { 'X-Auth-Token': apiKey },
        next: { revalidate: 0 }
      }
    );

    if (!response.ok) {
      return { success: false, message: `Erreur API: ${response.status}`, checked: 0, correct: 0 };
    }

    const data = await response.json();
    const finishedMatches = (data.matches || []).filter(
      (m: any) => m.status === 'FINISHED' || m.status === 'FT'
    );

    const pendingPredictions = PredictionStore.getPending();

    // Fonction de normalisation des noms d'équipes
    const normalizeName = (name: string): string => {
      return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 8);
    };

    let checkedCount = 0;
    let correctCount = 0;

    for (const prediction of pendingPredictions) {
      for (const match of finishedMatches) {
        const predHomeNorm = normalizeName(prediction.homeTeam);
        const predAwayNorm = normalizeName(prediction.awayTeam);
        const matchHomeNorm = normalizeName(match.homeTeam?.name || '');
        const matchAwayNorm = normalizeName(match.awayTeam?.name || '');

        const homeMatch = predHomeNorm === matchHomeNorm ||
          predHomeNorm.includes(matchHomeNorm) ||
          matchHomeNorm.includes(predHomeNorm);
        const awayMatch = predAwayNorm === matchAwayNorm ||
          predAwayNorm.includes(matchAwayNorm) ||
          matchAwayNorm.includes(predAwayNorm);

        if (homeMatch && awayMatch) {
          const homeScore = match.score?.fullTime?.home ?? match.score?.fullTime?.homeTeam ?? 0;
          const awayScore = match.score?.fullTime?.away ?? match.score?.fullTime?.awayTeam ?? 0;

          const actualResult = homeScore > awayScore ? 'home'
            : homeScore < awayScore ? 'away'
            : 'draw';

          const resultMatch = prediction.predictedResult === actualResult;
          if (resultMatch) correctCount++;

          // Vérifier les buts
          let goalsMatch: boolean | undefined;
          if (prediction.predictedGoals) {
            const totalGoals = homeScore + awayScore;
            if (prediction.predictedGoals.toLowerCase().includes('over2.5')) {
              goalsMatch = totalGoals > 2.5;
            } else if (prediction.predictedGoals.toLowerCase().includes('under2.5')) {
              goalsMatch = totalGoals < 2.5;
            } else if (prediction.predictedGoals.toLowerCase().includes('over1.5')) {
              goalsMatch = totalGoals > 1.5;
            }
          }

          PredictionStore.complete(prediction.matchId, {
            homeScore,
            awayScore,
            actualResult,
            resultMatch,
            goalsMatch
          });

          checkedCount++;
          console.log(`✅ [CRON] ${prediction.homeTeam} ${homeScore}-${awayScore} ${prediction.awayTeam} - ${resultMatch ? '✓' : '✗'}`);
          break;
        }
      }
    }

    console.log(`✅ [CRON] ${checkedCount} résultats vérifiés, ${correctCount} corrects`);
    return {
      success: true,
      message: `${checkedCount} résultats vérifiés`,
      checked: checkedCount,
      correct: correctCount
    };

  } catch (error) {
    console.error('❌ [CRON] Erreur verify_results:', error);
    return { success: false, message: 'Erreur lors de la vérification', checked: 0, correct: 0 };
  }
}

/**
 * Tâche: Nettoyer les anciennes données
 */
async function cleanup(): Promise<{ success: boolean; message: string; removed: number }> {
  try {
    console.log('🧹 [CRON] Nettoyage des anciennes données...');

    const removed = PredictionStore.cleanup();

    console.log(`✅ [CRON] ${removed} anciens pronostics supprimés`);
    return { success: true, message: `${removed} pronostics supprimés`, removed };

  } catch (error) {
    console.error('❌ [CRON] Erreur cleanup:', error);
    return { success: false, message: 'Erreur lors du nettoyage', removed: 0 };
  }
}

/**
 * GET - Handler pour les Cron Jobs Vercel
 */
export async function GET(request: Request) {
  // Vérifier l'autorisation
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Non autorisé', message: 'CRON_SECRET invalide' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const task = searchParams.get('task');

  console.log(`🕐 [CRON] Tâche reçue: ${task}`);

  switch (task) {
    case 'fetch_matches':
      const fetchResult = await fetchMatches();
      return NextResponse.json({
        task: 'fetch_matches',
        timestamp: new Date().toISOString(),
        ...fetchResult
      });

    case 'verify_results':
      const verifyResult = await verifyResults();
      return NextResponse.json({
        task: 'verify_results',
        timestamp: new Date().toISOString(),
        ...verifyResult
      });

    case 'cleanup':
      const cleanupResult = await cleanup();
      return NextResponse.json({
        task: 'cleanup',
        timestamp: new Date().toISOString(),
        ...cleanupResult
      });

    case 'all':
      // Exécuter toutes les tâches
      const [fetchRes, verifyRes] = await Promise.all([
        fetchMatches(),
        verifyResults()
      ]);
      return NextResponse.json({
        task: 'all',
        timestamp: new Date().toISOString(),
        fetch: fetchRes,
        verify: verifyRes
      });

    default:
      return NextResponse.json({
        error: 'Tâche inconnue',
        availableTasks: ['fetch_matches', 'verify_results', 'cleanup', 'all'],
        usage: '?task=<task_name>'
      }, { status: 400 });
  }
}

/**
 * POST - Permet aussi de déclencher manuellement
 */
export async function POST(request: Request) {
  return GET(request);
}
