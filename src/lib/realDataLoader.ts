/**
 * Chargeur de données réelles pour l'apprentissage ML
 * 
 * Sources gratuites utilisées:
 * - ESPN API: NBA standings et résultats
 * - football-data.org: Statistiques football européen (gratuit)
 * - TheSportsDB: Résultats historiques (gratuit)
 */

import { getSupabaseAdmin, FootballMatch, BasketballMatch, generateMatchId } from './supabase';

// ===== CONFIGURATION =====

const FOOTBALL_DATA_API = process.env.FOOTBALL_DATA_API_KEY || '';
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

// Mapping des compétitions football-data.org
const COMPETITION_IDS: Record<string, string> = {
  'Premier League': 'PL',
  'La Liga': 'PD',
  'Bundesliga': 'BL1',
  'Serie A': 'SA',
  'Ligue 1': 'FL1',
  'Champions League': 'CL'
};

// ===== TYPES =====

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { name: string; id: number };
  awayTeam: { name: string; id: number };
  score: {
    fullTime: { home: number | null; away: number | null };
  };
  odds?: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
}

interface ESPNNBAGame {
  id: string;
  date: string;
  status: { type: { name: string } };
  competitions: Array<{
    competitors: Array<{
      homeAway: string;
      team: { displayName: string; abbreviation: string };
      score: string;
    }>;
  }>;
}

// ===== FONCTIONS FOOTBALL =====

/**
 * Récupère les matchs d'une compétition depuis football-data.org
 */
async function fetchFootballMatches(competition: string, season: number): Promise<FootballDataMatch[]> {
  const competitionCode = COMPETITION_IDS[competition];
  if (!competitionCode) {
    console.log(`⚠️ Compétition non supportée: ${competition}`);
    return [];
  }

  try {
    const url = `${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/matches?season=${season}`;
    
    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': FOOTBALL_DATA_API
      },
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      console.log(`⚠️ Football-data API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    console.log(`✅ ${competition} ${season}: ${data.matches?.length || 0} matchs`);
    
    return data.matches || [];
  } catch (error) {
    console.error(`❌ Erreur fetch ${competition}:`, error);
    return [];
  }
}

/**
 * Convertit les données football-data vers notre format
 */
function convertFootballMatch(match: FootballDataMatch, competition: string, season: string): FootballMatch | null {
  if (match.status !== 'FINISHED') return null;
  
  const homeScore = match.score.fullTime.home;
  const awayScore = match.score.fullTime.away;
  
  if (homeScore === null || awayScore === null) return null;
  
  const date = match.utcDate.split('T')[0];
  const homeTeam = match.homeTeam.name;
  const awayTeam = match.awayTeam.name;
  
  let result: 'H' | 'D' | 'A';
  if (homeScore > awayScore) result = 'H';
  else if (homeScore < awayScore) result = 'A';
  else result = 'D';
  
  return {
    id: generateMatchId(homeTeam, awayTeam, date),
    home_team: homeTeam,
    away_team: awayTeam,
    league_name: competition,
    season,
    match_date: date,
    home_score: homeScore,
    away_score: awayScore,
    result,
    odds_home: match.odds?.homeWin || undefined,
    odds_draw: match.odds?.draw || undefined,
    odds_away: match.odds?.awayWin || undefined,
    data_source: 'football-data.org'
  };
}

// ===== FONCTIONS NBA =====

/**
 * Récupère les résultats NBA depuis ESPN
 */
async function fetchNBAGames(season: number): Promise<ESPNNBAGame[]> {
  try {
    // ESPN utilise le format YYYY pour la saison (ex: 2024 pour 2024-25)
    const url = `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${season}`;
    
    const response = await fetch(url, {
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      console.log(`⚠️ ESPN NBA API error: ${response.status}`);
      return [];
    }

    // Pour les résultats, on utilise le scoreboard
    const scoreboardUrl = `https://site.api.espn.com/apis/v2/sports/basketball/nba/scoreboard?dates=20241001-20250415`;
    
    const scoreboardResponse = await fetch(scoreboardUrl, {
      next: { revalidate: 3600 }
    });

    if (!scoreboardResponse.ok) {
      console.log(`⚠️ ESPN Scoreboard error: ${scoreboardResponse.status}`);
      return [];
    }

    const data = await scoreboardResponse.json();
    const games = data.events || [];
    
    console.log(`✅ NBA ${season}: ${games.length} matchs`);
    return games;
  } catch (error) {
    console.error('❌ Erreur fetch NBA:', error);
    return [];
  }
}

/**
 * Convertit les données ESPN NBA vers notre format
 */
