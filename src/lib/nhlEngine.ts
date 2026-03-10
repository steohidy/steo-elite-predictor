/**
 * NHL Hockey Prediction Engine
 * 
 * Le hockey sur glace possède des métriques uniques très prédictives:
 * - Corsi & Fenwick (possession)
 * - Expected Goals (xG)
 * - Fatigue (Back-to-back)
 * - Facteur Gardien (50% de l'équipe)
 * - Special Teams (PP%, PK%)
 * 
 * Sources de données gratuites:
 * - NHL.com/stats (stats EDGE: vitesse, distance)
 * - Hockey-Reference (historique CSV)
 * - Natural Stat Trick (Corsi, Fenwick, xG)
 * - MoneyPuck (xG détaillé)
 */

// ===== TYPES =====

export interface NHLTeamStats {
  teamId: string;
  teamName: string;
  abbreviation: string;
  
  // Statistiques de possession (10 derniers matchs)
  corsiForPct: number;        // CF% - % tentatives de tir
  fenwickForPct: number;      // FF% - % tirs non bloqués
  shotsForPerGame: number;
  shotsAgainstPerGame: number;
  
  // Expected Goals (xG)
  xGForPerGame: number;       // Expected Goals For
  xGAgainstPerGame: number;   // Expected Goals Against
  xGDiff: number;             // Différentiel xG
  
  // Buts réels
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  
  // Forme récente (5 derniers matchs)
  last5Results: ('W' | 'L' | 'OTL' | 'SOL')[];
  last10Record: { wins: number; losses: number; otLosses: number };
  
  // Special Teams
  powerPlayPct: number;       // PP% - Avantage numérique
  penaltyKillPct: number;     // PK% - Désavantage numérique
  
  // Statistiques avancées
  pdo: number;                // SH% + SV% (chance/régression vers 100)
  ozoneStartPct: number;      // % de mises en jeu en zone offensive
  faceoffWinPct: number;      // % de mises en jeu gagnées
  
  // Classement
  standing: {
    position: number;
    points: number;
    gamesPlayed: number;
    wildcard: boolean;
  };
  
  // Facteurs contextuels
  homeAdvantage: number;      // Performance domicile vs extérieur
  daysSinceLastGame: number;
  isBackToBack: boolean;      // Joue la veille
  gamesInLast7Days: number;   // Charge du calendrier
  
  // Blessés
  injuredPlayers: {
    name: string;
    position: 'G' | 'D' | 'LW' | 'RW' | 'C';
    impact: 'high' | 'medium' | 'low';
  }[];
}

export interface NHLGoalieStats {
  name: string;
  team: string;
  
  // Stats de base
  gamesPlayed: number;
  wins: number;
  losses: number;
  otLosses: number;
  
  // Stats avancées
  gaa: number;              // Goals Against Average
  savePct: number;          // Save Percentage (.900 = 90%)
  shutouts: number;
  
  // Forme récente
  last5GAA: number;
  last5SavePct: number;
  
  // Facteurs
  isStarter: boolean;       // Titulaire ou auxiliaire
  restDays: number;         // Jours de repos
  vsOpponentSavePct?: number; // Historique vs adversaire
}

export interface NHLMatchData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  time?: string;
  
  // Cotes
  oddsHome: number;         // Moneyline domicile
  oddsAway: number;         // Moneyline extérieur
  oddsDraw?: number;        // OT/SO inclus ou non selon bookmaker
  
  // Puck Line (handicap)
  puckLine?: number;
  puckLineOddsHome?: number;
  puckLineOddsAway?: number;
  
  // Total (Over/Under)
  totalLine: number;        // Généralement 5.5 ou 6.0
  overOdds?: number;
  underOdds?: number;
  
  // Contexte
  isBackToBackHome: boolean;
  isBackToBackAway: boolean;
  travelDistance?: number;  // km parcourus par l'équipe à l'extérieur
}

export interface NHLPrediction {
  // Probabilités principales
  homeWin: number;          // Victoire domicile (incluant OT/SO)
  awayWin: number;          // Victoire extérieur (incluant OT/SO)
  draw?: number;            // Match nul après 60 min (rare, ~20%)
  
  // Scores projetés
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  mostLikelyScores: { score: string; prob: number }[];
  
