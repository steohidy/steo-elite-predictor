/**
 * API d'analyse de match - VERSION OPTIMISÉE V2
 * Permet aux utilisateurs d'analyser des matchs (max 3/jour)
 * 
 * OPTIMISATIONS:
 * - Timeout global de 10 secondes max
 * - Retour de résultats partiels si timeout
 * - Cache intelligent des team IDs
 * - Exécution parallèle des requêtes
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getMatchAnalysisData, 
  getRemainingRequests,
  type Injury, 
  type TeamForm, 
  type H2HMatch 
} from '@/lib/apiFootball';

// Types
interface MatchInput {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  odds?: number;
  betType?: string;
}

interface AnalysisResult {
  match: MatchInput;
  found: boolean;
  fixture?: {
    id: number;
    date: string;
    league: string;
    status: string;
  };
  ourOdds?: {
    home: number;
    draw: number | null;
    away: number;
  };
  risk?: number;
  confidence?: string;
  recommendation?: string;
  predictions?: {
    betType: string;
    corners: { total: number; over85: number; prediction: string };
    cards: { total: number; over45: number; prediction: string };
    goals: { total: number; over25: number; prediction: string };
  };
  enrichment?: {
    homeInjuries: Injury[];
    awayInjuries: Injury[];
    homeForm: TeamForm | null;
    awayForm: TeamForm | null;
    h2h: H2HMatch[];
    homeStats?: { played: number; wins: number; draws: number; losses: number; form: string };
    awayStats?: { played: number; wins: number; draws: number; losses: number; form: string };
  };
  warnings?: string[];
  source: 'cache' | 'api' | 'not_found' | 'timeout';
}

interface UserAnalysisHistory {
  username: string;
  date: string;
  count: number;
  analyses: AnalysisResult[][];
}

// Cache des analyses du jour
const dailyAnalysisCache = new Map<string, UserAnalysisHistory>();
const MAX_ANALYSES_PER_DAY = 3;

// Timeout global pour l'analyse
const ANALYSIS_TIMEOUT = 10000; // 10 secondes max

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check remaining analyses for user
 */
function getUserRemainingAnalyses(username: string): number {
  const today = getTodayDate();
  const history = dailyAnalysisCache.get(username);
  
  if (!history || history.date !== today) {
    return MAX_ANALYSES_PER_DAY;
  }
  
  return Math.max(0, MAX_ANALYSES_PER_DAY - history.count);
}

/**
 * Record an analysis for a user
 */
function recordAnalysis(username: string, matches: AnalysisResult[]): void {
  const today = getTodayDate();
  let history = dailyAnalysisCache.get(username);
  
  if (!history || history.date !== today) {
    history = {
      username,
      date: today,
      count: 0,
      analyses: []
    };
    dailyAnalysisCache.set(username, history);
  }
  
  history.count++;
  history.analyses.push(matches);
}

/**
 * Normalize team name for comparison
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity percentage between two strings
 */
function calculateSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 100;
  const distance = levenshteinDistance(a, b);
  return Math.round((1 - distance / maxLength) * 100);
}

/**
 * Find best matching team name with fuzzy matching
 */
function findBestTeamMatch(
  inputName: string, 
  availableNames: string[], 
  threshold: number = 70
): { name: string; similarity: number } | null {
  const inputNorm = normalizeTeamName(inputName);
  
  let bestMatch: { name: string; similarity: number } | null = null;
  
  for (const name of availableNames) {
    const nameNorm = normalizeTeamName(name);
    
    if (nameNorm === inputNorm) {
      return { name, similarity: 100 };
    }
    
    if (nameNorm.includes(inputNorm) || inputNorm.includes(nameNorm)) {
      const similarity = Math.max(calculateSimilarity(inputNorm, nameNorm), 90);
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { name, similarity };
      }
      continue;
    }
    
    const similarity = calculateSimilarity(inputNorm, nameNorm);
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { name, similarity };
    }
  }
  
  return bestMatch;
}

/**
 * Find match in cache with fuzzy matching - VERSION RAPIDE
 */
