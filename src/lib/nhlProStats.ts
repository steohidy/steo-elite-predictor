/**
 * NHL Pro Stats System - Système de prédiction PRO
 * 
 * Basé sur les métriques avancées RÉELLES:
 * - xGF% (Expected Goals For Percentage)
 * - HDCF% (High Danger Chances For)
 * - PDO (SV% + SH%) - Indicateur de chance/régression
 * - GSAx (Goals Saved Above Expected) - Vraie valeur du gardien
 * - Rolling 10-game form
 * 
 * Sources:
 * - Natural Stat Trick: Teams > 5v5 > Summary
 * - MoneyPuck: Power Rankings + GSAx
 */

import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export interface ProTeamStats {
  team: string;
  teamAbbr: string;
  
  // ===== POWER RATING COMPONENTS =====
  powerRating: {
    overall: number;           // Score composite 0-100
    xGFPercent: number;        // Expected Goals For %
    HDCFPercent: number;       // High Danger Chances For %
    PDO: number;               // SV% + SH% (1000 = normal)
    luckFactor: 'lucky' | 'normal' | 'unlucky'; // PDO interpretation
  };
  
  // ===== 5v5 STATS (per 60 min) =====
  fiveOnFive: {
    xGFPer60: number;          // Expected Goals For / 60
    xGAPer60: number;          // Expected Goals Against / 60
    GFPer60: number;           // Actual Goals For / 60
    GAPer60: number;           // Actual Goals Against / 60
    CFPer60: number;           // Corsi For / 60
    CAPer60: number;           // Corsi Against / 60
    HDfPer60: number;          // High Danger For / 60
    HDaPer60: number;          // High Danger Against / 60
  };
  
  // ===== ROLLING 10-GAME FORM =====
  last10: {
    xGFPercent: number;        // Forme récente xG%
    HDCFPercent: number;       // Forme récente HDC%
    PDO: number;               // Chance récente
    record: string;            // ex: "6-3-1"
    points: number;            // Points sur 10 matchs
    trend: 'hot' | 'normal' | 'cold'; // Tendance
  };
  
  // ===== SPECIAL TEAMS =====
  specialTeams: {
    powerPlayPct: number;      // PP%
    penaltyKillPct: number;    // PK%
    netSpecialTeams: number;   // PP% - (100 - PK%)
  };
  
  // ===== GOALTENDING =====
  goaltending: {
    starterName: string;
    GSAx: number;              // Goals Saved Above Expected
    savePct: number;
    xSavePct: number;          // Expected Save %
    qualityStartsPct: number;  // % de matchs "quality start"
  };
  
  // ===== SITUATIONAL =====
  situational: {
    homeAdvantage: number;     // Différence performance domicile
    restDays: number;          // Jours de repos
    isBackToBack: boolean;
    gamesInLast7Days: number;
    travelDistance: number;    // km
  };
  
  // ===== METADATA =====
  gamesPlayed: number;
  standing: {
    position: number;
    points: number;
    gamesPlayed: number;
    wildcard: boolean;
    divisionRank: number;
  };
  
  fetchedAt: string;
  source: string;
}

export interface MatchupAnalysis {
  homeTeam: string;
  awayTeam: string;
  
  // ===== PROJECTED SCORES =====
  projected: {
    homeGoals: number;
    awayGoals: number;
    totalGoals: number;
    homeWinProb: number;
    awayWinProb: number;
    drawProb: number;          // Après 60 min
  };
  
  // ===== CALCULATION BREAKDOWN =====
  calculation: {
    attackHome: number;        // (xGF Home + xGA Away) / 2
    attackAway: number;        // (xGF Away + xGA Home) / 2
    goalieAdjHome: number;     // GSAx adjustment
    goalieAdjAway: number;
    homeIceBonus: number;      // +0.3 buts
    specialTeamsAdj: number;   // PP vs PK impact
  };
  
  // ===== KEY FACTORS =====
  factors: {
    powerRatingDiff: number;   // Différence Power Rating
    xGDiff: number;            // Différence xG%
    HDCDiff: number;           // Différence High Danger
    PDOI: {                    // PDO Intelligence
      home: { value: number; status: string };
      away: { value: number; status: string };
    };
    goalieEdge: number;        // Avantage gardien (GSAx)
    specialTeamsEdge: number;  // Avantage special teams
    fatigueEdge: number;       // Avantage repos
  };
  
  // ===== BETTING INSIGHTS =====
  insights: {
    valueBet: {
      detected: boolean;
      type: 'home' | 'away' | 'over' | 'under' | null;
      edge: number;
      reasoning: string;
    };
    kellyFraction: number;
    confidence: number;
    recommendation: string;
  };
  
