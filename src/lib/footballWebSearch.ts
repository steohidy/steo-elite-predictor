/**
 * Football Web Search - Actualités et infos Football via z-ai SDK
 */

import { zaiWebSearch, zaiPageReader, isZaiAvailable } from './zaiInit';

export interface FootballNewsItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface FootballTeamNews {
  team: string;
  news: FootballNewsItem[];
  injuries: string[];
  lastUpdated: string;
}

// Cache (15 min)
const newsCache = new Map<string, { data: FootballTeamNews; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000;

/**
 * Recherche les actualités d'une équipe de football
 */
export async function searchFootballTeamNews(teamName: string): Promise<FootballTeamNews> {
  const cached = newsCache.get(teamName);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const result: FootballTeamNews = {
    team: teamName,
    news: [],
    injuries: [],
    lastUpdated: new Date().toISOString(),
  };

  if (!(await isZaiAvailable())) {
    console.log('⚠️ z-ai SDK non disponible pour Football news');
    return result;
  }

  try {
    // Recherche actualités
    const newsSearch = await zaiWebSearch(`${teamName} football news today`, 5);

    if (newsSearch.success) {
      result.news = newsSearch.results.map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        source: new URL(item.url).hostname,
      }));
    }

    // Recherche blessures
    const injurySearch = await zaiWebSearch(`${teamName} injury news today`, 3);

    if (injurySearch.success) {
      for (const item of injurySearch.results) {
        const snippetLower = item.snippet.toLowerCase();
        if (snippetLower.includes('injur') ||
            snippetLower.includes('sidelined') ||
            snippetLower.includes('ruled out') ||
            snippetLower.includes('doubt')) {
          result.injuries.push(item.snippet);
        }
      }
    }

    newsCache.set(teamName, { data: result, timestamp: Date.now() });
    console.log(`✅ Football News: ${result.news.length} actualités pour ${teamName}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur recherche Football news:', error);
    return result;
  }
}

/**
 * Recherche les actualités d'un matchup Football
 */
export async function searchFootballMatchupNews(
  homeTeam: string,
  awayTeam: string,
  league?: string
): Promise<{
  homeNews: FootballNewsItem[];
  awayNews: FootballNewsItem[];
  matchupAnalysis: string;
  predictedLineups?: string;
}> {
  const result = {
    homeNews: [] as FootballNewsItem[],
    awayNews: [] as FootballNewsItem[],
    matchupAnalysis: '',
    predictedLineups: undefined as string | undefined,
  };

  if (!(await isZaiAvailable())) {
    return result;
  }

  try {
    const leagueStr = league ? ` ${league}` : '';

    const [homeData, awayData, matchupSearch, lineupSearch] = await Promise.all([
      searchFootballTeamNews(homeTeam),
      searchFootballTeamNews(awayTeam),
      zaiWebSearch(`${homeTeam} vs ${awayTeam}${leagueStr} preview prediction`, 3),
      zaiWebSearch(`${homeTeam} vs ${awayTeam} predicted lineup team news`, 2),
    ]);

    result.homeNews = homeData.news.slice(0, 3);
    result.awayNews = awayData.news.slice(0, 3);

    if (matchupSearch.success && matchupSearch.results.length > 0) {
      result.matchupAnalysis = matchupSearch.results[0].snippet;
    }

    if (lineupSearch.success && lineupSearch.results.length > 0) {
      result.predictedLineups = lineupSearch.results[0].snippet;
    }

    return result;

  } catch (error) {
    console.error('❌ Erreur recherche matchup football:', error);
    return result;
  }
}

/**
 * Récupère les blessures d'une équipe
 */
export async function getTeamInjuries(teamName: string): Promise<{
  success: boolean;
  injuries: Array<{ player: string; injury: string }>;
}> {
  if (!(await isZaiAvailable())) {
    return { success: false, injuries: [] };
  }

  try {
    const search = await zaiWebSearch(`${teamName} injuries transfermarkt 2025`, 3);

    if (!search.success || search.results.length === 0) {
      return { success: false, injuries: [] };
    }

    for (const item of search.results) {
      if (item.url.includes('transfermarkt')) {
        const pageContent = await zaiPageReader(item.url);

        if (pageContent.success && pageContent.content) {
          const injuries: Array<{ player: string; injury: string }> = [];

          const lines = pageContent.content.split('\n');
          for (const line of lines) {
            if (line.toLowerCase().includes('injur') || line.toLowerCase().includes('sidelined')) {
              injuries.push({
                player: line.substring(0, 50),
                injury: 'Injury',
              });
            }
          }

          if (injuries.length > 0) {
            return { success: true, injuries: injuries.slice(0, 5) };
          }
        }
      }
    }

    return { success: false, injuries: [] };

  } catch (error) {
    console.error('❌ Erreur récupération blessures:', error);
    return { success: false, injuries: [] };
  }
}

/**
 * Recherche les transferts
 */
export async function searchTransferNews(teamName?: string): Promise<FootballNewsItem[]> {
  if (!(await isZaiAvailable())) {
    return [];
  }

  try {
    const query = teamName
      ? `${teamName} transfer news today`
      : 'football transfer news today';

    const search = await zaiWebSearch(query, 5);

    if (search.success) {
      return search.results.map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        source: new URL(item.url).hostname,
      }));
    }

    return [];

  } catch (error) {
    console.error('❌ Erreur recherche transferts:', error);
    return [];
  }
}

const FootballWebSearch = {
  searchFootballTeamNews,
  searchFootballMatchupNews,
  getTeamInjuries,
  searchTransferNews,
};

export default FootballWebSearch;
