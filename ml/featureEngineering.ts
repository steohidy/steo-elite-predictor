/**
 * Feature Engineering pour le ML de prédiction sportive
 * 
 * Ce module transforme les données brutes en features exploitables par le modèle.
 * Il est conçu pour être utilisé:
 * - En LOCAL pour l'entraînement
 * - Sur VERCEL pour l'inférence (lecture seule)
 */

// ===== INTERFACES =====

export interface TeamStats {
  teamId: string;
  teamName: string;
  
  // Forme récente (5 derniers matchs)
  last5Matches: {
    goalsScored: number[];
    goalsConceded: number[];
    results: ('W' | 'D' | 'L')[]; // Win/Draw/Loss
    xG: number[]; // Expected Goals
    shots: number[];
    possession: number[];
  };
  
  // Moyennes
  avgGoalsScored: number;
  avgGoalsConceded: number;
  avgXG: number;
  avgShots: number;
  avgPossession: number;
  
  // Stats saison
  seasonStats: {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
    position?: number;
  };
  
  // Facteurs contextuels
  homeAdvantage: number; // Boost performance à domicile (0-1)
  daysSinceLastMatch: number; // Fatigue
  isInjuryCrisis: boolean; // Blessés clés
  motivation: 'high' | 'medium' | 'low'; // Enjeu
}

export interface MatchFeatures {
  // Identifiants
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  
  // Features de base (issues des cotes)
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  impliedProbHome: number;
  impliedProbDraw: number;
  impliedProbAway: number;
  
  // Features calculées - Équipe domicile
  homeAvgGoalsScored: number;
  homeAvgGoalsConceded: number;
  homeForm: number; // 0-1 (pourcentage de points sur 5 matchs)
  homeXG: number;
  homeShots: number;
  homePossession: number;
  homeSeasonPoints: number;
  homeSeasonPosition: number;
  
  // Features calculées - Équipe extérieur
  awayAvgGoalsScored: number;
  awayAvgGoalsConceded: number;
  awayForm: number;
  awayXG: number;
  awayShots: number;
  awayPossession: number;
  awaySeasonPoints: number;
  awaySeasonPosition: number;
  
  // Features contextuelles
  homeAdvantage: number; // Différence de performance domicile/extérieur
  fatigueDiff: number; // Différence de repos (jours)
  motivationDiff: number; // Différence d'enjeu (-1, 0, 1)
  isDerby: boolean; // Match spécial
  weather?: string;
  
  // Features avancées
  h2h_homeWins: number; // Historique tête-à-tête
  h2h_draws: number;
  h2h_awayWins: number;
  h2h_avgGoals: number;
  
  // Features dérivées
  oddsDisparity: number; // |oddsHome - oddsAway|
  formDiff: number; // homeForm - awayForm
  goalsDiff: number; // (homeAvgGoalsScored - awayAvgGoalsScored) - (homeAvgGoalsConceded - awayAvgGoalsConceded)
  positionDiff: number; // awaySeasonPosition - homeSeasonPosition (positif = home favori logique)
}

export interface MatchLabel {
  result: 'home' | 'draw' | 'away';
  homeGoals: number;
  awayGoals: number;
  totalGoals: number;
  bothTeamsScored: boolean;
}

// ===== FONCTIONS DE CALCUL =====

/**
 * Calcule la forme d'une équipe sur les 5 derniers matchs
 * Retourne un pourcentage de points (0-1)
 */
export function calculateForm(last5Results: ('W' | 'D' | 'L')[]): number {
  if (last5Results.length === 0) return 0.5; // Neutre si pas de données
  
  const points = last5Results.reduce((acc, result) => {
    switch (result) {
      case 'W': return acc + 3;
      case 'D': return acc + 1;
      case 'L': return acc + 0;
    }
  }, 0);
  
  const maxPoints = last5Results.length * 3;
  return points / maxPoints;
}

/**
 * Calcule l'avantage domicile basé sur les stats historiques
 */
