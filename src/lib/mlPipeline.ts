/**
 * ML PIPELINE - Entraînement et Prédictions Dixon-Coles
 * 
 * Ce module implémente:
 * - Modèle Dixon-Coles pour les prédictions football
 * - Backtesting sur données historiques
 * - Entraînement automatique du modèle
 * - Calcul des métriques de performance
 */

import { supabase, isSupabaseConfigured, TABLES, FootballMatch, MLModelMetrics } from './supabase';

// ===== TYPES =====

export interface TeamStats {
  team_name: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  home_wins: number;
  home_draws: number;
  home_losses: number;
  home_goals_scored: number;
  home_goals_conceded: number;
  away_wins: number;
  away_draws: number;
  away_losses: number;
  away_goals_scored: number;
  away_goals_conceded: number;
  attack_strength?: number;
  defense_strength?: number;
  home_attack?: number;
  home_defense?: number;
  away_attack?: number;
  away_defense?: number;
}

export interface MatchPrediction {
  home_team: string;
  away_team: string;
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  expected_home_goals: number;
  expected_away_goals: number;
  over_25_prob: number;
  btts_prob: number;
  correct_scores: { home: number; away: number; prob: number }[];
  confidence: number;
  value_bet?: {
    type: 'home' | 'draw' | 'away' | 'over' | 'under' | 'btts';
    edge: number;
    model_prob: number;
    market_prob: number;
  };
}

export interface TrainingConfig {
  season?: string;
  sport?: 'football' | 'basketball';
  testSplit?: number;
  minMatchesPerTeam?: number;
  leagues?: string[];
}

export interface TrainingResult {
  success: boolean;
  accuracy: number;
  home_accuracy: number;
  draw_accuracy: number;
  away_accuracy: number;
  roi_percent: number;
  total_predictions: number;
  model_version: string;
  training_date: string;
  brier_score?: number;
  message?: string;
}

// ===== MODÈLE DIXON-COLES =====

/**
 * Calcule la force relative des équipes
 */
function calculateTeamStrengths(
  matches: FootballMatch[],
  minMatches: number = 5
): Map<string, TeamStats> {
  const teamStats = new Map<string, TeamStats>();

  // Collecter les stats pour chaque équipe
  for (const match of matches) {
    // Stats domicile
    const homeStats = teamStats.get(match.home_team) || createEmptyStats(match.home_team);
    homeStats.matches_played++;
    homeStats.home_goals_scored = (homeStats.home_goals_scored || 0) + (match.home_score || 0);
    homeStats.home_goals_conceded = (homeStats.home_goals_conceded || 0) + (match.away_score || 0);
    homeStats.goals_scored = (homeStats.goals_scored || 0) + (match.home_score || 0);
    homeStats.goals_conceded = (homeStats.goals_conceded || 0) + (match.away_score || 0);
    
    if (match.result === 'H') {
      homeStats.wins++;
      homeStats.home_wins++;
    } else if (match.result === 'D') {
      homeStats.draws++;
      homeStats.home_draws++;
    } else {
      homeStats.losses++;
      homeStats.home_losses++;
    }
    teamStats.set(match.home_team, homeStats);

    // Stats extérieur
    const awayStats = teamStats.get(match.away_team) || createEmptyStats(match.away_team);
    awayStats.matches_played++;
    awayStats.away_goals_scored = (awayStats.away_goals_scored || 0) + (match.away_score || 0);
    awayStats.away_goals_conceded = (awayStats.away_goals_conceded || 0) + (match.home_score || 0);
    awayStats.goals_scored = (awayStats.goals_scored || 0) + (match.away_score || 0);
    awayStats.goals_conceded = (awayStats.goals_conceded || 0) + (match.home_score || 0);
    
    if (match.result === 'A') {
      awayStats.wins++;
      awayStats.away_wins++;
    } else if (match.result === 'D') {
      awayStats.draws++;
      awayStats.away_draws++;
    } else {
      awayStats.losses++;
      awayStats.away_losses++;
    }
    teamStats.set(match.away_team, awayStats);
  }

  // Calculer les forces relatives
  const totalGoals = Array.from(teamStats.values()).reduce((sum, t) => sum + (t.goals_scored || 0), 0);
  const avgGoalsPerMatch = totalGoals / (matches.length * 2);

  for (const [team, stats] of teamStats) {
    if (stats.matches_played >= minMatches) {
      // Force offensive
      stats.attack_strength = (stats.goals_scored || 0) / (stats.matches_played * avgGoalsPerMatch);
      stats.home_attack = (stats.home_goals_scored || 0) / ((stats.home_wins + stats.home_draws + stats.home_losses) * avgGoalsPerMatch);
      stats.away_attack = (stats.away_goals_scored || 0) / ((stats.away_wins + stats.away_draws + stats.away_losses) * avgGoalsPerMatch);
      
      // Force défensive
      stats.defense_strength = (stats.goals_conceded || 0) / (stats.matches_played * avgGoalsPerMatch);
      stats.home_defense = (stats.home_goals_conceded || 0) / ((stats.home_wins + stats.home_draws + stats.home_losses) * avgGoalsPerMatch);
      stats.away_defense = (stats.away_goals_conceded || 0) / ((stats.away_wins + stats.away_draws + stats.away_losses) * avgGoalsPerMatch);
    }
    teamStats.set(team, stats);
  }

  return teamStats;
}