  // Marchés dérivés
  overUnder: {
    total: number;
    overProb: number;
    underProb: number;
    recommendation: 'over' | 'under' | 'pass';
  };
  
  puckLine: {
    homeProb: number;
    awayProb: number;
    recommendation: 'home' | 'away' | 'pass';
  };
  
  // Facteurs clés
  keyFactors: {
    corsiEdge: number;          // Avantage possession
    xGEdge: number;             // Avantage Expected Goals
    goalieEdge: number;         // Avantage gardien
    fatigueEdge: number;        // Avantage repos
    specialTeamsEdge: number;   // Avantage special teams
  };
  
  // Confiance
  confidence: number;       // 0-100
  valueBet?: {
    type: 'moneyline' | 'puckline' | 'total';
    pick: string;
    edge: number;           // % d'avantage vs cote
  };
  
  // Kelly Criterion
  kellyFraction: number;    // Fraction de bankroll à miser
}

// ===== CONSTANTS =====

const NHL_AVERAGES = {
  goalsPerGame: 3.15,       // Moyenne NHL 2023-24
  homeGoalBoost: 0.08,      // +8% buts à domicile
  avgShotsPerGame: 30.5,
  avgSavePct: 0.903,
  avgCorsiPct: 50,          // Par définition
};

// Régulation vers la moyenne (PDO)
const PDO_REGRESSION = 0.7; // 70% de régression vers 1000

// Poids des facteurs dans la prédiction
const FACTOR_WEIGHTS = {
  corsi: 0.15,
  xG: 0.25,
  goalie: 0.30,             // Le gardien = 50% de l'équipe
  fatigue: 0.10,
  specialTeams: 0.10,
  homeIce: 0.05,
  injuries: 0.05,
};

// ===== NHLPREDICTION ENGINE =====

export class NHLEngine {
  
  /**
   * Calcule la probabilité de victoire basée sur le Corsi
   * Le Corsi est plus prédictif que le score sur le long terme
   */
  static calculateCorsiWinProbability(
    homeCorsiPct: number,
    awayCorsiPct: number
  ): number {
    // Différence de possession normalisée
    const corsiDiff = (homeCorsiPct - awayCorsiPct) / 100;
    
    // Formule empirique: chaque % de Corsi = ~0.4% de win probability
    return 0.5 + corsiDiff * 0.4;
  }
  
  /**
   * Calcule les Expected Goals ajustés
   * Intègre PDO (régression vers la moyenne)
   */
  static calculateExpectedGoals(
    teamStats: NHLTeamStats,
    opponentStats: NHLTeamStats,
    isHome: boolean
  ): number {
    // Base: xG de l'équipe
    let xG = teamStats.xGForPerGame;
    
    // Ajustement vs défense adverse
    const defenseFactor = opponentStats.xGAgainstPerGame / NHL_AVERAGES.goalsPerGame;
    xG *= defenseFactor;
    
    // Ajustement PDO (régression vers la moyenne)
    const teamPDO = teamStats.pdo / 1000; // Normaliser autour de 1
    const regressedPDO = teamPDO * (1 - PDO_REGRESSION) + 1 * PDO_REGRESSION;
    xG *= regressedPDO;
    
    // Avantage domicile (+5% environ)
    if (isHome) {
      xG *= (1 + NHL_AVERAGES.homeGoalBoost);
    } else {
      xG *= (1 - NHL_AVERAGES.homeGoalBoost * 0.5);
    }
    
    return Math.max(0.5, Math.min(6.0, xG));
  }
  
  /**
   * Évalue l'impact du gardien sur la prédiction
   * Le gardien = ~50% du résultat en NHL
   */
  static calculateGoalieEdge(
    homeGoalie: NHLGoalieStats,
    awayGoalie: NHLGoalieStats
  ): { edge: number; factor: number } {
    // Différence de save percentage
    const svPctDiff = homeGoalie.savePct - awayGoalie.savePct;
    
    // Impact: chaque .010 de sv% = ~5% de win probability
    const edge = svPctDiff * 5;
    
    // Facteur de confiance basé sur le temps de jeu
    const homeConfidence = Math.min(1, homeGoalie.gamesPlayed / 30);
    const awayConfidence = Math.min(1, awayGoalie.gamesPlayed / 30);
    const avgConfidence = (homeConfidence + awayConfidence) / 2;
    
    // Pénalité si gardien auxiliaire
    const starterBonus = (homeGoalie.isStarter ? 0.05 : -0.05) - 
                         (awayGoalie.isStarter ? 0.05 : -0.05);
    
    return {
      edge: edge + starterBonus,
      factor: avgConfidence * FACTOR_WEIGHTS.goalie
    };
  }
  