export function calculateHomeAdvantage(
  homeMatches: { goalsScored: number; goalsConceded: number; result: string }[],
  awayMatches: { goalsScored: number; goalsConceded: number; result: string }[]
): number {
  if (homeMatches.length === 0 || awayMatches.length === 0) return 0.15; // Valeur par défaut
  
  // Performance à domicile vs extérieur
  const homeWinRate = homeMatches.filter(m => m.result === 'W').length / homeMatches.length;
  const awayWinRate = awayMatches.filter(m => m.result === 'W').length / awayMatches.length;
  
  // L'avantage domicile est la différence de performance
  return Math.max(0, Math.min(0.5, homeWinRate - awayWinRate + 0.1));
}

/**
 * Évalue la motivation/enjeu d'une équipe
 */
export function evaluateMotivation(
  position: number,
  totalTeams: number,
  points: number,
  matchesLeft: number,
  targetPosition: number
): 'high' | 'medium' | 'low' {
  // Zone de titre/qualifications européennes (top 4-6 selon ligue)
  if (position <= targetPosition) {
    return 'high';
  }
  
  // Zone de relégation (derniers 3-5)
  if (position >= totalTeams - 4) {
    return 'high';
  }
  
  // Milieu de classement, matchs sans enjeu
  if (matchesLeft < 5 && position > targetPosition + 2 && position < totalTeams - 5) {
    return 'low';
  }
  
  return 'medium';
}

/**
 * Convertit la motivation en valeur numérique
 */
export function motivationToNumber(motivation: 'high' | 'medium' | 'low'): number {
  switch (motivation) {
    case 'high': return 1;
    case 'medium': return 0.5;
    case 'low': return 0;
  }
}

/**
 * Calcule les probabilités implicites depuis les cotes
 */
export function calculateImpliedProbabilities(
  oddsHome: number,
  oddsDraw: number,
  oddsAway: number
): { home: number; draw: number; away: number; margin: number } {
  const rawHome = 1 / oddsHome;
  const rawDraw = 1 / oddsDraw;
  const rawAway = 1 / oddsAway;
  
  const total = rawHome + rawDraw + rawAway;
  const margin = total - 1; // Marge du bookmaker
  
  return {
    home: rawHome / total,
    draw: rawDraw / total,
    away: rawAway / total,
    margin
  };
}

/**
 * Génère les features complètes pour un match
 */
export function generateMatchFeatures(
  matchData: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    date: string;
    oddsHome: number;
    oddsDraw: number;
    oddsAway: number;
  },
  homeTeamStats: TeamStats,
  awayTeamStats: TeamStats,
  h2hData?: { homeWins: number; draws: number; awayWins: number; avgGoals: number }
): MatchFeatures {
  const implied = calculateImpliedProbabilities(
    matchData.oddsHome,
    matchData.oddsDraw,
    matchData.oddsAway
  );
  
  const homeForm = calculateForm(homeTeamStats.last5Matches.results);
  const awayForm = calculateForm(awayTeamStats.last5Matches.results);
  
  return {
    matchId: matchData.id,
    homeTeam: matchData.homeTeam,
    awayTeam: matchData.awayTeam,
    league: matchData.league,
    date: matchData.date,
    
    // Cotes
    oddsHome: matchData.oddsHome,
    oddsDraw: matchData.oddsDraw,
    oddsAway: matchData.oddsAway,
    impliedProbHome: implied.home,
    impliedProbDraw: implied.draw,
    impliedProbAway: implied.away,
    
    // Stats domicile
    homeAvgGoalsScored: homeTeamStats.avgGoalsScored,
    homeAvgGoalsConceded: homeTeamStats.avgGoalsConceded,
    homeForm,
    homeXG: homeTeamStats.avgXG,
    homeShots: homeTeamStats.avgShots,
    homePossession: homeTeamStats.avgPossession,
    homeSeasonPoints: homeTeamStats.seasonStats.points,
    homeSeasonPosition: homeTeamStats.seasonStats.position || 10,
    
    // Stats extérieur
    awayAvgGoalsScored: awayTeamStats.avgGoalsScored,
    awayAvgGoalsConceded: awayTeamStats.avgGoalsConceded,
    awayForm,
    awayXG: awayTeamStats.avgXG,
    awayShots: awayTeamStats.avgShots,
    awayPossession: awayTeamStats.avgPossession,
    awaySeasonPoints: awayTeamStats.seasonStats.points,
    awaySeasonPosition: awayTeamStats.seasonStats.position || 10,
    
    // Contexte
    homeAdvantage: homeTeamStats.homeAdvantage,
    fatigueDiff: awayTeamStats.daysSinceLastMatch - homeTeamStats.daysSinceLastMatch,
    motivationDiff: motivationToNumber(homeTeamStats.motivation) - motivationToNumber(awayTeamStats.motivation),
    isDerby: false, // À déterminer via une liste de derbys
    
    // H2H
    h2h_homeWins: h2hData?.homeWins || 0,
    h2h_draws: h2hData?.draws || 0,
    h2h_awayWins: h2hData?.awayWins || 0,
    h2h_avgGoals: h2hData?.avgGoals || 2.5,
    
    // Dérivées
    oddsDisparity: Math.abs(matchData.oddsHome - matchData.oddsAway),
    formDiff: homeForm - awayForm,
    goalsDiff: (homeTeamStats.avgGoalsScored - awayTeamStats.avgGoalsScored) -
               (homeTeamStats.avgGoalsConceded - awayTeamStats.avgGoalsConceded),
    positionDiff: awayTeamStats.seasonStats.position - homeTeamStats.seasonStats.position || 0
  };
}