function createEmptyStats(teamName: string): TeamStats {
  return {
    team_name: teamName,
    matches_played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_scored: 0,
    goals_conceded: 0,
    home_wins: 0,
    home_draws: 0,
    home_losses: 0,
    home_goals_scored: 0,
    home_goals_conceded: 0,
    away_wins: 0,
    away_draws: 0,
    away_losses: 0,
    away_goals_scored: 0,
    away_goals_conceded: 0
  };
}

/**
 * Prédit un match avec le modèle Dixon-Coles
 */
export function predictMatch(
  homeTeam: string,
  awayTeam: string,
  teamStats: Map<string, TeamStats>
): MatchPrediction | null {
  const home = teamStats.get(homeTeam);
  const away = teamStats.get(awayTeam);

  if (!home || !away || !home.attack_strength || !away.attack_strength) {
    return null;
  }

  // Calculer les expected goals avec ajustement Dixon-Coles
  const homeExpected = (home.home_attack || home.attack_strength) * 
                       (away.away_defense || away.defense_strength || 1) * 
                       1.35; // Avantage domicile
  const awayExpected = (away.away_attack || away.attack_strength) * 
                       (home.home_defense || home.defense_strength || 1);

  // Distribution de Poisson pour les buts
  const homeWinProb = calculateOutcomeProbability(homeExpected, awayExpected, 'home');
  const drawProb = calculateOutcomeProbability(homeExpected, awayExpected, 'draw');
  const awayWinProb = calculateOutcomeProbability(homeExpected, awayExpected, 'away');

  // Over 2.5
  const over25Prob = calculateOverProbability(homeExpected + awayExpected, 2.5);

  // BTTS
  const bttsProb = (1 - poissonProbability(homeExpected, 0)) * (1 - poissonProbability(awayExpected, 0));

  // Scores exacts
  const correctScores = calculateCorrectScores(homeExpected, awayExpected);

  // Confiance
  const maxProb = Math.max(homeWinProb, drawProb, awayWinProb);
  const confidence = maxProb * 100;

  return {
    home_team: homeTeam,
    away_team: awayTeam,
    home_win_prob: homeWinProb * 100,
    draw_prob: drawProb * 100,
    away_win_prob: awayWinProb * 100,
    expected_home_goals: homeExpected,
    expected_away_goals: awayExpected,
    over_25_prob: over25Prob * 100,
    btts_prob: bttsProb * 100,
    correct_scores: correctScores,
    confidence
  };
}

function calculateOutcomeProbability(
  homeExpected: number,
  awayExpected: number,
  outcome: 'home' | 'draw' | 'away'
): number {
  let probability = 0;
  const maxGoals = 7;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = poissonProbability(homeExpected, h) * poissonProbability(awayExpected, a);
      if (outcome === 'home' && h > a) probability += prob;
      if (outcome === 'draw' && h === a) probability += prob;
      if (outcome === 'away' && h < a) probability += prob;
    }
  }

  return probability;
}