  /**
   * Calcule l'impact de la fatigue (Back-to-back, charge calendrier)
   */
  static calculateFatigueEdge(
    homeTeam: NHLTeamStats,
    awayTeam: NHLTeamStats
  ): number {
    let edge = 0;
    
    // Back-to-back = -5% à -8% de win probability
    if (awayTeam.isBackToBack && !homeTeam.isBackToBack) {
      edge += 0.08; // Avantage domicile
    } else if (homeTeam.isBackToBack && !awayTeam.isBackToBack) {
      edge -= 0.08; // Désavantage domicile
    }
    
    // Charge du calendrier (matchs en 7 jours)
    const gamesDiff = awayTeam.gamesInLast7Days - homeTeam.gamesInLast7Days;
    edge += gamesDiff * 0.02; // 2% par match supplémentaire
    
    // Jours de repos
    const restDiff = homeTeam.daysSinceLastGame - awayTeam.daysSinceLastGame;
    if (restDiff > 0) {
      edge += Math.min(0.05, restDiff * 0.01);
    } else {
      edge += Math.max(-0.05, restDiff * 0.01);
    }
    
    return edge;
  }
  
  /**
   * Calcule l'avantage des Special Teams (PP%, PK%)
   */
  static calculateSpecialTeamsEdge(
    homeTeam: NHLTeamStats,
    awayTeam: NHLTeamStats
  ): number {
    // Power Play: capacité à scorer en avantage
    const ppEdge = (homeTeam.powerPlayPct - awayTeam.powerPlayPct) / 100;
    
    // Penalty Kill: capacité à défendre en infériorité
    const pkEdge = (homeTeam.penaltyKillPct - awayTeam.penaltyKillPct) / 100;
    
    // Combinaison pondérée
    return (ppEdge * 0.6 + pkEdge * 0.4) * 0.5;
  }
  
  /**
   * Ajuste pour les blessés (impact sur la prédiction)
   */
  static calculateInjuryImpact(
    injuries: NHLTeamStats['injuredPlayers']
  ): number {
    let impact = 0;
    
    for (const player of injuries) {
      switch (player.position) {
        case 'G':
          // Gardien blessé = impact majeur
          impact += player.impact === 'high' ? 0.12 : 0.06;
          break;
        case 'D':
          // Défenseur clé = impact modéré
          impact += player.impact === 'high' ? 0.04 : 0.02;
          break;
        default:
          // Attaquant = impact variable selon importance
          impact += player.impact === 'high' ? 0.03 : 0.01;
      }
    }
    
    return Math.min(0.2, impact); // Cap à 20%
  }
  
  /**
   * Prédiction Poisson pour les scores NHL
   * P(k;λ) = (λ^k * e^-λ) / k!
   */
  private static poissonProbability(k: number, lambda: number): number {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    
    let factorial = 1;
    for (let i = 2; i <= k; i++) factorial *= i;
    
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
  }
  
  /**
   * Génère la matrice des probabilités de scores
   */
  static generateScoreMatrix(
    lambdaHome: number,
    lambdaAway: number,
    maxGoals: number = 8
  ): { matrix: number[][]; scores: { score: string; prob: number }[] } {
    const matrix: number[][] = [];
    const scores: { score: string; prob: number }[] = [];
    
    for (let h = 0; h <= maxGoals; h++) {
      matrix[h] = [];
      
      for (let a = 0; a <= maxGoals; a++) {
        const pHome = this.poissonProbability(h, lambdaHome);
        const pAway = this.poissonProbability(a, lambdaAway);
        const prob = pHome * pAway;
        
        matrix[h][a] = prob;
        scores.push({ score: `${h}-${a}`, prob });
      }
    }
    
    // Trier par probabilité décroissante
    scores.sort((a, b) => b.prob - a.prob);
    
    return { matrix, scores: scores.slice(0, 10) };
  }
  