  // ===== DATA QUALITY =====
  dataQuality: {
    homeStats: 'real' | 'fallback';
    awayStats: 'real' | 'fallback';
    homeGoalie: 'real' | 'fallback';
    awayGoalie: 'real' | 'fallback';
    overallScore: number;      // 0-100
  };
}

// ===== CONSTANTS =====

// Poids pour le Power Rating
const POWER_RATING_WEIGHTS = {
  xGFPercent: 0.40,      // Le plus prédictif
  HDCFPercent: 0.35,     // Chances de qualité
  PDO: 0.25,             // Chance/régression
};

// Ajustements
const HOME_ICE_BONUS = 0.3;        // Buts supplémentaires domicile
const GOALIE_IMPACT = 0.15;        // Impact GSAx sur buts
const SPECIAL_TEAMS_IMPACT = 0.1; // Impact PP/PK sur buts

// Seuils PDO
const PDO_THRESHOLDS = {
  lucky: 1020,          // > 1020 = surperforme (chanceux)
  unlucky: 980,         // < 980 = sous-performe (malchanceux)
  regressionTarget: 1000,
};

// ===== TEAM ABBREVIATION MAPPING =====

const TEAM_ABBR_MAP: Record<string, string> = {
  'Anaheim Ducks': 'ANA', 'Arizona Coyotes': 'ARI', 'Boston Bruins': 'BOS',
  'Buffalo Sabres': 'BUF', 'Calgary Flames': 'CGY', 'Carolina Hurricanes': 'CAR',
  'Chicago Blackhawks': 'CHI', 'Colorado Avalanche': 'COL', 'Columbus Blue Jackets': 'CBJ',
  'Dallas Stars': 'DAL', 'Detroit Red Wings': 'DET', 'Edmonton Oilers': 'EDM',
  'Florida Panthers': 'FLA', 'Los Angeles Kings': 'LAK', 'Minnesota Wild': 'MIN',
  'Montreal Canadiens': 'MTL', 'Nashville Predators': 'NSH', 'New Jersey Devils': 'NJD',
  'New York Islanders': 'NYI', 'New York Rangers': 'NYR', 'Ottawa Senators': 'OTT',
  'Philadelphia Flyers': 'PHI', 'Pittsburgh Penguins': 'PIT', 'San Jose Sharks': 'SJS',
  'Seattle Kraken': 'SEA', 'St. Louis Blues': 'STL', 'Tampa Bay Lightning': 'TBL',
  'Toronto Maple Leafs': 'TOR', 'Vancouver Canucks': 'VAN', 'Vegas Golden Knights': 'VGK',
  'Washington Capitals': 'WSH', 'Winnipeg Jets': 'WPG',
};

// ===== CACHE =====

let cachedProStats: Map<string, ProTeamStats> = new Map();
let lastProScrapeTime = 0;
const PRO_SCRAPE_INTERVAL = 4 * 60 * 60 * 1000; // 4 heures

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

// ===== INITIALIZATION =====

async function initZAI(): Promise<NonNullable<typeof zaiInstance>> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ===== NATURAL STAT TRICK SCRAPER (5v5 Summary) =====

/**
 * Scrape les stats 5v5 depuis Natural Stat Trick
 * URL: https://www.naturalstattrick.com/teamtable.php?sit=5v5
 */
async function scrapeNSTTeamStats(season: string = '20242025'): Promise<Partial<ProTeamStats>[]> {
  console.log('📊 [NST] Scraping Natural Stat Trick (5v5 Summary)...');
  
  try {
    const zai = await initZAI();
    
    // URL pour stats 5v5 complètes
    const url = `https://www.naturalstattrick.com/teamtable.php?season=${season}&stype=2&sit=5v5&score=all&rate=n&team=none`;
    
    const result = await zai.functions.invoke('page_reader', { url });
    
    if (!result.data?.html) {
      throw new Error('No HTML content');
    }
    
    return parseNSTTable(result.data.html);
    
  } catch (error) {
    console.error('❌ [NST] Erreur:', error);
    return [];
  }
}

/**
 * Parse le tableau HTML de Natural Stat Trick
 */
function parseNSTTable(html: string): Partial<ProTeamStats>[] {
  const stats: Partial<ProTeamStats>[] = [];
  
  // Extraire le tableau de données
  // Natural Stat Trick utilise un tableau HTML standard
  const tableRegex = /<table[^>]*class="[^"]*dataTable[^"]*"[^>]*>([\s\S]*?)<\/table>/i;
  const tableMatch = html.match(tableRegex);
  
  if (!tableMatch) {
    // Fallback: chercher n'importe quel tableau
    const anyTableRegex = /<table[^>]*>([\s\S]*?)<\/table>/i;
    const anyMatch = html.match(anyTableRegex);
    if (anyMatch) {
      return parseGenericTable(anyMatch[1]);
    }
    return [];
  }
  
  return parseGenericTable(tableMatch[1]);
}

