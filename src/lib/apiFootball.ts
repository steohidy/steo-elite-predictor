/**
 * API-Football Integration - Version Optimisée V2
 * Free plan: 100 requests/day
 * Provides: Injuries, Suspensions, Team Form, H2H
 * 
 * OPTIMISATIONS:
 * - Cache global persistant des team IDs
 * - Timeouts pour éviter les blocages
 * - Requêtes parallèles avec Promise.allSettled
 * - Retour de résultats partiels en cas d'échec
 */

// Cache for API responses (1 hour TTL)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Rate limiting
let dailyRequests = 0;
let lastReset = new Date().toDateString();
const MAX_DAILY_REQUESTS = 100;

// Timeout constant
const API_TIMEOUT = 5000; // 5 secondes max par requête

interface Injury {
  player: string;
  team: string;
  type: 'injury' | 'suspension';
  reason: string;
  matchMissed: string;
}

interface TeamForm {
  team: string;
  form: string;
  last5: { result: string; score: string; opponent: string }[];
  goalsScored: number;
  goalsConceded: number;
  cleanSheets: number;
}

interface H2HMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition: string;
}

interface TeamStats {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: string;
}

/**
 * Team ID Cache - Pré-rempli avec les équipes populaires
 * Évite les appels API inutiles
 */
const TEAM_ID_CACHE: Record<string, number> = {
  // France - Ligue 1
  'psg': 85, 'paris': 85, 'parissaintgermain': 85,
  'marseille': 81, 'om': 81,
  'lyon': 80, 'ol': 80,
  'monaco': 91,
  'lille': 79,
  'nice': 84,
  'lens': 74,
  'rennes': 93,
  'montpellier': 83,
  'nantes': 86,
  'strasbourg': 95,
  'toulouse': 96,
  'bordeaux': 77,
  'saintetienne': 94, 'saintetienne': 94, 'asse': 94,
  
  // Angleterre - Premier League
  'mancity': 50, 'manchestercity': 50,
  'manutd': 33, 'manchesterunited': 33,
  'liverpool': 40,
  'chelsea': 49,
  'arsenal': 42,
  'tottenham': 47, 'spurs': 47,
  'newcastle': 34,
  'brighton': 51,
  'astonvilla': 66,
  'westham': 48,
  
  // Espagne - La Liga
  'real madrid': 541, 'realmadrid': 541,
  'barcelona': 529, 'barca': 529, 'barcelone': 529,
  'atletico': 530, 'atleticomadrid': 530,
  'sevilla': 536,
  'valencia': 532,
  'villareal': 533,
  'realbetis': 543,
  
  // Allemagne - Bundesliga
  'bayern': 157, 'bayernmunich': 157,
  'dortmund': 165, 'borussiadortmund': 165,
  'leipzig': 173, 'rbleipzig': 173,
  'leverkusen': 168,
  'wolfsburg': 161,
  'frankfurt': 169,
  
  // Italie - Serie A
  'juventus': 496,
  'milan': 489, 'acmilan': 489,
  'inter': 505, 'intermilan': 505,
  'napoli': 492,
  'roma': 497,
  'lazio': 487,
  'atalanta': 499,
  
  // Champions League teams
  'benfica': 211,
  'porto': 212,
  'sporting': 218,
  'ajax': 194,
  'salzburg': 776,
  
  // NBA Teams (pour référence, même si pas dans cette API)
  'lakers': 0,
  'celtics': 0,
  'warriors': 0,
  'bulls': 0,
  'heat': 0,
};

/**
 * Get API-Football API key from environment
 */
function getApiKey(): string | null {
  return process.env.RAPIDAPI_KEY || process.env.API_FOOTBALL_KEY || null;
}

/**
 * Check if we have remaining API requests
 */
function canMakeRequest(): boolean {
  const today = new Date().toDateString();
  if (lastReset !== today) {
    dailyRequests = 0;
    lastReset = today;
  }
  return dailyRequests < MAX_DAILY_REQUESTS;
}