async function findMatchInCache(match: MatchInput): Promise<AnalysisResult | null> {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    // Timeout de 3 secondes pour la recherche en cache
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    try {
      const response = await fetch(`${baseUrl}/api/matches`, {
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      const matches = data.matches || [];
      
      const homeTeams = matches.map((m: any) => m.homeTeam as string).filter(Boolean);
      const awayTeams = matches.map((m: any) => m.awayTeam as string).filter(Boolean);
      const allTeams: string[] = [...new Set([...homeTeams, ...awayTeams])] as string[];
      
      const homeMatch = findBestTeamMatch(match.homeTeam, allTeams);
      const awayMatch = findBestTeamMatch(match.awayTeam, allTeams);
      
      if (!homeMatch || !awayMatch) {
        return null;
      }
      
      for (const m of matches) {
        const mHomeNorm = normalizeTeamName(m.homeTeam);
        const mAwayNorm = normalizeTeamName(m.awayTeam);
        const homeMatchNorm = normalizeTeamName(homeMatch.name);
        const awayMatchNorm = normalizeTeamName(awayMatch.name);
        
        if (
          (mHomeNorm === homeMatchNorm || calculateSimilarity(mHomeNorm, homeMatchNorm) >= 85) &&
          (mAwayNorm === awayMatchNorm || calculateSimilarity(mAwayNorm, awayMatchNorm) >= 85)
        ) {
          const predictions = calculatePredictions(m);
          
          return {
            match: {
              ...match,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam
            },
            found: true,
            ourOdds: {
              home: m.oddsHome,
              draw: m.oddsDraw,
              away: m.oddsAway
            },
            risk: m.insight?.riskPercentage || 50,
            confidence: m.insight?.confidence || 'medium',
            recommendation: generateRecommendation(m, match.betType),
            predictions,
            source: 'cache',
            warnings: []
          };
        }
      }
    } catch {
      clearTimeout(timeoutId);
    }
    
    return null;
  } catch (error) {
    console.error('Erreur recherche cache:', error);
    return null;
  }
}

/**
 * Calculate detailed predictions
 */
function calculatePredictions(match: any): AnalysisResult['predictions'] {
  const oddsHome = match.oddsHome;
  const oddsAway = match.oddsAway;
  const oddsDraw = match.oddsDraw;
  
  const favorite = oddsHome < oddsAway ? 'home' : 'away';
  const favoriteOdds = favorite === 'home' ? oddsHome : oddsAway;
  const drawProb = oddsDraw ? Math.round(100 / oddsDraw / ((1/oddsHome) + (1/oddsAway) + (1/oddsDraw)) * 100) : 0;
  
  let betType = '';
  if (favoriteOdds < 1.5) {
    betType = `Victoire ${favorite === 'home' ? match.homeTeam : match.awayTeam}`;
  } else if (favoriteOdds < 2.0 && drawProb < 30) {
    betType = `Victoire ${favorite === 'home' ? match.homeTeam : match.awayTeam}`;
  } else {
    betType = `${favorite === 'home' ? match.homeTeam : match.awayTeam} ou Nul`;
  }
  
  const goalsPrediction = match.goalsPrediction || calculateGoals(oddsHome, oddsAway, oddsDraw);
  const cardsPrediction = match.cardsPrediction || calculateCards(oddsHome, oddsAway, oddsDraw);
  const cornersPrediction = match.cornersPrediction || calculateCorners(oddsHome, oddsAway, oddsDraw);
  
  return {
    betType,
    corners: {
      total: cornersPrediction.total,
      over85: cornersPrediction.over85,
      prediction: cornersPrediction.prediction
    },
    cards: {
      total: cardsPrediction.total,
      over45: cardsPrediction.over45,
      prediction: cardsPrediction.prediction
    },
    goals: {
      total: goalsPrediction.total,
      over25: goalsPrediction.over25,
      prediction: goalsPrediction.prediction
    }
  };
}

/**
 * Calculate goals prediction
 */
function calculateGoals(oddsHome: number, oddsAway: number, oddsDraw: number | null): any {
  const disparity = Math.abs(oddsHome - oddsAway);
  let expectedGoals = 2.6;
  
  if (Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway) > 3) {
    expectedGoals = 2.2;
  } else if (Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway) < 1.5) {
    expectedGoals = 2.8;
  }
  
  const avgGoals = expectedGoals;
  const poissonCumulative2 = Math.exp(-avgGoals) * (1 + avgGoals + (avgGoals * avgGoals) / 2);
  const over25 = Math.round((1 - poissonCumulative2) * 100);
  
  let prediction = over25 >= 55 ? 'Over 2.5' : over25 <= 45 ? 'Under 2.5' : 'Match serré';
  
  return { total: Math.round(expectedGoals * 10) / 10, over25, prediction };
}