/**
 * Parse un tableau HTML générique
 */
function parseGenericTable(tableHtml: string): Partial<ProTeamStats>[] {
  const stats: Partial<ProTeamStats>[] = [];
  
  // Extraire les lignes
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: string[] = [];
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    rows.push(rowMatch[1]);
  }
  
  // Parser chaque ligne (ignorer l'en-tête)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cells = extractCells(row);
    
    if (cells.length < 15) continue;
    
    const teamName = cleanText(cells[0]);
    const abbr = TEAM_ABBR_MAP[teamName];
    if (!abbr) continue;
    
    // Indices typiques Natural Stat Trick 5v5:
    // [0] Team, [1] GP, [2] W, [3] L, [4] OTL, [5] Points
    // [6] CF%, [7] FF%, [8] SF%, [9] GF%, [10] xGF%
    // [11] SCF%, [12] HDCF%, [13] HDGF%, [14] PDO
    // [15] GF, [16] GA, [17] xGF, [18] xGA
    
    const xGFPercent = parseFloat(cells[10]) || 50;
    const HDCFPercent = parseFloat(cells[12]) || 50;
    const PDO = parseFloat(cells[14]) || 1000;
    
    // Calculer le Power Rating
    const powerRating = calculatePowerRating(xGFPercent, HDCFPercent, PDO);
    
    stats.push({
      team: teamName,
      teamAbbr: abbr,
      powerRating: {
        overall: powerRating,
        xGFPercent,
        HDCFPercent,
        PDO,
        luckFactor: interpretPDO(PDO),
      },
      fiveOnFive: {
        xGFPer60: parseFloat(cells[17]) / parseFloat(cells[1]) * 60 || 3.0,
        xGAPer60: parseFloat(cells[18]) / parseFloat(cells[1]) * 60 || 3.0,
        GFPer60: parseFloat(cells[15]) / parseFloat(cells[1]) * 60 || 3.0,
        GAPer60: parseFloat(cells[16]) / parseFloat(cells[1]) * 60 || 3.0,
        CFPer60: 60,
        CAPer60: 60,
        HDfPer60: 10,
        HDaPer60: 10,
      },
      gamesPlayed: parseInt(cells[1]) || 0,
      source: 'naturalstattrick',
      fetchedAt: new Date().toISOString(),
    });
  }
  
  console.log(`✅ [NST] ${stats.length} équipes parsées`);
  return stats;
}

// ===== MONEYPUCK SCRAPER (GSAx + Power Rankings) =====

/**
 * Scrape les stats MoneyPuck (GSAx, Deserve To Win)
 */
async function scrapeMoneyPuckStats(): Promise<Partial<ProTeamStats>[]> {
  console.log('💰 [MP] Scraping MoneyPuck...');
  
  try {
    const zai = await initZAI();
    
    const url = 'https://moneypuck.com/teams.htm';
    
    const result = await zai.functions.invoke('page_reader', { url });
    
    if (!result.data?.html) {
      throw new Error('No HTML content');
    }
    
    return parseMoneyPuckData(result.data.html);
    
  } catch (error) {
    console.error('❌ [MP] Erreur:', error);
    return [];
  }
}

/**
 * Parse les données MoneyPuck
 */
function parseMoneyPuckData(html: string): Partial<ProTeamStats>[] {
  const stats: Partial<ProTeamStats>[] = [];
  
  // MoneyPuck embarque souvent les données en JSON
  const jsonRegex = /(?:var\s+teamData|const\s+teamData|data\s*=\s*)(\[[\s\S]*?\]);/;
  const jsonMatch = html.match(jsonRegex);
  
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      
      for (const team of data) {
        const abbr = TEAM_ABBR_MAP[team.name || team.teamName];
        if (!abbr) continue;
        
        stats.push({
          team: team.name || team.teamName,
          teamAbbr: abbr,
          goaltending: {
            starterName: team.goalieName || 'Unknown',
            GSAx: team.gsax || team.goalsSavedAboveExpected || 0,
            savePct: team.savePct || 0.900,
            xSavePct: team.xSavePct || 0.900,
            qualityStartsPct: team.qualityStartsPct || 0.5,
          },
          source: 'moneypuck',
          fetchedAt: new Date().toISOString(),
        });
      }
      
      console.log(`✅ [MP] ${stats.length} équipes parsées (JSON)`);
      return stats;
      
    } catch (e) {
      console.log('⚠️ [MP] Pas de JSON, fallback parsing HTML');
    }
  }
  
  // Fallback: parsing HTML
  return parseMoneyPuckHTML(html);
}

