/**
 * Football Web Search - Actualités et infos Football via z-ai SDK
 * 
 * Fournit:
 * - Actualités récentes des équipes
 * - Infos sur les blessures
 * - Analyses pré-match
 * - Transferts
 */

import { zaiWebSearch, zaiPageReader, isZaiAvailable } from './zaiInit';

export interface FootballNewsItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date?: string;
}

export interface FootballTeamNews {
  team: string;
  news: FootballNewsItem[];
  injuries: string[];
  form?: string;
  lastUpdated: string;
}

// Cache des actualités (15 min)
const newsCache = new Map<string, { data: FootballTeamNews; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000;

// Sources Football fiables
const FOOTBALL_SOURCES = [
  'bbc.com/sport/football',
  'skysports.com/football',
  'espn.com/soccer',
  'goal.com',
  'theathletic.com/football',
  'lequipe.fr',
  'marca.com',
  'kicker.de',
];

/**
 * Recherche les actualités d'une équipe de football
 */
export async function searchFootballTeamNews(teamName: string): Promise<FootballTeamNews> {
  // Vérifier le cache
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

  // Vérifier si z-ai est disponible
  if (!(await isZaiAvailable())) {
    console.log('⚠️ z-ai SDK non disponible pour Football news');
    return result;
  }

  try {
    // Recherche actualités récentes
    const newsQuery = `${teamName} football news today`;
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
    const injuryQuery = `${teamName} injury news today`;
    const injurySearch = await zaiWebSearch(injuryQuery, 3);

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

    // Mettre en cache
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
    
    // Recherches en parallèle
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
 * Récupère les blessures d'une équipe depuis Transfermarkt
 */
export async function getTeamInjuries(teamName: string): Promise<{
  success: boolean;
  injuries: Array<{
    player: string;
    injury: string;
    returnDate?: string;
  }>;
}> {
  if (!(await isZaiAvailable())) {
    return { success: false, injuries: [] };
  }

  try {
    const search = await zaiWebSearch(`${teamName} injuries transfermarkt 2025`, 3);

    if (!search.success || search.results.length === 0) {
      return { success: false, injuries: [] };
    }

    // Essayer de lire la page Transfermarkt
    for (const result of search.results) {
      if (result.url.includes('transfermarkt')) {
        const pageContent = await zaiPageReader(result.url);
        
        if (pageContent.success && pageContent.content) {
          // Extraction basique des infos de blessures
          const injuries: Array<{ player: string; injury: string; returnDate?: string }> = [];
          
          // Pattern simplifié pour extraire les blessés
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
 * Recherche les stats d'une équipe (forme, xG, etc.)
 */
export async function searchTeamStats(teamName: string): Promise<{
  success: boolean;
  form?: string;
  xG?: number;
  xGA?: number;
  news?: string;
}> {
  if (!(await isZaiAvailable())) {
    return { success: false };
  }

  try {
    const search = await zaiWebSearch(`${teamName} xG stats form 2025 fbref`, 3);

    if (search.success && search.results.length > 0) {
      return {
        success: true,
        news: search.results[0].snippet,
      };
    }

    return { success: false };

  } catch (error) {
    console.error('❌ Erreur recherche stats équipe:', error);
    return { success: false };
  }
}

/**
 * Récupère les dernières infos de transfert
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

// Export par défaut
const FootballWebSearch = {
  searchFootballTeamNews,
  searchFootballMatchupNews,
  getTeamInjuries,
  searchTeamStats,
  searchTransferNews,
};

export default FootballWebSearch;