function calculateOverProbability(totalExpected: number, line: number): number {
  let probability = 0;
  const maxGoals = 10;

  for (let g = Math.ceil(line + 0.5); g <= maxGoals; g++) {
    probability += poissonProbability(totalExpected, g);
  }

  return probability;
}

function poissonProbability(expected: number, k: number): number {
  return (Math.pow(expected, k) * Math.exp(-expected)) / factorial(k);
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function calculateCorrectScores(
  homeExpected: number,
  awayExpected: number,
  topN: number = 5
): { home: number; away: number; prob: number }[] {
  const scores: { home: number; away: number; prob: number }[] = [];
  const maxGoals = 5;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = poissonProbability(homeExpected, h) * poissonProbability(awayExpected, a);
      scores.push({ home: h, away: a, prob: prob * 100 });
    }
  }

  return scores.sort((a, b) => b.prob - a.prob).slice(0, topN);
}

// ===== ENTRAÎNEMENT ET BACKTEST =====

/**
 * Charge les données d'entraînement depuis Supabase
 */
export async function loadTrainingData(config: TrainingConfig): Promise<FootballMatch[]> {
  if (!supabase) return [];

  try {
    let query = supabase
      .from(TABLES.FOOTBALL_MATCHES)
      .select('*')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null);

    if (config.season) {
      query = query.eq('season', config.season);
    }

    if (config.leagues && config.leagues.length > 0) {
      query = query.in('league_name', config.leagues);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erreur chargement données:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Erreur loadTrainingData:', err);
    return [];
  }
}

/**
 * Divise les données en train/test
 */
export function splitTrainTest(
  matches: FootballMatch[],
  testSplit: number = 0.2
): { train: FootballMatch[]; test: FootballMatch[] } {
  // Trier par date
  const sorted = [...matches].sort((a, b) => 
    new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
  );

  const splitIndex = Math.floor(sorted.length * (1 - testSplit));
  
  return {
    train: sorted.slice(0, splitIndex),
    test: sorted.slice(splitIndex)
  };
}

/**
 * Exécute le backtest
 */
export async function runBacktest(
  testMatches: FootballMatch[],
  teamStats: Map<string, TeamStats>
): Promise<{
  accuracy: number;
  home_accuracy: number;
  draw_accuracy: number;
  away_accuracy: number;
  brier_score: number;
  total: number;
}> {
  let correct = 0;
  let homeCorrect = 0;
  let homeTotal = 0;
  let drawCorrect = 0;
  let drawTotal = 0;
  let awayCorrect = 0;
  let awayTotal = 0;
  let brierScore = 0;

  for (const match of testMatches) {
    const prediction = predictMatch(match.home_team, match.away_team, teamStats);
    
    if (!prediction || !match.result) continue;

    const predicted = prediction.home_win_prob > prediction.draw_prob && 
                      prediction.home_win_prob > prediction.away_win_prob ? 'H' :
                      prediction.draw_prob > prediction.away_win_prob ? 'D' : 'A';

    const actual = match.result;

    if (predicted === actual) {
      correct++;
      if (actual === 'H') homeCorrect++;
      if (actual === 'D') drawCorrect++;
      if (actual === 'A') awayCorrect++;
    }

    if (actual === 'H') homeTotal++;
    if (actual === 'D') drawTotal++;
    if (actual === 'A') awayTotal++;

    // Brier score
    const probs = {
      H: prediction.home_win_prob / 100,
      D: prediction.draw_prob / 100,
      A: prediction.away_win_prob / 100
    };
    const actuals = { H: actual === 'H' ? 1 : 0, D: actual === 'D' ? 1 : 0, A: actual === 'A' ? 1 : 0 };
    brierScore += Math.pow(probs.H - actuals.H, 2) + 
                  Math.pow(probs.D - actuals.D, 2) + 
                  Math.pow(probs.A - actuals.A, 2);
  }

  const total = testMatches.length;

  return {
    accuracy: total > 0 ? (correct / total) * 100 : 0,
    home_accuracy: homeTotal > 0 ? (homeCorrect / homeTotal) * 100 : 0,
    draw_accuracy: drawTotal > 0 ? (drawCorrect / drawTotal) * 100 : 0,
    away_accuracy: awayTotal > 0 ? (awayCorrect / awayTotal) * 100 : 0,
    brier_score: total > 0 ? brierScore / total : 0,
    total
  };
}