/**
 * Parse le HTML de MoneyPuck (fallback)
 */
function parseMoneyPuckHTML(html: string): Partial<ProTeamStats>[] {
  const stats: Partial<ProTeamStats>[] = [];
  
  // Parser les tableaux/divs de MoneyPuck
  const rowRegex = /<tr[^>]*class="[^"]*team[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells = extractCells(rowMatch[1]);
    if (cells.length < 5) continue;
    
    const teamName = cleanText(cells[0]);
    const abbr = TEAM_ABBR_MAP[teamName];
    if (!abbr) continue;
    
    stats.push({
      team: teamName,
      teamAbbr: abbr,
      goaltending: {
        starterName: 'Unknown',
        GSAx: parseFloat(cells[5]) || 0,
        savePct: parseFloat(cells[6]) || 0.900,
        xSavePct: 0.900,
        qualityStartsPct: 0.5,
      },
      source: 'moneypuck',
      fetchedAt: new Date().toISOString(),
    });
  }
  
  console.log(`✅ [MP] ${stats.length} équipes parsées (HTML)`);
  return stats;
}

// ===== NHL.COM API (Official Stats) =====

/**
 * Récupère les stats officielles NHL (Special Teams, Standings)
 */
async function fetchNHLApiStats(): Promise<Partial<ProTeamStats>[]> {
  console.log('🏒 [NHL] Fetching NHL API...');
  
  try {
    // Standings
    const standingsUrl = 'https://statsapi.web.nhl.com/api/v1/standings/byLeague';
    const standingsRes = await fetch(standingsUrl, { next: { revalidate: 3600 } });
    const standingsData = await standingsRes.json();
    
    // Team stats (PP%, PK%)
    const statsUrl = 'https://statsapi.web.nhl.com/api/v1/teams?expand=team.stats';
    const statsRes = await fetch(statsUrl, { next: { revalidate: 3600 } });
    const statsData = await statsRes.json();
    
    const stats: Partial<ProTeamStats>[] = [];
    
    // Merger standings et stats
    const teamStatsMap = new Map<string, any>();
    if (statsData.teams) {
      for (const team of statsData.teams) {
        const abbr = team.abbreviation;
        const teamStats = team.teamStats?.[0]?.splits?.[0]?.stat || {};
        teamStatsMap.set(abbr, teamStats);
      }
    }
    
    if (standingsData.records) {
      for (const record of standingsData.records) {
        for (const teamRecord of record.teamRecords || []) {
          const team = teamRecord.team;
          const abbr = team.abbreviation;
          const teamStats = teamStatsMap.get(abbr) || {};
          
          stats.push({
            team: team.name,
            teamAbbr: abbr,
            specialTeams: {
              powerPlayPct: teamStats.powerPlayPercentage || 20,
              penaltyKillPct: teamStats.penaltyKillPercentage || 80,
              netSpecialTeams: (teamStats.powerPlayPercentage || 20) - (100 - (teamStats.penaltyKillPercentage || 80)),
            },
            standing: {
              position: teamRecord.divisionRank || 16,
              points: teamRecord.points || 0,
              gamesPlayed: teamRecord.gamesPlayed || 0,
              wildcard: teamRecord.wildCardRank > 0,
              divisionRank: parseInt(teamRecord.divisionRank) || 16,
            },
            source: 'nhl_api',
            fetchedAt: new Date().toISOString(),
          });
        }
      }
    }
    
    console.log(`✅ [NHL] ${stats.length} équipes récupérées`);
    return stats;
    
  } catch (error) {
    console.error('❌ [NHL] Erreur:', error);
    return [];
  }
}

// ===== GOALIE STATS (Natural Stat Trick Goalies) =====

/**
 * Scrape les stats des gardiens (GSAx)
 */
async function scrapeGoalieStats(): Promise<Map<string, any>> {
  console.log('🧤 [G] Scraping Goalie Stats...');
  
  try {
    const zai = await initZAI();
    
    const url = 'https://www.naturalstattrick.com/playerteams.php?season=20242025&stype=2&sit=all&score=all&stdoi=goalie';
    
    const result = await zai.functions.invoke('page_reader', { url });
    
    if (!result.data?.html) {
      throw new Error('No HTML content');
    }
    
    const goalies = parseGoalieTable(result.data.html);
    
    // Garder le meilleur par équipe
    const byTeam = new Map<string, any>();
    for (const goalie of goalies) {
      const existing = byTeam.get(goalie.team);
      if (!existing || goalie.gamesPlayed > existing.gamesPlayed) {
        byTeam.set(goalie.team, goalie);
      }
    }
    
    console.log(`✅ [G] ${byTeam.size} gardiens titulaires`);
    return byTeam;
    
  } catch (error) {
    console.error('❌ [G] Erreur:', error);
    return new Map();
  }
}

