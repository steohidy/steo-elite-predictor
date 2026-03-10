/**
 * NHL Stats Scraper - Sources gratuites pour stats avancées réelles
 * 
 * Sources:
 * - Natural Stat Trick: Corsi, Fenwick, xG, PDO (gratuit, pas d'API)
 * - MoneyPuck: xG détaillé, projections (gratuit, pas d'API)
 * - NHL.com API: Stats de base officielles
 * 
 * Utilise z-ai-web-dev-sdk pour le scraping
 */

import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export interface AdvancedTeamStats {
  team: string;
  teamAbbr: string;
  
  // Natural Stat Trick
  corsiForPct: number;       // CF%
  fenwickForPct: number;     // FF%
  xGFor: number;             // Expected Goals For
  xGAgainst: number;         // Expected Goals Against
  xGForPct: number;          // xGF%
  pdo: number;               // SH% + SV%
  
  // MoneyPuck
  xGoalsPercentage: number;
  fenwickPercentage: number;
  shotQualityFor: number;
  shotQualityAgainst: number;
  
  // Saison
  gamesPlayed: number;
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  
  // Timestamp
  fetchedAt: string;
  source: string;
}

export interface GoalieAdvancedStats {
  name: string;
  team: string;
  gamesPlayed: number;
  saves: number;
  goalsAgainst: number;
  savePct: number;
  gaa: number;
  xSavePct: number;          // Expected Save % (MoneyPuck)
  goalsSavedAboveAvg: number; // GSAx
  qualityStartsPct: number;
  fetchedAt: string;
}

// ===== CACHE =====

let cachedTeamStats: Map<string, AdvancedTeamStats> = new Map();
let cachedGoalieStats: Map<string, GoalieAdvancedStats> = new Map();
let lastScrapeTime = 0;
const SCRAPE_INTERVAL = 6 * 60 * 60 * 1000; // 6 heures

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

// ===== NHL TEAM MAPPING =====

const TEAM_NAME_TO_ABBR: Record<string, string> = {
  'Anaheim Ducks': 'ANA',
  'Arizona Coyotes': 'ARI',
  'Boston Bruins': 'BOS',
  'Buffalo Sabres': 'BUF',
  'Calgary Flames': 'CGY',
  'Carolina Hurricanes': 'CAR',
  'Chicago Blackhawks': 'CHI',
  'Colorado Avalanche': 'COL',
  'Columbus Blue Jackets': 'CBJ',
  'Dallas Stars': 'DAL',
  'Detroit Red Wings': 'DET',
  'Edmonton Oilers': 'EDM',
  'Florida Panthers': 'FLA',
  'Los Angeles Kings': 'LAK',
  'Minnesota Wild': 'MIN',
  'Montreal Canadiens': 'MTL',
  'Nashville Predators': 'NSH',
  'New Jersey Devils': 'NJD',
  'New York Islanders': 'NYI',
  'New York Rangers': 'NYR',
  'Ottawa Senators': 'OTT',
  'Philadelphia Flyers': 'PHI',
  'Pittsburgh Penguins': 'PIT',
  'San Jose Sharks': 'SJS',
  'Seattle Kraken': 'SEA',
  'St. Louis Blues': 'STL',
  'Tampa Bay Lightning': 'TBL',
  'Toronto Maple Leafs': 'TOR',
  'Vancouver Canucks': 'VAN',
  'Vegas Golden Knights': 'VGK',
  'Washington Capitals': 'WSH',
  'Winnipeg Jets': 'WPG',
  // Abbreviations communes
  'ANA': 'ANA', 'ARI': 'ARI', 'BOS': 'BOS', 'BUF': 'BUF', 'CGY': 'CGY',
  'CAR': 'CAR', 'CHI': 'CHI', 'COL': 'COL', 'CBJ': 'CBJ', 'DAL': 'DAL',
  'DET': 'DET', 'EDM': 'EDM', 'FLA': 'FLA', 'LAK': 'LAK', 'MIN': 'MIN',
  'MTL': 'MTL', 'NSH': 'NSH', 'NJD': 'NJD', 'NYI': 'NYI', 'NYR': 'NYR',
  'OTT': 'OTT', 'PHI': 'PHI', 'PIT': 'PIT', 'SJS': 'SJS', 'SEA': 'SEA',
  'STL': 'STL', 'TBL': 'TBL', 'TOR': 'TOR', 'VAN': 'VAN', 'VGK': 'VGK',
  'WSH': 'WSH', 'WPG': 'WPG',
};