/**
 * Entraîne le modèle
 */
export async function trainModel(config: TrainingConfig): Promise<TrainingResult> {
  console.log('🚀 Démarrage entraînement ML...', config);

  try {
    // Charger les données
    const matches = await loadTrainingData(config);
    
    if (matches.length < 100) {
      return {
        success: false,
        accuracy: 0,
        home_accuracy: 0,
        draw_accuracy: 0,
        away_accuracy: 0,
        roi_percent: 0,
        total_predictions: 0,
        model_version: '2.0.0',
        training_date: new Date().toISOString(),
        message: `Données insuffisantes: ${matches.length} matchs (minimum 100 requis)`
      };
    }

    console.log(`📊 ${matches.length} matchs chargés`);

    // Diviser train/test
    const { train, test } = splitTrainTest(matches, config.testSplit || 0.2);
    console.log(`✂️ Train: ${train.length}, Test: ${test.length}`);

    // Calculer les forces d'équipe sur train
    const teamStats = calculateTeamStrengths(train, config.minMatchesPerTeam || 5);
    console.log(`👥 ${teamStats.size} équipes analysées`);

    // Backtest sur test
    const metrics = await runBacktest(test, teamStats);
    console.log(`📈 Accuracy: ${metrics.accuracy.toFixed(1)}%`);

    // Calculer ROI simulé
    const roi = await calculateSimulatedROI(test, teamStats);

    // Version du modèle
    const modelVersion = `2.0.${Date.now().toString().slice(-6)}`;

    // Sauvegarder les métriques
    const modelMetrics: MLModelMetrics = {
      model_version: modelVersion,
      accuracy: metrics.accuracy,
      home_accuracy: metrics.home_accuracy,
      draw_accuracy: metrics.draw_accuracy,
      away_accuracy: metrics.away_accuracy,
      brier_score: metrics.brier_score,
      roi_percent: roi,
      total_predictions: metrics.total,
      training_date: new Date().toISOString()
    };

    await saveModelMetrics(modelMetrics);

    return {
      success: true,
      accuracy: metrics.accuracy,
      home_accuracy: metrics.home_accuracy,
      draw_accuracy: metrics.draw_accuracy,
      away_accuracy: metrics.away_accuracy,
      brier_score: metrics.brier_score,
      roi_percent: roi,
      total_predictions: metrics.total,
      model_version: modelVersion,
      training_date: modelMetrics.training_date
    };

  } catch (error: any) {
    console.error('❌ Erreur entraînement:', error);
    return {
      success: false,
      accuracy: 0,
      home_accuracy: 0,
      draw_accuracy: 0,
      away_accuracy: 0,
      roi_percent: 0,
      total_predictions: 0,
      model_version: '2.0.0',
      training_date: new Date().toISOString(),
      message: error.message
    };
  }
}

async function saveModelMetrics(metrics: MLModelMetrics): Promise<void> {
  if (!supabase) return;

  try {
    await supabase.from(TABLES.ML_METRICS).insert(metrics);
  } catch (err) {
    console.error('Erreur sauvegarde métriques:', err);
  }
}

async function calculateSimulatedROI(
  testMatches: FootballMatch[],
  teamStats: Map<string, TeamStats>
): Promise<number> {
  let bankroll = 1000;
  const betSize = 50;

  for (const match of testMatches) {
    const prediction = predictMatch(match.home_team, match.away_team, teamStats);
    
    if (!prediction || !match.result) continue;

    // Parier sur le favori si confidence > 50%
    const maxProb = Math.max(prediction.home_win_prob, prediction.draw_prob, prediction.away_win_prob);
    
    if (maxProb > 50) {
      const betOn = prediction.home_win_prob === maxProb ? 'H' :
                    prediction.draw_prob === maxProb ? 'D' : 'A';
      
      if (match.result === betOn) {
        // Gain simulé (cote moyenne 1.8)
        bankroll += betSize * 0.8;
      } else {
        bankroll -= betSize;
      }
    }
  }

  return ((bankroll - 1000) / 1000) * 100;
}

export default {
  trainModel,
  predictMatch,
  loadTrainingData,
  splitTrainTest,
  runBacktest,
  calculateTeamStrengths
};