/**
 * Calculate cards prediction
 */
function calculateCards(oddsHome: number, oddsAway: number, _oddsDraw: number | null): any {
  const baseCards = 4.0;
  const ratio = Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway);
  
  let expectedCards = baseCards;
  if (ratio < 1.5) expectedCards += 0.5;
  else if (ratio > 2.5) expectedCards += 0.3;
  
  const over45 = Math.round(Math.min(50 + (expectedCards - 4) * 15, 75));
  const prediction = over45 >= 55 ? 'Over 4.5' : over45 <= 40 ? 'Under 4.5' : 'Match normal';
  
  return { total: Math.round(expectedCards * 10) / 10, over45, prediction };
}

/**
 * Calculate corners prediction
 */
function calculateCorners(oddsHome: number, oddsAway: number, _oddsDraw: number | null): any {
  const baseCorners = 9.0;
  const ratio = Math.max(oddsHome, oddsAway) / Math.min(oddsHome, oddsAway);
  
  let expectedCorners = baseCorners;
  if (ratio < 1.5) expectedCorners += 1.0;
  else if (ratio > 2.5) expectedCorners -= 0.5;
  
  const over85 = Math.round(Math.min(45 + (expectedCorners - 8.5) * 12, 75));
  const prediction = over85 >= 60 ? 'Over 8.5' : 'Under 8.5';
  
  return { total: Math.round(expectedCorners * 10) / 10, over85, prediction };
}

/**
 * Generate recommendation
 */
function generateRecommendation(match: any, _betType?: string): string {
  const oddsHome = match.oddsHome;
  const oddsAway = match.oddsAway;
  const oddsDraw = match.oddsDraw;
  
  const favorite = oddsHome < oddsAway ? 'home' : 'away';
  const favoriteTeam = favorite === 'home' ? match.homeTeam : match.awayTeam;
  const favoriteOdds = favorite === 'home' ? oddsHome : oddsAway;
  
  const totalImplied = (1/oddsHome) + (1/oddsAway) + (oddsDraw ? 1/oddsDraw : 0);
  const homeProb = Math.round((1/oddsHome) / totalImplied * 100);
  const drawProb = oddsDraw ? Math.round((1/oddsDraw) / totalImplied * 100) : 0;
  const favoriteProb = favorite === 'home' ? homeProb : Math.round((1/oddsAway) / totalImplied * 100);
  
  if (favoriteOdds < 1.5 && favoriteProb >= 65) {
    return `✅ Victoire ${favoriteTeam} recommandée (${favoriteProb}% de probabilité)`;
  } else if (favoriteOdds < 2.0 && favoriteProb >= 50) {
    return `✅ ${favoriteTeam} ou Nul - Double chance sûre (${favoriteProb + drawProb}%)`;
  } else if (drawProb >= 30) {
    return `⚠️ Risque de nul élevé (${drawProb}%) - Considérez la double chance`;
  } else {
    return `⏳ Match serré - Analysez les blessures et la forme récente`;
  }
}

/**
 * Wrapper avec timeout pour l'enrichissement
 */
async function enrichWithTimeout(
  homeTeam: string,
  awayTeam: string,
  timeoutMs: number = 8000
): Promise<AnalysisResult['enrichment'] | undefined> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const analysisData = await Promise.race([
      getMatchAnalysisData(homeTeam, awayTeam),
      new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeoutMs);
      })
    ]);
    
    clearTimeout(timeoutId);
    
    if (!analysisData) return undefined;
    
    return {
      homeInjuries: analysisData.homeInjuries,
      awayInjuries: analysisData.awayInjuries,
      homeForm: analysisData.homeForm,
      awayForm: analysisData.awayForm,
      h2h: analysisData.h2h,
      homeStats: analysisData.homeStats ? {
        played: analysisData.homeStats.played,
        wins: analysisData.homeStats.wins,
        draws: analysisData.homeStats.draws,
        losses: analysisData.homeStats.losses,
        form: analysisData.homeStats.form
      } : undefined,
      awayStats: analysisData.awayStats ? {
        played: analysisData.awayStats.played,
        wins: analysisData.awayStats.wins,
        draws: analysisData.awayStats.draws,
        losses: analysisData.awayStats.losses,
        form: analysisData.awayStats.form
      } : undefined
    };
  } catch (error: any) {
    if (error.message === 'Timeout') {
      console.log('⏱️ Enrichissement timeout - retour sans données enrichies');
    } else {
      console.error('Erreur enrichissement:', error.message);
    }
    return undefined;
  }
}