/**
 * Normalise les features pour le modèle ML (0-1)
 */
export function normalizeFeatures(features: MatchFeatures): number[] {
  return [
    // Cotes normalisées (inverse pour avoir proba)
    1 / features.oddsHome / 3, // Max ~3
    1 / features.oddsDraw / 5, // Max ~5
    1 / features.oddsAway / 3,
    
    // Probabilités implicites (déjà 0-1)
    features.impliedProbHome,
    features.impliedProbDraw,
    features.impliedProbAway,
    
    // Stats domicile (normalisées)
    features.homeAvgGoalsScored / 4, // Max ~4 buts/match
    features.homeAvgGoalsConceded / 4,
    features.homeForm, // Déjà 0-1
    features.homeXG / 3,
    features.homeShots / 20,
    features.homePossession / 100,
    features.homeSeasonPoints / 100,
    1 - (features.homeSeasonPosition / 20), // Inversé (1 = meilleur)
    
    // Stats extérieur
    features.awayAvgGoalsScored / 4,
    features.awayAvgGoalsConceded / 4,
    features.awayForm,
    features.awayXG / 3,
    features.awayShots / 20,
    features.awayPossession / 100,
    features.awaySeasonPoints / 100,
    1 - (features.awaySeasonPosition / 20),
    
    // Contexte
    features.homeAdvantage,
    (features.fatigueDiff + 7) / 14, // Normaliser autour de 0
    (features.motivationDiff + 1) / 2, // -1,0,1 -> 0,0.5,1
    features.isDerby ? 1 : 0,
    
    // H2H
    features.h2h_homeWins / 10,
    features.h2h_draws / 10,
    features.h2h_awayWins / 10,
    features.h2h_avgGoals / 6,
    
    // Dérivées
    features.oddsDisparity / 10,
    (features.formDiff + 1) / 2, // -1 à 1 -> 0 à 1
    (features.goalsDiff + 4) / 8, // Normaliser
    (features.positionDiff + 20) / 40
  ];
}

// Exporter les noms des features pour interprétabilité
export const FEATURE_NAMES = [
  'oddsHome_inv', 'oddsDraw_inv', 'oddsAway_inv',
  'impliedProbHome', 'impliedProbDraw', 'impliedProbAway',
  'homeAvgGoalsScored', 'homeAvgGoalsConceded', 'homeForm', 'homeXG', 'homeShots', 'homePossession', 'homeSeasonPoints', 'homeSeasonPosition',
  'awayAvgGoalsScored', 'awayAvgGoalsConceded', 'awayForm', 'awayXG', 'awayShots', 'awayPossession', 'awaySeasonPoints', 'awaySeasonPosition',
  'homeAdvantage', 'fatigueDiff', 'motivationDiff', 'isDerby',
  'h2h_homeWins', 'h2h_draws', 'h2h_awayWins', 'h2h_avgGoals',
  'oddsDisparity', 'formDiff', 'goalsDiff', 'positionDiff'
];