/**
 * Parse le tableau des gardiens
 */
function parseGoalieTable(html: string): any[] {
  const goalies: any[] = [];
  
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells = extractCells(rowMatch[1]);
    if (cells.length < 10) continue;
    
    const teamName = cleanText(cells[1]);
    const abbr = TEAM_ABBR_MAP[teamName];
    if (!abbr) continue;
    
    goalies.push({
      name: cleanText(cells[0]),
      team: abbr,
      gamesPlayed: parseInt(cells[2]) || 0,
      savePct: parseFloat(cells[7]) || 0.900,
      gaa: parseFloat(cells[6]) || 3.0,
      GSAx: parseFloat(cells[15]) || 0, // Goals Saved Above Expected
    });
  }
  
  return goalies;
}

// ===== HELPER FUNCTIONS =====

function extractCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let cellMatch;
  
  while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
    cells.push(cleanText(cellMatch[1]));
  }
  
  return cells;
}

function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculatePowerRating(xGFPercent: number, HDCFPercent: number, PDO: number): number {
  // Normaliser les valeurs
  const xGFNorm = (xGFPercent - 40) / 20;  // 40-60% -> 0-1
  const HDCNorm = (HDCFPercent - 40) / 20;
  const PDONorm = (PDO - 980) / 40;        // 980-1020 -> 0-1
  
  // Calcul pondéré
  const rating = 
    xGFNorm * POWER_RATING_WEIGHTS.xGFPercent +
    HDCNorm * POWER_RATING_WEIGHTS.HDCFPercent +
    PDONorm * POWER_RATING_WEIGHTS.PDO;
  
  // Convertir en score 0-100
  return Math.max(0, Math.min(100, Math.round((rating + 0.5) * 100)));
}

function interpretPDO(PDO: number): 'lucky' | 'normal' | 'unlucky' {
  if (PDO > PDO_THRESHOLDS.lucky) return 'lucky';
  if (PDO < PDO_THRESHOLDS.unlucky) return 'unlucky';
  return 'normal';
}

// ===== AGGREGATION =====

/**
 * Agrège toutes les sources de données
 */
export async function getProNHLStats(forceRefresh: boolean = false): Promise<Map<string, ProTeamStats>> {
  const now = Date.now();
  
  if (!forceRefresh && cachedProStats.size > 0 && (now - lastProScrapeTime) < PRO_SCRAPE_INTERVAL) {
    console.log('📦 Utilisation du cache Pro Stats');
    return cachedProStats;
  }
  
  console.log('🔄 Récupération des données PRO NHL...');
  
  // Récupérer toutes les sources en parallèle
  const [nstStats, mpStats, nhlStats, goalieStats] = await Promise.all([
    scrapeNSTTeamStats(),
    scrapeMoneyPuckStats(),
    fetchNHLApiStats(),
    scrapeGoalieStats(),
  ]);
  
  // Merger les données
  const aggregated = new Map<string, ProTeamStats>();
  
  // 1. Commencer avec NST (données de base)
  for (const stat of nstStats) {
    if (stat.teamAbbr) {
      aggregated.set(stat.teamAbbr, createDefaultProStats(stat.teamAbbr, stat.team || stat.teamAbbr));
    }
  }
  
  // 2. Enrichir avec chaque source
  for (const stat of nstStats) {
    if (!stat.teamAbbr) continue;
    const existing = aggregated.get(stat.teamAbbr);
    if (existing && stat.powerRating) {
      existing.powerRating = stat.powerRating;
      existing.fiveOnFive = stat.fiveOnFive || existing.fiveOnFive;
      existing.source = 'naturalstattrick';
    }
  }
  
  for (const stat of mpStats) {
    if (!stat.teamAbbr) continue;
    const existing = aggregated.get(stat.teamAbbr);
    if (existing && stat.goaltending) {
      existing.goaltending = stat.goaltending;
      existing.source = existing.source.includes('moneypuck') ? existing.source : `${existing.source},moneypuck`;
    }
  }
  
  for (const stat of nhlStats) {
    if (!stat.teamAbbr) continue;
    const existing = aggregated.get(stat.teamAbbr);
    if (existing) {
      if (stat.specialTeams) existing.specialTeams = stat.specialTeams;
      if (stat.standing) existing.standing = stat.standing;
      existing.source = existing.source.includes('nhl_api') ? existing.source : `${existing.source},nhl_api`;
    }
  }
  
  // 3. Ajouter les gardiens
  for (const [teamAbbr, goalie] of goalieStats) {
    const existing = aggregated.get(teamAbbr);
    if (existing) {
      existing.goaltending = {
        starterName: goalie.name,
        GSAx: goalie.GSAx || 0,
        savePct: goalie.savePct || 0.900,
        xSavePct: 0.900,
        qualityStartsPct: 0.5,
      };
    }
  }
  
  // Mettre à jour le cache
  cachedProStats = aggregated;
  lastProScrapeTime = now;
  
  console.log(`✅ Pro Stats agrégées: ${aggregated.size} équipes`);
  
  return aggregated;
}

