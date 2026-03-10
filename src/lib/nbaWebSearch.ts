/**
 * NBA Web Search - Actualités et infos NBA via z-ai SDK
 */

import { zaiWebSearch, zaiPageReader, isZaiAvailable } from './zaiInit';

export interface NBANewsItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface NBATeamNews {
  team: string;
  news: NBANewsItem[];
  injuries: string[];
  lastUpdated: string;
}

// Cache (15 min)
const newsCache = new Map<string, { data: NBATeamNews; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000;

/**
 * Recherche les actualités d'une équipe NBA
 */
export async function searchNBATeamNews(teamName: string): Promise<NBATeamNews> {
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

  if (!(await isZaiAvailable())) {
    console.log('⚠️ z-ai SDK non disponible pour NBA news');
    return result;
  }

  try {
    // Recherche actualités
    const newsSearch = await zaiWebSearch(`${teamName} NBA news today 2025`, 5);

    if (newsSearch.success) {
      result.news = newsSearch.results.map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        source: new URL(item.url).hostname,
      }));
    }

    // Recherche blessures
    const injurySearch = await zaiWebSearch(`${teamName} NBA injury report today`, 3);

    if (injurySearch.success) {
      for (const item of injurySearch.results) {
        const snippetLower = item.snippet.toLowerCase();
        if (snippetLower.includes('injur') ||
            snippetLower.includes('out') ||
            snippetLower.includes('questionable')) {
          result.injuries.push(item.snippet);
        }
      }
    }

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

  if (!(await isZaiAvailable())) {
    return result;
  }

  try {
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
  injuries: Array<{ team: string; players: string[] }>;
}> {
  if (!(await isZaiAvailable())) {
    return { success: false, injuries: [] };
  }

  try {
    const search = await zaiWebSearch('NBA injury report today all teams', 5);

    if (!search.success) {
      return { success: false, injuries: [] };
    }

    const injuries: Array<{ team: string; players: string[] }> = [];

    for (const item of search.results) {
      const pageContent = await zaiPageReader(item.url);

      if (pageContent.success && pageContent.content) {
        const playerMatches = pageContent.content.match(/[A-Z][a-z]+ [A-Z][a-z]+ \((out|questionable|probable)\)/gi);

        if (playerMatches) {
          injuries.push({
            team: 'Unknown',
            players: playerMatches.slice(0, 5),
          });
        }
      }
    }

    return { success: injuries.length > 0, injuries };

  } catch (error) {
    console.error('❌ Erreur récupération blessures NBA:', error);
    return { success: false, injuries: [] };
  }
}

const NBAWebSearch = {
  searchNBATeamNews,
  searchNBAMatchupNews,
  getTodayNBAInjuries,
};

export default NBAWebSearch;