// ===== INITIALIZE ZAI =====

async function initZAI(): Promise<NonNullable<typeof zaiInstance>> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ===== NATURAL STAT TRICK SCRAPER =====

/**
 * Scrape les stats avancées depuis Natural Stat Trick
 * URL: https://www.naturalstattrick.com/teamtable.php
 */
export async function scrapeNaturalStatTrick(season: string = '20242025'): Promise<AdvancedTeamStats[]> {
  console.log('📊 Scraping Natural Stat Trick...');
  
  try {
    const zai = await initZAI();
    
    // URL pour les stats 5v5 de la saison
    const url = `https://www.naturalstattrick.com/teamtable.php?season=${season}&stype=2&sit=5v5&score=all&rate=n`;
    
    const result = await zai.functions.invoke('page_reader', { url });
    
    if (!result.data?.html) {
      throw new Error('No HTML content received');
    }
    
    const html = result.data.html;
    const stats = parseNaturalStatTrickHTML(html);
    
    console.log(`✅ Natural Stat Trick: ${stats.length} équipes récupérées`);
    return stats;
    
  } catch (error) {
    console.error('❌ Erreur Natural Stat Trick:', error);
    return [];
  }
}

/**
 * Parse le HTML de Natural Stat Trick
 */
function parseNaturalStatTrickHTML(html: string): AdvancedTeamStats[] {
  const stats: AdvancedTeamStats[] = [];
  
  // Les données sont dans un tableau HTML
  // Structure: <table><tr><td>Team</td><td>CF%</td><td>FF%</td><td>xGF</td>...
  
  // Regex pour extraire les lignes du tableau
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells: string[] = [];
    
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      // Nettoyer le contenu
      const content = cellMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
      cells.push(content);
    }
    
    // Vérifier si c'est une ligne de données (pas l'en-tête)
    if (cells.length >= 10 && cells[0] && TEAM_NAME_TO_ABBR[cells[0]]) {
      const teamAbbr = TEAM_NAME_TO_ABBR[cells[0]];
      
      // Indices typiques Natural Stat Trick:
      // [0] Team, [1] GP, [2] W, [3] L, ... CF%, FF%, xGF, xGA, PDO
      // Les indices exacts dépendent de la page
      
      stats.push({
        team: cells[0],
        teamAbbr: teamAbbr,
        corsiForPct: parseFloat(cells[10]) || 50,
        fenwickForPct: parseFloat(cells[12]) || 50,
        xGFor: parseFloat(cells[14]) || 0,
        xGAgainst: parseFloat(cells[15]) || 0,
        xGForPct: parseFloat(cells[16]) || 50,
        pdo: parseFloat(cells[20]) || 1000,
        xGoalsPercentage: 0,
        fenwickPercentage: parseFloat(cells[12]) || 50,
        shotQualityFor: 0,
        shotQualityAgainst: 0,
        gamesPlayed: parseInt(cells[1]) || 0,
        wins: parseInt(cells[2]) || 0,
        losses: parseInt(cells[3]) || 0,
        otLosses: parseInt(cells[4]) || 0,
        points: 0,
        fetchedAt: new Date().toISOString(),
        source: 'naturalstattrick'
      });
    }
  }
  
  return stats;
}

// ===== MONEYPUCK SCRAPER =====

/**
 * Scrape les stats depuis MoneyPuck
 * URL: https://moneypuck.com/teams.htm
 */
export async function scrapeMoneyPuck(): Promise<AdvancedTeamStats[]> {
  console.log('💰 Scraping MoneyPuck...');
  
  try {
    const zai = await initZAI();
    
    const url = 'https://moneypuck.com/teams.htm';
    
    const result = await zai.functions.invoke('page_reader', { url });
    
    if (!result.data?.html) {
      throw new Error('No HTML content received');
    }
    
    const html = result.data.html;
    const stats = parseMoneyPuckHTML(html);
    
    console.log(`✅ MoneyPuck: ${stats.length} équipes récupérées`);
    return stats;
    
  } catch (error) {
    console.error('❌ Erreur MoneyPuck:', error);
    return [];
  }
}