/**
 * Crée des stats par défaut
 */
function createDefaultProStats(abbr: string, name: string): ProTeamStats {
  return {
    team: name,
    teamAbbr: abbr,
    powerRating: {
      overall: 50,
      xGFPercent: 50,
      HDCFPercent: 50,
      PDO: 1000,
      luckFactor: 'normal',
    },
    fiveOnFive: {
      xGFPer60: 3.0,
      xGAPer60: 3.0,
      GFPer60: 3.0,
      GAPer60: 3.0,
      CFPer60: 60,
      CAPer60: 60,
      HDfPer60: 10,
      HDaPer60: 10,
    },
    last10: {
      xGFPercent: 50,
      HDCFPercent: 50,
      PDO: 1000,
      record: '5-5-0',
      points: 10,
      trend: 'normal',
    },
    specialTeams: {
      powerPlayPct: 20,
      penaltyKillPct: 80,
      netSpecialTeams: 0,
    },
    goaltending: {
      starterName: 'Unknown',
      GSAx: 0,
      savePct: 0.900,
      xSavePct: 0.900,
      qualityStartsPct: 0.5,
    },
    situational: {
      homeAdvantage: 0.05,
      restDays: 2,
      isBackToBack: false,
      gamesInLast7Days: 2,
      travelDistance: 0,
    },
    gamesPlayed: 0,
    standing: {
      position: 16,
      points: 0,
      gamesPlayed: 0,
      wildcard: false,
      divisionRank: 16,
    },
    fetchedAt: new Date().toISOString(),
    source: 'fallback',
  };
}

/**
 * Récupère les stats d'une équipe
 */
export async function getTeamProStats(abbr: string): Promise<ProTeamStats | null> {
  const allStats = await getProNHLStats();
  return allStats.get(abbr) || null;
}

// ===== MATCHUP ANALYSIS =====

/**
 * Analyse complète d'un matchup
 * Implémente la formule PRO
 */
