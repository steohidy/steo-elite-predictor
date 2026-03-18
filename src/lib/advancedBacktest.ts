/**
 * BACKTESTING AVANCÉ - Simulation réaliste de paris sportifs
 * 
 * Fonctionnalités:
 * - Critère de Kelly pour la gestion de bankroll
 * - Closing Line Value (CLV) pour valider la qualité des prédictions
 * - Simulation Monte Carlo pour analyse de risque (drawdown)
 */

import { getSupabaseAdmin, TABLES } from './supabase';

// ===== TYPES =====

export interface BacktestConfig {
  initialBankroll: number;
  kellyFraction: number;
  minConfidence: number;
  minExpectedValue: number;
  sport: 'football' | 'basketball';
  season?: string;
  league?: string;
}

export interface BacktestResult {
  success: boolean;
  totalMatches: number;
  matchesBet: number;
  wins: number;
  losses: number;
  initialBankroll: number;
  finalBankroll: number;
  maxBankroll: number;
  minBankroll: number;
  roi: number;
  yield: number;
  winRate: number;
  avgOdds: number;
  avgKellyStake: number;
  avgCLV: number;
  clvPositiveRate: number;
  maxDrawdown: number;
  longestLosingStreak: number;
  history: BankrollHistoryPoint[];
  byConfidence: { range: string; total: number; wins: number; roi: number }[];
  byLeague: { league: string; total: number; wins: number; roi: number }[];
  message?: string;
}

export interface BankrollHistoryPoint {
  matchId: string;
  date: string;
  bankrollBefore: number;
  stake: number;
  betOn: 'H' | 'D' | 'A';
  odds: number;
  result: 'win' | 'loss';
  profit: number;
  bankrollAfter: number;
  clv: number;
}

export interface MonteCarloResult {
  simulations: number;
  profitableScenarios: number;
  avgFinalBankroll: number;
  worstCase: number;
  bestCase: number;
  bankruptcyRate: number;
  medianROI: number;
  percentile5: number;
  percentile95: number;
}

// ===== FONCTIONS UTILITAIRES =====

/**
 * Calcule la mise optimale selon le critère de Kelly
 * Kelly% = (bp - q) / b
 */
export function calculateKellyStake(
  probability: number,
  odds: number,
  kellyFraction: number = 0.25
): number {
  if (odds <= 1 || probability <= 0 || probability >= 1) return 0;
  
  const b = odds - 1;  // Profit net par unité
  const q = 1 - probability;
  
  let kelly = (b * probability - q) / b;
  
  if (kelly <= 0) return 0;
  
  kelly *= kellyFraction;
  return Math.min(kelly, 0.10); // Max 10% de la bankroll
}

/**
 * Calcule la value attendue (Expected Value)
 */
export function calculateExpectedValue(probability: number, odds: number): number {
  return (probability * odds) - 1;
}

/**
 * Calcule le Closing Line Value (CLV)
 */
export function calculateCLV(takenOdds: number, closingOdds: number): number {
  if (!closingOdds || closingOdds <= 0) return 0;
  return ((takenOdds - closingOdds) / closingOdds) * 100;
}

// ===== FONCTIONS DE PRÉDICTION =====

interface TeamStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

async function calculateTeamStats(matches: any[], sport: string): Promise<Map<string, TeamStats>> {
  const stats = new Map<string, TeamStats>();
  
  for (const match of matches) {
    // Home team
    const homeStats = stats.get(match.home_team) || {
      played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0
    };
    homeStats.played++;
    homeStats.goalsFor += match.home_score || 0;
    homeStats.goalsAgainst += match.away_score || 0;
    if (match.result === 'H') homeStats.wins++;
    else if (match.result === 'D') homeStats.draws++;
    else homeStats.losses++;
    stats.set(match.home_team, homeStats);
    
    // Away team
    const awayStats = stats.get(match.away_team) || {
      played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0
    };
    awayStats.played++;
    awayStats.goalsFor += match.away_score || 0;
    awayStats.goalsAgainst += match.home_score || 0;
    if (match.result === 'A') awayStats.wins++;
    else if (match.result === 'D') awayStats.draws++;
    else awayStats.losses++;
    stats.set(match.away_team, awayStats);
  }
  
  return stats;
}