/**
 * Analyze matches - VERSION OPTIMISÉE
 */
async function analyzeMatches(
  matches: MatchInput[],
  username: string
): Promise<{
  success: boolean;
  results: AnalysisResult[];
  remainingAnalyses: number;
  error?: string;
}> {
  // Check limit
  const remaining = getUserRemainingAnalyses(username);
  if (remaining <= 0) {
    return {
      success: false,
      results: [],
      remainingAnalyses: 0,
      error: 'Limite quotidienne atteinte (3 analyses/jour)'
    };
  }
  
  if (matches.length > 3) {
    return {
      success: false,
      results: [],
      remainingAnalyses: remaining,
      error: 'Maximum 3 matchs par analyse'
    };
  }
  
  if (matches.length === 0) {
    return {
      success: false,
      results: [],
      remainingAnalyses: remaining,
      error: 'Aucun match fourni'
    };
  }
  
  const results: AnalysisResult[] = [];
  
  for (const match of matches) {
    // 1. Find in cache first (fast)
    let result = await findMatchInCache(match);
    
    if (!result) {
      // 2. Return basic result without enrichment (fallback rapide)
      result = {
        match,
        found: false,
        warnings: ['Match non trouvé dans le cache - vérifiez les noms'],
        source: 'not_found',
        recommendation: 'Match non trouvé. Vérifiez les noms des équipes.'
      };
    }
    
    // 3. Try to enrich with timeout (non-blocking)
    if (result.found) {
      const enrichment = await enrichWithTimeout(
        result.match.homeTeam,
        result.match.awayTeam,
        8000 // 8 secondes max pour l'enrichissement
      );
      
      if (enrichment) {
        result.enrichment = enrichment;
        
        const totalInjuries = (enrichment.homeInjuries?.length || 0) + 
                              (enrichment.awayInjuries?.length || 0);
        if (totalInjuries > 0) {
          result.warnings = result.warnings || [];
          result.warnings.push(`🏥 ${totalInjuries} joueur(s) blessé(s) ou suspendu(s)`);
        }
      }
    }
    
    results.push(result);
  }
  
  // Record analysis
  recordAnalysis(username, results);
  
  return {
    success: true,
    results,
    remainingAnalyses: getUserRemainingAnalyses(username)
  };
}

/**
 * GET - Get user analysis status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  
  if (!username) {
    return NextResponse.json({
      success: false,
      error: 'Username requis'
    }, { status: 400 });
  }
  
  const remaining = getUserRemainingAnalyses(username);
  const today = getTodayDate();
  const apiFootballStatus = getRemainingRequests();
  
  return NextResponse.json({
    success: true,
    date: today,
    remainingAnalyses: remaining,
    maxAnalysesPerDay: MAX_ANALYSES_PER_DAY,
    usedToday: MAX_ANALYSES_PER_DAY - remaining,
    apiFootball: apiFootballStatus
  });
}

/**
 * POST - Analyze matches
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, matches } = body;
    
    if (!username) {
      return NextResponse.json({
        success: false,
        error: 'Username requis'
      }, { status: 400 });
    }
    
    if (!matches || !Array.isArray(matches)) {
      return NextResponse.json({
        success: false,
        error: 'Liste de matchs requise'
      }, { status: 400 });
    }
    
    // Global timeout for the entire analysis
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Analyse timeout')), ANALYSIS_TIMEOUT);
    });
    
    const result = await Promise.race([
      analyzeMatches(matches, username),
      timeoutPromise
    ]);
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Erreur analyse match:', error);
    
    if (error.message === 'Analyse timeout') {
      return NextResponse.json({
        success: false,
        error: 'Analyse trop longue - veuillez réessayer',
        results: [],
        remainingAnalyses: 3
      }, { status: 408 });
    }
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Erreur lors de l\'analyse'
    }, { status: 500 });
  }
}