/**
 * Parse le HTML de MoneyPuck
 */
function parseMoneyPuckHTML(html: string): AdvancedTeamStats[] {
  const stats: AdvancedTeamStats[] = [];
  
  // MoneyPuck a souvent les données en JSON inline ou dans un tableau
  // Chercher les patterns de données
  
  // Pattern pour les données JSON embed
  const jsonRegex = /var\s+teamData\s*=\s*(\[[\s\S]*?\]);/;
  const jsonMatch = html.match(jsonRegex);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      
      for (const team of data) {
        const abbr = TEAM_NAME_TO_ABBR[team.teamName || team.team];
        if (abbr) {
          stats.push({
            team: team.teamName || team.team,
            teamAbbr: abbr,
            corsiForPct: team.corsiPercentage || 50,
            fenwickForPct: team.fenwickPercentage || 50,
            xGFor: team.xGoalsFor || 0,
            xGAgainst: team.xGoalsAgainst || 0,
            xGForPct: team.xGoalsPercentage || 50,
            pdo: team.pdo || 1000,
            xGoalsPercentage: team.xGoalsPercentage || 50,
            fenwickPercentage: team.fenwickPercentage || 50,
            shotQualityFor: team.shotQualityFor || 0,
            shotQualityAgainst: team.shotQualityAgainst || 0,
            gamesPlayed: team.games || 0,
            wins: team.wins || 0,
            losses: team.losses || 0,
            otLosses: team.otLosses || 0,
            points: team.points || 0,
            fetchedAt: new Date().toISOString(),
            source: 'moneypuck'
          });
        }
      }
    } catch (e) {
      console.error('Erreur parsing JSON MoneyPuck:', e);
    }
  }
  
  // Fallback: parsing tableau HTML
  if (stats.length === 0) {
    const rowRegex = /<tr[^>]*class="[^"]*team-row[^"]*"[^>]*>[\s\S]*?<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[0];
      const cells: string[] = [];
      
      let cellMatch;
      while ((cellMatch = cellRegex.exec(row)) !== null) {
        const content = cellMatch[1].replace(/<[^>]*>/g, '').trim();
        cells.push(content);
      }
      
      if (cells.length >= 5) {
        const teamName = cells[0];
        const abbr = TEAM_NAME_TO_ABBR[teamName];
        
        if (abbr) {
          stats.push({
            team: teamName,
            teamAbbr: abbr,
            corsiForPct: parseFloat(cells[4]) || 50,
            fenwickForPct: parseFloat(cells[5]) || 50,
            xGFor: parseFloat(cells[8]) || 0,
            xGAgainst: parseFloat(cells[9]) || 0,
            xGForPct: parseFloat(cells[10]) || 50,
            pdo: parseFloat(cells[15]) || 1000,
            xGoalsPercentage: parseFloat(cells[10]) || 50,
            fenwickPercentage: parseFloat(cells[5]) || 50,
            shotQualityFor: 0,
            shotQualityAgainst: 0,
            gamesPlayed: parseInt(cells[1]) || 0,
            wins: parseInt(cells[2]) || 0,
            losses: parseInt(cells[3]) || 0,
            otLosses: 0,
            points: 0,
            fetchedAt: new Date().toISOString(),
            source: 'moneypuck'
          });
        }
      }
    }
  }
  
  return stats;
}

// ===== NHL.COM API (OFFICIELLE) =====

/**
 * Récupère les stats officielles depuis NHL.com API
 * Cette API est publique et gratuite
 */