/**
 * Get cached data if valid
 */
function getCached(key: string): any | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Set cache data
 */
function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Make API request with caching and timeout
 */
async function apiRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('⚠️ API_FOOTBALL_KEY not configured');
    return null;
  }

  const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`📦 API-Football cache hit: ${endpoint}`);
    return cached;
  }

  if (!canMakeRequest()) {
    console.log('⚠️ API-Football daily limit reached');
    return null;
  }

  try {
    const queryString = new URLSearchParams(params).toString();
    const url = `https://api-football-v1.p.rapidapi.com/v3/${endpoint}?${queryString}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
      }
    }, API_TIMEOUT);

    dailyRequests++;

    if (!response.ok) {
      console.error(`API-Football error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    setCache(cacheKey, data);
    console.log(`✅ API-Football: ${endpoint} (${dailyRequests}/${MAX_DAILY_REQUESTS} requests today)`);
    return data;

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`⏱️ API-Football timeout: ${endpoint}`);
    } else {
      console.error('API-Football request failed:', error.message);
    }
    return null;
  }
}

/**
 * Find team ID by name (with fuzzy matching and cache)
 */
async function findTeamId(teamName: string, _leagueId?: number): Promise<number | null> {
  const normalizedName = normalizeTeamName(teamName);
  
  // Check local cache first (fastest)
  if (TEAM_ID_CACHE[normalizedName]) {
    return TEAM_ID_CACHE[normalizedName];
  }
  
  // Check for partial matches in cache
  for (const [key, id] of Object.entries(TEAM_ID_CACHE)) {
    if (key.includes(normalizedName) || normalizedName.includes(key)) {
      return id;
    }
  }

  // Check dynamic cache
  const cacheKey = `teamId:${normalizedName}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  // Search for team via API (only if not in cache)
  const data = await apiRequest('teams', { search: teamName });
  
  if (data?.response && data.response.length > 0) {
    // Try to find best match
    for (const team of data.response) {
      const apiTeamName = normalizeTeamName(team.team.name);
      if (apiTeamName.includes(normalizedName) || normalizedName.includes(apiTeamName)) {
        // Cache for future use
        TEAM_ID_CACHE[normalizedName] = team.team.id;
        setCache(cacheKey, team.team.id);
        return team.team.id;
      }
    }
    // Return first result if no exact match
    const teamId = data.response[0].team.id;
    TEAM_ID_CACHE[normalizedName] = teamId;
    setCache(cacheKey, teamId);
    return teamId;
  }

  return null;
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
 * Get injuries and suspensions for a team
 */
export async function getInjuriesAndSuspensions(
  teamName: string,
  season: number = new Date().getFullYear()
): Promise<Injury[]> {
  try {
    const teamId = await findTeamId(teamName);
    if (!teamId) return [];

    const data = await apiRequest('injuries', {
      team: teamId.toString(),
      season: season.toString()
    });

    if (!data?.response) return [];

    return data.response.slice(0, 10).map((item: any) => ({
      player: item.player.name,
      team: item.team.name,
      type: item.player.type || 'injury',
      reason: item.player.reason || 'Unknown',
      matchMissed: item.fixture?.date || 'Upcoming'
    }));
  } catch (error) {
    console.error('Erreur getInjuriesAndSuspensions:', error);
    return [];
  }
}

/**
 * Get injuries for a specific fixture
 */
export async function getFixtureInjuries(fixtureId: string): Promise<Injury[]> {
  try {
    const data = await apiRequest('injuries', { fixture: fixtureId });
    
    if (!data?.response) return [];

    return data.response.map((item: any) => ({
      player: item.player.name,
      team: item.team.name,
      type: item.player.type || 'injury',
      reason: item.player.reason || 'Unknown',
      matchMissed: item.fixture?.date || 'Upcoming'
    }));
  } catch (error) {
    console.error('Erreur getFixtureInjuries:', error);
    return [];
  }
}

/**
 * Get team form (last 5 matches)
 */
export async function getTeamForm(teamName: string): Promise<TeamForm | null> {
  try {
    const teamId = await findTeamId(teamName);
    if (!teamId) return null;

    const data = await apiRequest('teams/statistics', {
      team: teamId.toString(),
      season: new Date().getFullYear().toString(),
      league: '61' // Default to Ligue 1
    });

    if (!data?.response) return null;

    const stats = data.response;
    
    return {
      team: teamName,
      form: stats.form || 'N/A',
      last5: [],
      goalsScored: stats.goals?.for?.total || 0,
      goalsConceded: stats.goals?.against?.total || 0,
      cleanSheets: stats.clean_sheet?.total || 0
    };
  } catch (error) {
    console.error('Erreur getTeamForm:', error);
    return null;
  }
}

/**
 * Get Head to Head history between two teams
 */
export async function getH2HHistory(
  team1Name: string,
  team2Name: string,
  limit: number = 5
): Promise<H2HMatch[]> {
  try {
    // Run team ID lookups in parallel
    const [team1Id, team2Id] = await Promise.all([
      findTeamId(team1Name),
      findTeamId(team2Name)
    ]);

    if (!team1Id || !team2Id) return [];

    const data = await apiRequest('fixtures/headtohead', {
      h2h: `${team1Id}-${team2Id}`,
      last: limit.toString()
    });

    if (!data?.response) return [];

    return data.response.map((match: any) => ({
      date: match.fixture.date,
      homeTeam: match.teams.home.name,
      awayTeam: match.teams.away.name,
      homeScore: match.goals.home,
      awayScore: match.goals.away,
      competition: match.league.name
    }));
  } catch (error) {
    console.error('Erreur getH2HHistory:', error);
    return [];
  }
}

/**
 * Get team statistics
 */
export async function getTeamStatistics(
  teamName: string,
  leagueId: number = 61,
  season: number = new Date().getFullYear()
): Promise<TeamStats | null> {
  try {
    const teamId = await findTeamId(teamName);
    if (!teamId) return null;

    const data = await apiRequest('teams/statistics', {
      team: teamId.toString(),
      league: leagueId.toString(),
      season: season.toString()
    });

    if (!data?.response) return null;

    const stats = data.response;
    
    return {
      team: teamName,
      played: stats.fixtures?.played?.total || 0,
      wins: stats.fixtures?.wins?.total || 0,
      draws: stats.fixtures?.draws?.total || 0,
      losses: stats.fixtures?.loses?.total || 0,
      goalsFor: stats.goals?.for?.total || 0,
      goalsAgainst: stats.goals?.against?.total || 0,
      form: stats.form || 'N/A'
    };
  } catch (error) {
    console.error('Erreur getTeamStatistics:', error);
    return null;
  }
}

/**
 * Find fixture by team names
 */
export async function findFixture(
  homeTeam: string,
  awayTeam: string
): Promise<{ id: number; date: string; league: string; status: string } | null> {
  try {
    // Run team ID lookups in parallel
    const [homeId, awayId] = await Promise.all([
      findTeamId(homeTeam),
      findTeamId(awayTeam)
    ]);

    if (!homeId || !awayId) return null;

    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const data = await apiRequest('fixtures', {
      from: today.toISOString().split('T')[0],
      to: nextWeek.toISOString().split('T')[0],
      team: homeId.toString()
    });

    if (!data?.response) return null;

    // Find match with the away team
    for (const fixture of data.response) {
      if (fixture.teams.home.id === homeId && fixture.teams.away.id === awayId) {
        return {
          id: fixture.fixture.id,
          date: fixture.fixture.date,
          league: fixture.league.name,
          status: fixture.fixture.status.short
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Erreur findFixture:', error);
    return null;
  }
}

/**
 * Get comprehensive match analysis data - VERSION OPTIMISÉE
 * Utilise Promise.allSettled pour ne pas bloquer sur les échecs
 */
export async function getMatchAnalysisData(
  homeTeam: string,
  awayTeam: string
): Promise<{
  homeInjuries: Injury[];
  awayInjuries: Injury[];
  homeForm: TeamForm | null;
  awayForm: TeamForm | null;
  h2h: H2HMatch[];
  fixture: { id: number; date: string; league: string; status: string } | null;
  homeStats: TeamStats | null;
  awayStats: TeamStats | null;
}> {
  const defaultResult = {
    homeInjuries: [] as Injury[],
    awayInjuries: [] as Injury[],
    homeForm: null as TeamForm | null,
    awayForm: null as TeamForm | null,
    h2h: [] as H2HMatch[],
    fixture: null as { id: number; date: string; league: string; status: string } | null,
    homeStats: null as TeamStats | null,
    awayStats: null as TeamStats | null
  };

  try {
    // Étape 1: Trouver les team IDs en parallèle (rapide avec le cache)
    const [homeIdResult, awayIdResult] = await Promise.allSettled([
      findTeamId(homeTeam),
      findTeamId(awayTeam)
    ]);

    const homeId = homeIdResult.status === 'fulfilled' ? homeIdResult.value : null;
    const awayId = awayIdResult.status === 'fulfilled' ? awayIdResult.value : null;

    if (!homeId || !awayId) {
      console.log('⚠️ Impossible de trouver les IDs des équipes');
      return defaultResult;
    }

    // Étape 2: Exécuter toutes les requêtes en parallèle avec allSettled
    // Chaque requête a son propre timeout
    const results = await Promise.allSettled([
      getInjuriesAndSuspensions(homeTeam),
      getInjuriesAndSuspensions(awayTeam),
      getTeamForm(homeTeam),
      getTeamForm(awayTeam),
      getH2HHistory(homeTeam, awayTeam, 5),
      findFixture(homeTeam, awayTeam)
    ]);

    // Extraire les résultats (même si certains ont échoué)
    const [
      homeInjuriesResult,
      awayInjuriesResult,
      homeFormResult,
      awayFormResult,
      h2hResult,
      fixtureResult
    ] = results;

    // Construire le résultat final
    const finalResult = {
      ...defaultResult,
      homeInjuries: homeInjuriesResult.status === 'fulfilled' ? homeInjuriesResult.value : [],
      awayInjuries: awayInjuriesResult.status === 'fulfilled' ? awayInjuriesResult.value : [],
      homeForm: homeFormResult.status === 'fulfilled' ? homeFormResult.value : null,
      awayForm: awayFormResult.status === 'fulfilled' ? awayFormResult.value : null,
      h2h: h2hResult.status === 'fulfilled' ? h2hResult.value : [],
      fixture: fixtureResult.status === 'fulfilled' ? fixtureResult.value : null
    };

    // Étape 3: Stats si fixture trouvée (optionnel)
    if (finalResult.fixture) {
      const statsResults = await Promise.allSettled([
        getTeamStatistics(homeTeam),
        getTeamStatistics(awayTeam)
      ]);
      
      finalResult.homeStats = statsResults[0].status === 'fulfilled' ? statsResults[0].value : null;
      finalResult.awayStats = statsResults[1].status === 'fulfilled' ? statsResults[1].value : null;
    }

    return finalResult;

  } catch (error) {
    console.error('Erreur getMatchAnalysisData:', error);
    return defaultResult;
  }
}

/**
 * Get remaining API requests for today
 */
export function getRemainingRequests(): { used: number; remaining: number; max: number } {
  const today = new Date().toDateString();
  if (lastReset !== today) {
    dailyRequests = 0;
    lastReset = today;
  }
  
  return {
    used: dailyRequests,
    remaining: MAX_DAILY_REQUESTS - dailyRequests,
    max: MAX_DAILY_REQUESTS
  };
}

export type { Injury, TeamForm, H2HMatch, TeamStats };