function convertNBAGame(game: ESPNNBAGame, season: string): BasketballMatch | null {
  if (game.status?.type?.name !== 'STATUS_FINAL') return null;
  
  const competition = game.competitions?.[0];
  if (!competition) return null;
  
  const homeCompetitor = competition.competitors.find((c: any) => c.homeAway === 'home');
  const awayCompetitor = competition.competitors.find((c: any) => c.homeAway === 'away');
  
  if (!homeCompetitor || !awayCompetitor) return null;
  
  const date = game.date.split('T')[0];
  const homeTeam = homeCompetitor.team.displayName;
  const awayTeam = awayCompetitor.team.displayName;
  const homeScore = parseInt(homeCompetitor.score) || 0;
  const awayScore = parseInt(awayCompetitor.score) || 0;
  
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const id = `${normalize(homeTeam)}_${normalize(awayTeam)}_${date}`;
  
  return {
    id,
    home_team: homeTeam,
    away_team: awayTeam,
    league_name: 'NBA',
    season,
    match_date: date,
    home_score: homeScore,
    away_score: awayScore,
    result: homeScore > awayScore ? 'H' : 'A',
    data_source: 'espn'
  };
}

// ===== FONCTION PRINCIPALE =====

/**
 * Charge les données réelles depuis les APIs
 */
export async function loadRealData(): Promise<{
  football: { loaded: number; errors: string[] };
  basketball: { loaded: number; errors: string[] };
}> {
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return {
      football: { loaded: 0, errors: ['Supabase non configuré'] },
      basketball: { loaded: 0, errors: ['Supabase non configuré'] }
    };
  }

  console.log('🚀 ===== CHARGEMENT DONNÉES RÉELLES =====');

  const result = {
    football: { loaded: 0, errors: [] as string[] },
    basketball: { loaded: 0, errors: [] as string[] }
  };

  // ===== FOOTBALL =====
  console.log('\n⚽ Chargement données Football...');
  
  const competitions = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'];
  const seasons = [2023, 2024]; // 2023-24 et 2024-25
  
  for (const competition of competitions) {
    for (const season of seasons) {
      try {
        const matches = await fetchFootballMatches(competition, season);
        
        const convertedMatches: FootballMatch[] = [];
        for (const match of matches) {
          const converted = convertFootballMatch(match, competition, `${season}-${season + 1}`);
          if (converted) convertedMatches.push(converted);
        }
        
        if (convertedMatches.length > 0) {
          const { error } = await adminClient
            .from('football_matches')
            .upsert(convertedMatches, { onConflict: 'id' });
          
          if (error) {
            result.football.errors.push(`${competition} ${season}: ${error.message}`);
          } else {
            result.football.loaded += convertedMatches.length;
            console.log(`   ✅ ${competition} ${season}: ${convertedMatches.length} matchs`);
          }
        }
        
        // Rate limiting: 10 req/min pour football-data.org
        await new Promise(resolve => setTimeout(resolve, 6000));
        
      } catch (error: any) {
        result.football.errors.push(`${competition} ${season}: ${error.message}`);
      }
    }
  }

  // ===== BASKETBALL (NBA) =====
  console.log('\n🏀 Chargement données NBA...');
  
  try {
    const games = await fetchNBAGames(2024);
    
    const convertedGames: BasketballMatch[] = [];
    for (const game of games) {
      const converted = convertNBAGame(game, '2024-2025');
      if (converted) convertedGames.push(converted);
    }
    
    if (convertedGames.length > 0) {
      const { error } = await adminClient
        .from('basketball_matches')
        .upsert(convertedGames, { onConflict: 'id' });
      
      if (error) {
        result.basketball.errors.push(`NBA: ${error.message}`);
      } else {
        result.basketball.loaded = convertedGames.length;
        console.log(`   ✅ NBA: ${convertedGames.length} matchs`);
      }
    }
  } catch (error: any) {
    result.basketball.errors.push(`NBA: ${error.message}`);
  }

  console.log('\n📊 ===== RÉSUMÉ =====');
  console.log(`⚽ Football: ${result.football.loaded} matchs chargés`);
  console.log(`🏀 Basketball: ${result.basketball.loaded} matchs chargés`);
  
  if (result.football.errors.length > 0) {
    console.log(`⚠️ Erreurs Football: ${result.football.errors.length}`);
  }
  if (result.basketball.errors.length > 0) {
    console.log(`⚠️ Erreurs Basketball: ${result.basketball.errors.length}`);
  }

  return result;
}

/**
 * Vérifie si une clé API football-data est configurée
 */
export function hasFootballDataAPI(): boolean {
  return !!FOOTBALL_DATA_API && FOOTBALL_DATA_API.length > 10;
}

export default {
  loadRealData,
  hasFootballDataAPI
};