export async function fetchNHLApiStats(): Promise<AdvancedTeamStats[]> {
  console.log('🏒 Fetching NHL.com API...');
  
  try {
    // NHL Stats API - Standings
    const standingsUrl = 'https://statsapi.web.nhl.com/api/v1/standings/byLeague';
    
    const standingsResponse = await fetch(standingsUrl, {
      next: { revalidate: 3600 } // 1 heure
    });
    
    if (!standingsResponse.ok) {
      throw new Error(`NHL API error: ${standingsResponse.status}`);
    }
    
    const standingsData = await standingsResponse.json();
    const stats: AdvancedTeamStats[] = [];
    
    // Parcourir les records
    if (standingsData.records) {
      for (const record of standingsData.records) {
        for (const teamRecord of record.teamRecords || []) {
          const team = teamRecord.team;
          const abbr = team.abbreviation || TEAM_NAME_TO_ABBR[team.name];
          
          if (abbr) {
            stats.push({
              team: team.name,
              teamAbbr: abbr,
              // Stats de base (pas de Corsi/xG dans cette API)
              corsiForPct: 50, // Sera mis à jour par Natural Stat Trick
              fenwickForPct: 50,
              xGFor: 0,
              xGAgainst: 0,
              xGForPct: 50,
              pdo: 1000,
              xGoalsPercentage: 50,
              fenwickPercentage: 50,
              shotQualityFor: 0,
              shotQualityAgainst: 0,
              gamesPlayed: teamRecord.gamesPlayed || 0,
              wins: teamRecord.leagueRecord?.wins || 0,
              losses: teamRecord.leagueRecord?.losses || 0,
              otLosses: teamRecord.leagueRecord?.ot || 0,
              points: teamRecord.points || 0,
              fetchedAt: new Date().toISOString(),
              source: 'nhl_api'
            });
          }
        }
      }
    }
    
    console.log(`✅ NHL API: ${stats.length} équipes récupérées`);
    return stats;
    
  } catch (error) {
    console.error('❌ Erreur NHL API:', error);
    return [];
  }
}

// ===== GOALIE STATS SCRAPER =====

/**
 * Scrape les stats des gardiens depuis Natural Stat Trick
 */
export async function scrapeGoalieStats(season: string = '20242025'): Promise<GoalieAdvancedStats[]> {
  console.log('🧤 Scraping goalie stats...');
  
  try {
    const zai = await initZAI();
    
    const url = `https://www.naturalstattrick.com/playerteams.php?season=${season}&stype=2&sit=all&score=all&stdoi=goalie`;
    
    const result = await zai.functions.invoke('page_reader', { url });
    
    if (!result.data?.html) {
      throw new Error('No HTML content received');
    }
    
    const goalies = parseGoalieHTML(result.data.html);
    
    console.log(`✅ Goalies: ${goalies.length} gardiens récupérés`);
    return goalies;
    
  } catch (error) {
    console.error('❌ Erreur scraping goalies:', error);
    return [];
  }
}

/**
 * Parse le HTML des stats gardiens
 */
function parseGoalieHTML(html: string): GoalieAdvancedStats[] {
  const goalies: GoalieAdvancedStats[] = [];
  
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells: string[] = [];
    
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      const content = cellMatch[1].replace(/<[^>]*>/g, '').trim();
      cells.push(content);
    }
    
    // Structure typique: [0] Player, [1] Team, [2] GP, [3] Saves, [4] GA, [5] SV%, [6] GAA...
    if (cells.length >= 7 && cells[0] && cells[1]) {
      const teamAbbr = TEAM_NAME_TO_ABBR[cells[1]];
      
      if (teamAbbr) {
        goalies.push({
          name: cells[0],
          team: teamAbbr,
          gamesPlayed: parseInt(cells[2]) || 0,
          saves: parseInt(cells[3]) || 0,
          goalsAgainst: parseInt(cells[4]) || 0,
          savePct: parseFloat(cells[5]) || 0.900,
          gaa: parseFloat(cells[6]) || 3.00,
          xSavePct: 0, // Pas dans Natural Stat Trick basique
          goalsSavedAboveAvg: 0,
          qualityStartsPct: 0,
          fetchedAt: new Date().toISOString()
        });
      }
    }
  }
  
  return goalies;
}

// ===== AGGREGATION =====

/**
 * Agrège les stats de toutes les sources
 * Retourne les données les plus complètes possibles
 */