export async function analyzeMatchup(
  homeTeamAbbr: string,
  awayTeamAbbr: string,
  oddsHome: number = 1.9,
  oddsAway: number = 1.9
): Promise<MatchupAnalysis | null> {
  const allStats = await getProNHLStats();
  
  const homeStats = allStats.get(homeTeamAbbr);
  const awayStats = allStats.get(awayTeamAbbr);
  
  if (!homeStats || !awayStats) {
    console.error('Stats non disponibles pour le matchup');
    return null;
  }
  
  // ===== CALCUL DES SCORES PROJETÉS =====
  
  // Étape A: Force de frappe (5v5)
  const attackHome = (homeStats.fiveOnFive.xGFPer60 + awayStats.fiveOnFive.xGAPer60) / 2;
  const attackAway = (awayStats.fiveOnFive.xGFPer60 + homeStats.fiveOnFive.xGAPer60) / 2;
  
  // Étape B: Ajustement Gardien (GSAx)
  const goalieAdjHome = homeStats.goaltending.GSAx * GOALIE_IMPACT / 10;
  const goalieAdjAway = awayStats.goaltending.GSAx * GOALIE_IMPACT / 10;
  
  // Étape C: Avantage Glace
  const homeIceBonus = HOME_ICE_BONUS;
  
  // Étape D: Special Teams
  const specialTeamsAdj = calculateSpecialTeamsAdjustment(homeStats, awayStats);
  
  // Score projeté final
  const projectedHomeGoals = attackHome + goalieAdjHome + homeIceBonus + (specialTeamsAdj / 2);
  const projectedAwayGoals = attackAway + goalieAdjAway - (specialTeamsAdj / 2);
  
  // ===== PROBABILITÉS =====
  
  // Convertir en probabilités via Poisson
  const { homeWinProb, awayWinProb, drawProb } = calculateWinProbabilities(
    projectedHomeGoals,
    projectedAwayGoals
  );
  
  // ===== FACTEURS CLÉS =====
  
  const powerRatingDiff = homeStats.powerRating.overall - awayStats.powerRating.overall;
  const xGDiff = homeStats.powerRating.xGFPercent - awayStats.powerRating.xGFPercent;
  const HDCDiff = homeStats.powerRating.HDCFPercent - awayStats.powerRating.HDCFPercent;
  
  const PDOI = {
    home: {
      value: homeStats.powerRating.PDO,
      status: homeStats.powerRating.luckFactor,
    },
    away: {
      value: awayStats.powerRating.PDO,
      status: awayStats.powerRating.luckFactor,
    },
  };
  
  const goalieEdge = homeStats.goaltending.GSAx - awayStats.goaltending.GSAx;
  const specialTeamsEdge = homeStats.specialTeams.netSpecialTeams - awayStats.specialTeams.netSpecialTeams;
  const fatigueEdge = calculateFatigueEdge(homeStats, awayStats);
  
  // ===== VALUE BET DETECTION =====
  
  const impliedHome = 1 / oddsHome;
  const impliedAway = 1 / oddsAway;
  
  const edgeHome = homeWinProb - impliedHome;
  const edgeAway = awayWinProb - impliedAway;
  
  let valueBet: MatchupAnalysis['insights']['valueBet'] = {
    detected: false,
    type: null,
    edge: 0,
    reasoning: '',
  };
  
  const threshold = 0.05;
  
  if (edgeHome > threshold) {
    valueBet = {
      detected: true,
      type: 'home',
      edge: edgeHome,
      reasoning: buildValueBetReasoning(homeTeamAbbr, homeStats, edgeHome),
    };
  } else if (edgeAway > threshold) {
    valueBet = {
      detected: true,
      type: 'away',
      edge: edgeAway,
      reasoning: buildValueBetReasoning(awayTeamAbbr, awayStats, edgeAway),
    };
  }
  
  // Kelly Criterion
  const kellyFraction = valueBet.detected 
    ? Math.max(0, valueBet.edge / (valueBet.type === 'home' ? oddsHome - 1 : oddsAway - 1))
    : 0;
  
  // Confiance
  const confidence = calculateConfidence(homeStats, awayStats);
  
  // Recommandation
  const recommendation = buildRecommendation(homeTeamAbbr, awayTeamAbbr, {
    homeWinProb,
    awayWinProb,
    projectedHomeGoals,
    projectedAwayGoals,
    powerRatingDiff,
    PDOI,
    valueBet,
  });
  
  // Data Quality
  const dataQuality: MatchupAnalysis['dataQuality'] = {
    homeStats: homeStats.source !== 'fallback' ? 'real' : 'fallback',
    awayStats: awayStats.source !== 'fallback' ? 'real' : 'fallback',
    homeGoalie: homeStats.goaltending.starterName !== 'Unknown' ? 'real' : 'fallback',
    awayGoalie: awayStats.goaltending.starterName !== 'Unknown' ? 'real' : 'fallback',
    overallScore: calculateDataQualityScore(homeStats, awayStats),
  };
  
  return {
    homeTeam: homeTeamAbbr,
    awayTeam: awayTeamAbbr,
    projected: {
      homeGoals: Math.round(projectedHomeGoals * 10) / 10,
      awayGoals: Math.round(projectedAwayGoals * 10) / 10,
      totalGoals: Math.round((projectedHomeGoals + projectedAwayGoals) * 10) / 10,
      homeWinProb: Math.round(homeWinProb * 1000) / 1000,
      awayWinProb: Math.round(awayWinProb * 1000) / 1000,
      drawProb: Math.round(drawProb * 1000) / 1000,
    },
    calculation: {
      attackHome: Math.round(attackHome * 100) / 100,
      attackAway: Math.round(attackAway * 100) / 100,
      goalieAdjHome: Math.round(goalieAdjHome * 100) / 100,
      goalieAdjAway: Math.round(goalieAdjAway * 100) / 100,
      homeIceBonus,
      specialTeamsAdj: Math.round(specialTeamsAdj * 100) / 100,
    },
    factors: {
      powerRatingDiff,
      xGDiff,
      HDCDiff,
      PDOI,
      goalieEdge,
      specialTeamsEdge,
      fatigueEdge,
    },
    insights: {
      valueBet,
      kellyFraction: Math.round(kellyFraction * 100) / 100,
      confidence,
      recommendation,
    },
    dataQuality,
  };
}

// ===== HELPER FUNCTIONS FOR ANALYSIS =====

function calculateSpecialTeamsAdjustment(home: ProTeamStats, away: ProTeamStats): number {
  // PP% de Home vs PK% de Away
  const homePPAdvantage = (home.specialTeams.powerPlayPct - (100 - away.specialTeams.penaltyKillPct)) / 100;
  // PP% de Away vs PK% de Home
  const awayPPAdvantage = (away.specialTeams.powerPlayPct - (100 - home.specialTeams.penaltyKillPct)) / 100;
  
  return (homePPAdvantage - awayPPAdvantage) * SPECIAL_TEAMS_IMPACT;
}