  /**
   * Prédiction complète d'un match NHL
   */
  static predictMatch(
    match: NHLMatchData,
    homeTeamStats: NHLTeamStats,
    awayTeamStats: NHLTeamStats,
    homeGoalie: NHLGoalieStats,
    awayGoalie: NHLGoalieStats
  ): NHLPrediction {
    // 1. Expected Goals de base
    const xGHome = this.calculateExpectedGoals(homeTeamStats, awayTeamStats, true);
    const xGAway = this.calculateExpectedGoals(awayTeamStats, homeTeamStats, false);
    
    // 2. Ajustement gardien
    const goalieEdge = this.calculateGoalieEdge(homeGoalie, awayGoalie);
    const goalieAdjustedXGHome = xGHome * (1 - (awayGoalie.savePct - NHL_AVERAGES.avgSavePct) * 2);
    const goalieAdjustedXGAway = xGAway * (1 - (homeGoalie.savePct - NHL_AVERAGES.avgSavePct) * 2);
    
    // 3. Calculer tous les edges
    const corsiEdge = this.calculateCorsiWinProbability(
      homeTeamStats.corsiForPct,
      awayTeamStats.corsiForPct
    ) - 0.5;
    
    const xGEdge = (xGHome - xGAway) / NHL_AVERAGES.goalsPerGame * 0.15;
    
    const fatigueEdge = this.calculateFatigueEdge(homeTeamStats, awayTeamStats);
    
    const specialTeamsEdge = this.calculateSpecialTeamsEdge(homeTeamStats, awayTeamStats);
    
    const injuryImpactHome = this.calculateInjuryImpact(homeTeamStats.injuredPlayers);
    const injuryImpactAway = this.calculateInjuryImpact(awayTeamStats.injuredPlayers);
    const injuryEdge = (injuryImpactAway - injuryImpactHome) / 2;
    
    // 4. Combiner les facteurs (somme pondérée)
    const combinedEdge = 
      corsiEdge * FACTOR_WEIGHTS.corsi +
      xGEdge * FACTOR_WEIGHTS.xG +
      goalieEdge.edge * FACTOR_WEIGHTS.goalie +
      fatigueEdge * FACTOR_WEIGHTS.fatigue +
      specialTeamsEdge * FACTOR_WEIGHTS.specialTeams +
      injuryEdge * FACTOR_WEIGHTS.injuries +
      NHL_AVERAGES.homeGoalBoost * FACTOR_WEIGHTS.homeIce;
    
    // 5. Probabilités finales
    const baseHomeWin = 0.5 + combinedEdge;
    const homeWin = Math.max(0.25, Math.min(0.75, baseHomeWin));
    const awayWin = 1 - homeWin;
    
    // 6. Matrice des scores
    const { matrix, scores } = this.generateScoreMatrix(
      Math.max(1.5, goalieAdjustedXGHome),
      Math.max(1.5, goalieAdjustedXGAway)
    );
    
    // 7. Over/Under
    let overProb = 0;
    const totalLine = match.totalLine || 6.0;
    
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        if (h + a > totalLine) {
          overProb += matrix[h][a];
        }
      }
    }
    
    // 8. Puck Line (-1.5)
    let puckLineHomeProb = 0;
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        if (h - a >= 2) { // Gagne par 2+
          puckLineHomeProb += matrix[h][a];
        }
      }
    }
    
    // 9. Value Bet detection
    const impliedHome = 1 / match.oddsHome;
    const impliedAway = 1 / match.oddsAway;
    const edgeHome = homeWin - impliedHome;
    const edgeAway = awayWin - impliedAway;
    
    let valueBet: NHLPrediction['valueBet'] | undefined;
    
    if (edgeHome > 0.05) {
      valueBet = { type: 'moneyline', pick: match.homeTeam, edge: edgeHome };
    } else if (edgeAway > 0.05) {
      valueBet = { type: 'moneyline', pick: match.awayTeam, edge: edgeAway };
    }
    
    // 10. Kelly Criterion
    const kellyFraction = valueBet 
      ? Math.max(0, (valueBet.edge * 100) / (match.oddsHome - 1)) 
      : 0;
    
    // 11. Confiance
    const confidence = this.calculateConfidence(
      homeTeamStats,
      awayTeamStats,
      homeGoalie,
      awayGoalie
    );
    
    return {
      homeWin: Math.round(homeWin * 1000) / 1000,
      awayWin: Math.round(awayWin * 1000) / 1000,
      expectedHomeGoals: Math.round(goalieAdjustedXGHome * 10) / 10,
      expectedAwayGoals: Math.round(goalieAdjustedXGAway * 10) / 10,
      mostLikelyScores: scores.slice(0, 5),
      overUnder: {
        total: totalLine,
        overProb: Math.round(overProb * 1000) / 1000,
        underProb: Math.round((1 - overProb) * 1000) / 1000,
        recommendation: overProb > 0.55 ? 'over' : overProb < 0.45 ? 'under' : 'pass'
      },
      puckLine: {
        homeProb: Math.round(puckLineHomeProb * 1000) / 1000,
        awayProb: Math.round((1 - puckLineHomeProb) * 1000) / 1000,
        recommendation: puckLineHomeProb > 0.55 ? 'home' : puckLineHomeProb < 0.45 ? 'away' : 'pass'
      },
      keyFactors: {
        corsiEdge: Math.round(corsiEdge * 1000) / 1000,
        xGEdge: Math.round(xGEdge * 1000) / 1000,
        goalieEdge: Math.round(goalieEdge.edge * 1000) / 1000,
        fatigueEdge: Math.round(fatigueEdge * 1000) / 1000,
        specialTeamsEdge: Math.round(specialTeamsEdge * 1000) / 1000
      },
      confidence,
      valueBet,
      kellyFraction: Math.round(kellyFraction * 100) / 100
    };
  }
  
  /**
   * Calcule le niveau de confiance de la prédiction
   */
  private static calculateConfidence(
    homeTeam: NHLTeamStats,
    awayTeam: NHLTeamStats,
    homeGoalie: NHLGoalieStats,
    awayGoalie: NHLGoalieStats
  ): number {
    let confidence = 50; // Base
    
    // Plus de données = plus de confiance
    const homeDataQuality = Math.min(10, homeTeam.last5Results.length) / 10;
    const awayDataQuality = Math.min(10, awayTeam.last5Results.length) / 10;
    confidence += (homeDataQuality + awayDataQuality) * 10;
    
    // Gardien titulaire confirmé
    if (homeGoalie.isStarter && homeGoalie.gamesPlayed > 20) confidence += 5;
    if (awayGoalie.isStarter && awayGoalie.gamesPlayed > 20) confidence += 5;
    
    // Écart de talent clair
    const standingsDiff = Math.abs(
      homeTeam.standing.points - awayTeam.standing.points
    ) / homeTeam.standing.gamesPlayed;
    if (standingsDiff > 0.3) confidence += 10;
    
    return Math.min(95, Math.max(40, Math.round(confidence)));
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Calcule le Kelly Criterion fractionnaire
 */
export function kellyCriterion(
  probability: number,
  odds: number,
  fraction: number = 0.25 // Kelly fractionnaire (25% du Kelly complet)
): number {
  const kelly = (probability * odds - 1) / (odds - 1);
  return Math.max(0, kelly * fraction);
}

/**
 * Détecte les value bets NHL
 */
export function detectNHLValueBet(
  prediction: NHLPrediction,
  oddsHome: number,
  oddsAway: number,
  minEdge: number = 0.05
): { detected: boolean; pick: string; edge: number } | null {
  const impliedHome = 1 / oddsHome;
  const impliedAway = 1 / oddsAway;
  
  const edgeHome = prediction.homeWin - impliedHome;
  const edgeAway = prediction.awayWin - impliedAway;
  
  if (edgeHome > minEdge && edgeHome > edgeAway) {
    return { detected: true, pick: 'home', edge: edgeHome };
  }
  
  if (edgeAway > minEdge && edgeAway > edgeHome) {
    return { detected: true, pick: 'away', edge: edgeAway };
  }
  
  return null;
}

// ===== EXPORT =====

const NHLService = {
  NHLEngine,
  kellyCriterion,
  detectNHLValueBet,
  NHL_AVERAGES,
  FACTOR_WEIGHTS
};

export default NHLService;