function predictMatchResult(
  match: any,
  teamStats: Map<string, TeamStats>,
  sport: string
): { home_prob: number; draw_prob: number; away_prob: number } | null {
  const homeStats = teamStats.get(match.home_team);
  const awayStats = teamStats.get(match.away_team);
  
  if (!homeStats || !awayStats || homeStats.played < 3 || awayStats.played < 3) {
    return null;
  }
  
  const homeStrength = (homeStats.wins / homeStats.played) + 0.1;
  const awayStrength = awayStats.wins / awayStats.played;
  
  const totalStrength = homeStrength + awayStrength + 0.3;
  
  return {
    home_prob: homeStrength / totalStrength,
    draw_prob: 0.3 / totalStrength,
    away_prob: awayStrength / totalStrength
  };
}

function getConfidenceRange(confidence: number): string {
  if (confidence < 50) return '0-50%';
  if (confidence < 60) return '50-60%';
  if (confidence < 70) return '60-70%';
  if (confidence < 80) return '70-80%';
  return '80%+';
}

// ===== BACKTEST PRINCIPAL =====

export async function runAdvancedBacktest(config: BacktestConfig): Promise<BacktestResult> {
  console.log('📊 ===== BACKTEST AVANCÉ =====');
  console.log(`💰 Bankroll initiale: ${config.initialBankroll}`);
  console.log(`🎯 Kelly fraction: ${config.kellyFraction * 100}%`);
  console.log(`🏅 Sport: ${config.sport}`);
  
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return {
      success: false,
      totalMatches: 0,
      matchesBet: 0,
      wins: 0,
      losses: 0,
      initialBankroll: config.initialBankroll,
      finalBankroll: config.initialBankroll,
      maxBankroll: config.initialBankroll,
      minBankroll: config.initialBankroll,
      roi: 0,
      yield: 0,
      winRate: 0,
      avgOdds: 0,
      avgKellyStake: 0,
      avgCLV: 0,
      clvPositiveRate: 0,
      maxDrawdown: 0,
      longestLosingStreak: 0,
      history: [],
      byConfidence: [],
      byLeague: [],
      message: 'Supabase non configuré'
    };
  }
  
  // Charger les matchs
  const table = config.sport === 'football' ? TABLES.FOOTBALL_MATCHES : TABLES.BASKETBALL_MATCHES;
  
  let query = adminClient
    .from(table)
    .select('*')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null)
    .not('result', 'is', null);
  
  if (config.season) query = query.eq('season', config.season);
  if (config.league) query = query.eq('league_name', config.league);
  
  const { data: matches, error } = await query.order('match_date', { ascending: true });
  
  if (error || !matches || matches.length === 0) {
    return {
      success: false,
      totalMatches: 0,
      matchesBet: 0,
      wins: 0,
      losses: 0,
      initialBankroll: config.initialBankroll,
      finalBankroll: config.initialBankroll,
      maxBankroll: config.initialBankroll,
      minBankroll: config.initialBankroll,
      roi: 0,
      yield: 0,
      winRate: 0,
      avgOdds: 0,
      avgKellyStake: 0,
      avgCLV: 0,
      clvPositiveRate: 0,
      maxDrawdown: 0,
      longestLosingStreak: 0,
      history: [],
      byConfidence: [],
      byLeague: [],
      message: `Aucun match trouvé: ${error?.message || 'table vide'}`
    };
  }
  
  console.log(`📈 ${matches.length} matchs chargés`);
  
  // Calculer les stats d'équipe
  const teamStats = await calculateTeamStats(matches, config.sport);
  
  // Variables de backtest
  let currentBankroll = config.initialBankroll;
  let maxBankroll = config.initialBankroll;
  let minBankroll = config.initialBankroll;
  let totalStaked = 0;
  let matchesBet = 0;
  let wins = 0;
  let losses = 0;
  let maxDrawdown = 0;
  let currentStreak = 0;
  let longestLosingStreak = 0;
  let totalCLV = 0;
  let positiveCLVCount = 0;
  let totalOdds = 0;
  let totalKellyStake = 0;
  
  const history: BankrollHistoryPoint[] = [];
  const confidenceBuckets: Record<string, { total: number; wins: number; profit: number; staked: number }> = {};
  const leagueStats: Record<string, { total: number; wins: number; profit: number; staked: number }> = {};
  
  // Simuler chaque match
  for (const match of matches) {
    const prediction = predictMatchResult(match, teamStats, config.sport);
    if (!prediction) continue;
    
    // Options de paris
    const bets = [
      { type: 'H' as const, prob: prediction.home_prob, odds: match.odds_home || 2.0 },
      { type: 'D' as const, prob: prediction.draw_prob, odds: match.odds_draw || 3.3 },
      { type: 'A' as const, prob: prediction.away_prob, odds: match.odds_away || 3.0 }
    ];
    
    // Filtrer par confiance et EV
    const validBets = bets.filter(b => {
      const ev = calculateExpectedValue(b.prob, b.odds);
      const confidence = b.prob * 100;
      return ev > config.minExpectedValue && confidence >= config.minConfidence;
    });
    
    if (validBets.length === 0) continue;
    
    // Choisir le meilleur bet
    const bestBet = validBets.reduce((best, b) => {
      const ev = calculateExpectedValue(b.prob, b.odds);
      const bestEv = calculateExpectedValue(best.prob, best.odds);
      return ev > bestEv ? b : best;
    });
    
    // Calculer la mise Kelly
    const kellyStake = calculateKellyStake(bestBet.prob, bestBet.odds, config.kellyFraction);
    const stakeAmount = currentBankroll * kellyStake;
    
    if (stakeAmount < 1) continue;
    
    // Enregistrer
    totalStaked += stakeAmount;
    matchesBet++;
    totalOdds += bestBet.odds;
    totalKellyStake += kellyStake;
    
    // Résultat
    const actualResult = match.result;
    const didWin = bestBet.type === actualResult;
    
    let profit = 0;
    if (didWin) {
      profit = stakeAmount * (bestBet.odds - 1);
      currentBankroll += profit;
      wins++;
      currentStreak = 0;
    } else {
      profit = -stakeAmount;
      currentBankroll += profit;
      losses++;
      currentStreak++;
      longestLosingStreak = Math.max(longestLosingStreak, currentStreak);
    }
    
    maxBankroll = Math.max(maxBankroll, currentBankroll);
    minBankroll = Math.min(minBankroll, currentBankroll);
    
    const drawdown = (maxBankroll - currentBankroll) / maxBankroll;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    
    // CLV
    const closingOdds = bestBet.type === 'H' ? match.closing_odds_home :
                       bestBet.type === 'D' ? match.closing_odds_draw :
                       match.closing_odds_away;
    
    const clv = closingOdds ? calculateCLV(bestBet.odds, closingOdds) : 0;
    if (clv > 0) {
      totalCLV += clv;
      positiveCLVCount++;
    }
    
    // Historique
    history.push({
      matchId: match.id,
      date: match.match_date,
      bankrollBefore: currentBankroll - profit,
      stake: stakeAmount,
      betOn: bestBet.type,
      odds: bestBet.odds,
      result: didWin ? 'win' : 'loss',
      profit,
      bankrollAfter: currentBankroll,
      clv
    });
    
    // Stats par confiance
    const confidenceRange = getConfidenceRange(bestBet.prob * 100);
    if (!confidenceBuckets[confidenceRange]) {
      confidenceBuckets[confidenceRange] = { total: 0, wins: 0, profit: 0, staked: 0 };
    }
    confidenceBuckets[confidenceRange].total++;
    confidenceBuckets[confidenceRange].staked += stakeAmount;
    if (didWin) confidenceBuckets[confidenceRange].wins++;
    confidenceBuckets[confidenceRange].profit += profit;
    
    // Stats par ligue
    const league = match.league_name;
    if (!leagueStats[league]) {
      leagueStats[league] = { total: 0, wins: 0, profit: 0, staked: 0 };
    }
    leagueStats[league].total++;
    leagueStats[league].staked += stakeAmount;
    if (didWin) leagueStats[league].wins++;
    leagueStats[league].profit += profit;
  }
  
  // Résultats finaux
  const totalProfit = currentBankroll - config.initialBankroll;
  
  const result: BacktestResult = {
    success: true,
    totalMatches: matches.length,
    matchesBet,
    wins,
    losses,
    initialBankroll: config.initialBankroll,
    finalBankroll: currentBankroll,
    maxBankroll,
    minBankroll,
    roi: totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0,
    yield: totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0,
    winRate: matchesBet > 0 ? (wins / matchesBet) * 100 : 0,
    avgOdds: matchesBet > 0 ? totalOdds / matchesBet : 0,
    avgKellyStake: matchesBet > 0 ? (totalKellyStake / matchesBet) * 100 : 0,
    avgCLV: positiveCLVCount > 0 ? totalCLV / positiveCLVCount : 0,
    clvPositiveRate: matchesBet > 0 ? (positiveCLVCount / matchesBet) * 100 : 0,
    maxDrawdown: maxDrawdown * 100,
    longestLosingStreak,
    history,
    byConfidence: Object.entries(confidenceBuckets).map(([range, stats]) => ({
      range,
      total: stats.total,
      wins: stats.wins,
      roi: stats.staked > 0 ? (stats.profit / stats.staked) * 100 : 0
    })),
    byLeague: Object.entries(leagueStats).map(([league, stats]) => ({
      league,
      total: stats.total,
      wins: stats.wins,
      roi: stats.staked > 0 ? (stats.profit / stats.staked) * 100 : 0
    }))
  };
  
  console.log(`\n📊 ===== RÉSULTATS =====`);
  console.log(`💰 Bankroll: ${config.initialBankroll} → ${currentBankroll.toFixed(2)}`);
  console.log(`📈 ROI: ${result.roi.toFixed(2)}%`);
  console.log(`🎯 Win rate: ${result.winRate.toFixed(1)}%`);
  console.log(`📉 Max drawdown: ${result.maxDrawdown.toFixed(2)}%`);
  console.log(`⚠️ Plus longue série perdante: ${longestLosingStreak}`);
  
  return result;
}