function calculateFatigueEdge(home: ProTeamStats, away: ProTeamStats): number {
  let edge = 0;
  
  // Back-to-back
  if (away.situational.isBackToBack && !home.situational.isBackToBack) {
    edge += 0.08;
  } else if (home.situational.isBackToBack && !away.situational.isBackToBack) {
    edge -= 0.08;
  }
  
  // Jours de repos
  edge += (home.situational.restDays - away.situational.restDays) * 0.01;
  
  return Math.round(edge * 100) / 100;
}

function calculateWinProbabilities(lambdaHome: number, lambdaAway: number): {
  homeWinProb: number;
  awayWinProb: number;
  drawProb: number;
} {
  const poisson = (k: number, lambda: number) => 
    Math.pow(lambda, k) * Math.exp(-lambda) / factorial(k);
  
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const p = poisson(h, lambdaHome) * poisson(a, lambdaAway);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }
  
  return { homeWinProb: homeWin, awayWinProb: awayWin, drawProb: draw };
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function buildValueBetReasoning(team: string, stats: ProTeamStats, edge: number): string {
  const reasons: string[] = [];
  
  if (stats.powerRating.xGFPercent > 52) {
    reasons.push(`xGF% élevé (${stats.powerRating.xGFPercent.toFixed(1)}%)`);
  }
  if (stats.powerRating.luckFactor === 'unlucky') {
    reasons.push(`PDO bas (${stats.powerRating.PDO}) - régression positive attendue`);
  }
  if (stats.goaltending.GSAx > 5) {
    reasons.push(`GSAx positif (${stats.goaltending.GSAx.toFixed(1)})`);
  }
  
  return `${team}: ${reasons.join(', ')} (edge: ${(edge * 100).toFixed(1)}%)`;
}

function calculateConfidence(home: ProTeamStats, away: ProTeamStats): number {
  let confidence = 50;
  
  // Données de qualité
  if (home.source !== 'fallback' && away.source !== 'fallback') {
    confidence += 20;
  }
  
  // Écart de talent clair
  const ratingDiff = Math.abs(home.powerRating.overall - away.powerRating.overall);
  confidence += Math.min(15, ratingDiff / 5);
  
  // PDO extrêmes (régression prévisible)
  if (home.powerRating.luckFactor !== 'normal' || away.powerRating.luckFactor !== 'normal') {
    confidence += 10;
  }
  
  return Math.min(95, Math.max(40, Math.round(confidence)));
}

function calculateDataQualityScore(home: ProTeamStats, away: ProTeamStats): number {
  let score = 0;
  
  // Sources
  const homeSources = home.source.split(',').length;
  const awaySources = away.source.split(',').length;
  score += Math.min(30, homeSources * 10 + awaySources * 10);
  
  // Goalie data
  if (home.goaltending.starterName !== 'Unknown') score += 10;
  if (away.goaltending.starterName !== 'Unknown') score += 10;
  
  // Stats complètes
  if (home.powerRating.xGFPercent !== 50) score += 10;
  if (away.powerRating.xGFPercent !== 50) score += 10;
  
  // Special teams
  if (home.specialTeams.powerPlayPct !== 20) score += 10;
  if (away.specialTeams.powerPlayPct !== 20) score += 10;
  
  return Math.min(100, score);
}

function buildRecommendation(
  home: string,
  away: string,
  data: any
): string {
  const { homeWinProb, projectedHomeGoals, projectedAwayGoals, PDOI, valueBet } = data;
  
  let rec = '';
  
  if (valueBet.detected) {
    rec = `📌 VALUE BET: ${valueBet.type === 'home' ? home : away} (${(valueBet.edge * 100).toFixed(1)}% edge)\n`;
  }
  
  rec += `📊 Score projeté: ${home} ${projectedHomeGoals.toFixed(1)} - ${projectedAwayGoals.toFixed(1)} ${away}\n`;
  
  // PDO insight
  if (PDOI.home.status === 'lucky') {
    rec += `⚠️ ${home} surperforme (PDO ${PDOI.home.value}) - régression attendue\n`;
  } else if (PDOI.home.status === 'unlucky') {
    rec += `📈 ${home} sous-performe (PDO ${PDOI.home.value}) - rebond possible\n`;
  }
  
  if (PDOI.away.status === 'lucky') {
    rec += `⚠️ ${away} surperforme (PDO ${PDOI.away.value}) - régression attendue\n`;
  } else if (PDOI.away.status === 'unlucky') {
    rec += `📈 ${away} sous-performe (PDO ${PDOI.away.value}) - rebond possible\n`;
  }
  
  return rec.trim();
}

// ===== EXPORT =====

export const NHLProService = {
  getProNHLStats,
  getTeamProStats,
  analyzeMatchup,
};

export default NHLProService;
