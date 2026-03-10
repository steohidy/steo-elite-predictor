/**
 * NBA Web Search - Actualités et infos NBA via z-ai SDK
 * 
 * Fournit:
 * - Actualités récentes des équipes
 * - Infos sur les blessures
 * - Analyses pré-match
 */

import { zaiWebSearch, zaiPageReader, isZaiAvailable } from './zaiInit';

export interface NBANewsItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date?: string;
}

export interface NBATeamNews {
  team: string;
  news: NBANewsItem[];
  injuries: string[];
  lastUpdated: string;
}

// Cache des actualités (15 min)
const newsCache = new Map<string, { data: NBATeamNews; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000;

// Sources NBA fiables
const NBA_SOURCES = [
  'espn.com/nba',
  'nba.com',
  'bleacherreport.com/nba',
  'theathletic.com/nba',
  'cbssports.com/nba',
];

/**
 * Recherche les actualités d'une équipe NBA
 */
export async function searchNBATeamNews(teamName: string): Promise<NBATeamNews> {
  // Vérifier le cache
  const cached = newsCache.get(teamName);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const result: NBATeamNews = {
    team: teamName,
    news: [],
    injuries: [],
    lastUpdated: new Date().toISOString(),
  };

  // Vérifier si z-ai est disponible
  if (!isZaiAvailable()) {
    console.log('⚠️ z-ai SDK non disponible pour NBA news');
    return result;
  }

  try {
    // Recherche actualités récentes
    const newsQuery = `${teamName} NBA news today 2025`;
    const newsSearch = await zaiWebSearch(newsQuery, 5);

    if (newsSearch.success) {
      result.news = newsSearch.results.map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        source: new URL(item.url).hostname,
      }));
    }

    // Recherche blessures spécifiquement
    const injuryQuery = `${teamName} NBA injury report today`;
    const injurySearch = await zaiWebSearch(injuryQuery, 3);

    if (injurySearch.success) {
      for (const item of injurySearch.results) {
        // Extraire les infos de blessures du snippet
        if (item.snippet.toLowerCase().includes('injur') || 
            item.snippet.toLowerCase().includes('out') ||
            item.snippet.toLowerCase().includes('questionable')) {
          result.injuries.push(item.snippet);
        }
      }
    }

    // Mettre en cache
    newsCache.set(teamName, { data: result, timestamp: Date.now() });

    console.log(`✅ NBA News: ${result.news.length} actualités pour ${teamName}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur recherche NBA news:', error);
    return result;
  }
}

/**
 * Recherche les actualités d'un matchup NBA
 */
export async function searchNBAMatchupNews(
  homeTeam: string, 
  awayTeam: string
): Promise<{
  homeNews: NBANewsItem[];
  awayNews: NBANewsItem[];
  matchupAnalysis: string;
}> {
  const result = {
    homeNews: [] as NBANewsItem[],
    awayNews: [] as NBANewsItem[],
    matchupAnalysis: '',
  };

  if (!isZaiAvailable()) {
    return result;
  }

  try {
    // Recherches en parallèle
    const [homeData, awayData, matchupSearch] = await Promise.all([
      searchNBATeamNews(homeTeam),
      searchNBATeamNews(awayTeam),
      zaiWebSearch(`${homeTeam} vs ${awayTeam} prediction today`, 3),
    ]);

    result.homeNews = homeData.news.slice(0, 3);
    result.awayNews = awayData.news.slice(0, 3);

    if (matchupSearch.success && matchupSearch.results.length > 0) {
      result.matchupAnalysis = matchupSearch.results[0].snippet;
    }

    return result;

  } catch (error) {
    console.error('❌ Erreur recherche matchup:', error);
    return result;
  }
}

/**
 * Récupère les blessures NBA du jour
 */
export async function getTodayNBAInjuries(): Promise<{
  success: boolean;
  injuries: Array<{
    team: string;
    players: string[];
  }>;
}> {
  if (!isZaiAvailable()) {
    return { success: false, injuries: [] };
  }

  try {
    const search = await zaiWebSearch('NBA injury report today all teams', 5);

    if (!search.success) {
      return { success: false, injuries: [] };
    }

    // Parser les résultats pour extraire les blessures
    const injuries: Array<{ team: string; players: string[] }> = [];

    for (const item of search.results) {
      // Essayer de lire la page pour plus de détails
      const pageContent = await zaiPageReader(item.url);
      
      if (pageContent.success && pageContent.content) {
        // Extraction basique des noms de joueurs blessés
        const playerMatches = pageContent.content.match(/[A-Z][a-z]+ [A-Z][a-z]+ \((out|questionable|probable)\)/gi);
        
        if (playerMatches) {
          // Assigner à une équipe si possible
          injuries.push({
            team: 'Unknown',
            players: playerMatches.slice(0, 5),
          });
        }
      }
    }

    return {
      success: injuries.length > 0,
      injuries,
    };

  } catch (error) {
    console.error('❌ Erreur récupération blessures NBA:', error);
    return { success: false, injuries: [] };
  }
}

/**
 * Recherche les stats récentes d'un joueur NBA
 */
export async function searchNBAPlayerStats(playerName: string): Promise<{
  success: boolean;
  stats: {
    lastGame?: string;
    avgPoints?: number;
    news?: string;
  };
}> {
  if (!isZaiAvailable()) {
    return { success: false, stats: {} };
  }

  try {
    const search = await zaiWebSearch(`${playerName} NBA stats 2025`, 3);

    if (search.success && search.results.length > 0) {
      return {
        success: true,
        stats: {
          news: search.results[0].snippet,
        },
      };
    }

    return { success: false, stats: {} };

  } catch (error) {
    console.error('❌ Erreur recherche stats joueur:', error);
    return { success: false, stats: {} };
  }
}

// Export par défaut
const NBAWebSearch = {
  searchNBATeamNews,
  searchNBAMatchupNews,
  getTodayNBAInjuries,
  searchNBAPlayerStats,
};

export default NBAWebSearch;