// ===== SIMULATION MONTE CARLO =====

export async function runMonteCarloSimulation(
  _matches: any[],
  config: {
    initialBankroll: number;
    kellyFraction: number;
    minConfidence: number;
    simulations: number;
  }
): Promise<MonteCarloResult> {
  console.log(`🎲 ===== MONTE CARLO (${config.simulations} simulations) =====`);
  
  const finalBankrolls: number[] = [];
  let profitableScenarios = 0;
  let bankruptcies = 0;
  
  for (let sim = 0; sim < config.simulations; sim++) {
    let bankroll = config.initialBankroll;
    const numBets = 100; // Simuler 100 paris
    
    for (let i = 0; i < numBets; i++) {
      if (bankroll <= 0) {
        bankruptcies++;
        break;
      }
      
      // Simuler un pari aléatoire
      const odds = 1.5 + Math.random() * 2; // 1.5 à 3.5
      const prob = 0.3 + Math.random() * 0.4; // 30% à 70%
      
      const kellyStake = calculateKellyStake(prob, odds, config.kellyFraction);
      const stake = bankroll * kellyStake;
      
      if (stake < 1) continue;
      
      // Simuler le résultat
      const didWin = Math.random() < prob;
      
      if (didWin) {
        bankroll += stake * (odds - 1);
      } else {
        bankroll -= stake;
      }
    }
    
    finalBankrolls.push(bankroll);
    if (bankroll > config.initialBankroll) profitableScenarios++;
  }
  
  finalBankrolls.sort((a, b) => a - b);
  
  const result: MonteCarloResult = {
    simulations: config.simulations,
    profitableScenarios: (profitableScenarios / config.simulations) * 100,
    avgFinalBankroll: finalBankrolls.reduce((a, b) => a + b, 0) / finalBankrolls.length,
    worstCase: finalBankrolls[0],
    bestCase: finalBankrolls[finalBankrolls.length - 1],
    bankruptcyRate: (bankruptcies / config.simulations) * 100,
    medianROI: ((finalBankrolls[Math.floor(finalBankrolls.length / 2)] - config.initialBankroll) / config.initialBankroll) * 100,
    percentile5: ((finalBankrolls[Math.floor(finalBankrolls.length * 0.05)] - config.initialBankroll) / config.initialBankroll) * 100,
    percentile95: ((finalBankrolls[Math.floor(finalBankrolls.length * 0.95)] - config.initialBankroll) / config.initialBankroll) * 100
  };
  
  console.log(`✅ Scénarios rentables: ${result.profitableScenarios.toFixed(1)}%`);
  console.log(`💸 Taux de faillite: ${result.bankruptcyRate.toFixed(1)}%`);
  console.log(`📈 ROI médian: ${result.medianROI.toFixed(2)}%`);
  
  return result;
}

export default {
  runAdvancedBacktest,
  runMonteCarloSimulation,
  calculateKellyStake,
  calculateExpectedValue,
  calculateCLV
};