export async function getAggregatedNHLStats(forceRefresh: boolean = false): Promise<Map<string, AdvancedTeamStats>> {
  const now = Date.now();
  
  // Vérifier le cache
  if (!forceRefresh && cachedTeamStats.size > 0 && (now - lastScrapeTime) < SCRAPE_INTERVAL) {
    console.log('📦 Utilisation du cache NHL stats');
    return cachedTeamStats;
  }
  
  console.log('🔄 Récupération des stats NHL depuis toutes les sources...');
  
  // Récupérer depuis toutes les sources en parallèle
  const [nstStats, mpStats, nhlStats] = await Promise.all([
    scrapeNaturalStatTrick(),
    scrapeMoneyPuck(),
    fetchNHLApiStats()
  ]);
  
  // Merger les données
  const aggregated = new Map<string, AdvancedTeamStats>();
  
  // 1. Commencer avec NHL API (données officielles de base)
  for (const stat of nhlStats) {
    aggregated.set(stat.teamAbbr, stat);
  }
  
  // 2. Enrichir avec Natural Stat Trick (Corsi, xG)
  for (const stat of nstStats) {
    const existing = aggregated.get(stat.teamAbbr);
    if (existing) {
      aggregated.set(stat.teamAbbr, {
        ...existing,
        corsiForPct: stat.corsiForPct || existing.corsiForPct,
        fenwickForPct: stat.fenwickForPct || existing.fenwickForPct,
        xGFor: stat.xGFor || existing.xGFor,
        xGAgainst: stat.xGAgainst || existing.xGAgainst,
        xGForPct: stat.xGForPct || existing.xGForPct,
        pdo: stat.pdo || existing.pdo,
        source: `${existing.source},naturalstattrick`
      });
    } else {
      aggregated.set(stat.teamAbbr, stat);
    }
  }
  
  // 3. Enrichir avec MoneyPuck (plus de données xG)
  for (const stat of mpStats) {
    const existing = aggregated.get(stat.teamAbbr);
    if (existing) {
      aggregated.set(stat.teamAbbr, {
        ...existing,
        xGoalsPercentage: stat.xGoalsPercentage || existing.xGoalsPercentage,
        shotQualityFor: stat.shotQualityFor || existing.shotQualityFor,
        shotQualityAgainst: stat.shotQualityAgainst || existing.shotQualityAgainst,
        fenwickPercentage: stat.fenwickPercentage || existing.fenwickPercentage,
        source: existing.source.includes('moneypuck') ? existing.source : `${existing.source},moneypuck`
      });
    } else {
      aggregated.set(stat.teamAbbr, stat);
    }
  }
  
  // Mettre à jour le cache
  cachedTeamStats = aggregated;
  lastScrapeTime = now;
  
  console.log(`✅ Stats NHL agrégées: ${aggregated.size} équipes`);
  
  // Log les sources
  const sources = new Set<string>();
  aggregated.forEach(stat => {
    stat.source.split(',').forEach(s => sources.add(s.trim()));
  });
  console.log(`📊 Sources utilisées: ${Array.from(sources).join(', ')}`);
  
  return aggregated;
}

/**
 * Récupère les stats pour une équipe spécifique
 */
export async function getTeamAdvancedStats(teamAbbr: string): Promise<AdvancedTeamStats | null> {
  const allStats = await getAggregatedNHLStats();
  return allStats.get(teamAbbr) || null;
}

/**
 * Récupère les stats de tous les gardiens
 */
export async function getAggregatedGoalieStats(forceRefresh: boolean = false): Promise<Map<string, GoalieAdvancedStats>> {
  if (!forceRefresh && cachedGoalieStats.size > 0) {
    return cachedGoalieStats;
  }
  
  const goalies = await scrapeGoalieStats();
  
  // Garder le meilleur gardien par équipe (titulaire)
  const byTeam = new Map<string, GoalieAdvancedStats>();
  for (const goalie of goalies) {
    const existing = byTeam.get(goalie.team);
    if (!existing || goalie.gamesPlayed > existing.gamesPlayed) {
      byTeam.set(goalie.team, goalie);
    }
  }
  
  cachedGoalieStats = byTeam;
  return byTeam;
}

/**
 * Récupère les stats du gardien d'une équipe
 */
export async function getTeamGoalieStats(teamAbbr: string): Promise<GoalieAdvancedStats | null> {
  const allGoalies = await getAggregatedGoalieStats();
  return allGoalies.get(teamAbbr) || null;
}

/**
 * Clear le cache
 */
export function clearNHLCache(): void {
  cachedTeamStats.clear();
  cachedGoalieStats.clear();
  lastScrapeTime = 0;
}

// ===== EXPORT =====

const NHLScraperService = {
  getAggregatedNHLStats,
  getTeamAdvancedStats,
  getAggregatedGoalieStats,
  getTeamGoalieStats,
  scrapeNaturalStatTrick,
  scrapeMoneyPuck,
  fetchNHLApiStats,
  clearNHLCache
};

export default NHLScraperService;
