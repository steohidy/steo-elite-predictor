/**
 * SERVICE DE COTES RÉELLES - Connexion aux bookmakers
 * 
 * Sources:
 * - TheOddsAPI: Cotes de bookmakers (gratuit 500 req/mois)
 * - OddsPortal: Scraping (fallback)
 * - BetExplorer: Scraping historique
 */

// ===== TYPES =====

export interface RealOdds {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  bookmaker: string;
  
  // Cotes d'ouverture
  openingOdds: {
    home: number;
    draw: number;
    away: number;
    timestamp: string;
  };
  
  // Cotes de clôture (juste avant le match)
  closingOdds: {
    home: number;
    draw: number;
    away: number;
    timestamp: string;
  };
  
  // Mouvement des cotes
  oddsMovement: {
    home: number;  // % de changement
    draw: number;
    away: number;
  };
  
  // Marges du bookmaker
  margin: number;
  
  // Source
  source: string;
  fetchedAt: string;
}

export interface OddsComparison {
  matchId: string;
  averageOdds: { home: number; draw: number; away: number };
  bestOdds: { home: number; draw: number; away: number; bookmaker: string };
  oddsByBookmaker: { bookmaker: string; home: number; draw: number; away: number }[];
}

// ===== CONFIGURATION =====

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY || '';
const THE_ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Rate limiting
let requestCount = 0;
const MAX_REQUESTS_PER_MONTH = 500;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 secondes entre requêtes

// ===== FONCTIONS PRINCIPALES =====

/**
 * Récupère les cotes actuelles depuis TheOddsAPI
 */
export async function fetchCurrentOdds(sport: string = 'soccer_epl'): Promise<OddsComparison[]> {
  if (!THE_ODDS_API_KEY) {
    console.log('⚠️ THE_ODDS_API_KEY non configurée');
    return [];
  }
  
  // Rate limiting
  await enforceRateLimit();
  
  try {
    const url = `${THE_ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${THE_ODDS_API_KEY}&regions=uk,eu&markets=h2h&oddsFormat=decimal`;
    
    const response = await fetch(url, { next: { revalidate: 300 } }); // Cache 5 min
    
    if (!response.ok) {
      console.error(`❌ TheOddsAPI error: ${response.status}`);
      return [];
    }
    
    requestCount++;
    const data = await response.json();
    
    // Parser les résultats
    const comparisons: OddsComparison[] = [];
    
    for (const match of data) {
      const homeTeam = match.home_team;
      const awayTeam = match.away_team;
      
      // Collecter les cotes par bookmaker
      const oddsByBookmaker: { bookmaker: string; home: number; draw: number; away: number }[] = [];
      
      for (const bookmaker of match.bookmakers || []) {
        const h2h = bookmaker.markets?.find((m: any) => m.key === 'h2h');
        if (!h2h) continue;
        
        const outcomes = h2h.outcomes || [];
        const homeOdd = outcomes.find((o: any) => o.name === homeTeam)?.price || 0;
        const awayOdd = outcomes.find((o: any) => o.name === awayTeam)?.price || 0;
        const drawOdd = outcomes.find((o: any) => o.name === 'Draw')?.price || 0;
        
        if (homeOdd > 0 && awayOdd > 0) {
          oddsByBookmaker.push({
            bookmaker: bookmaker.title,
            home: homeOdd,
            draw: drawOdd || calculateDrawOdds(homeOdd, awayOdd),
            away: awayOdd
          });
        }
      }
      
      if (oddsByBookmaker.length === 0) continue;
      
      // Calculer les moyennes et meilleures cotes
      const avgHome = oddsByBookmaker.reduce((sum, b) => sum + b.home, 0) / oddsByBookmaker.length;
      const avgDraw = oddsByBookmaker.reduce((sum, b) => sum + b.draw, 0) / oddsByBookmaker.length;
      const avgAway = oddsByBookmaker.reduce((sum, b) => sum + b.away, 0) / oddsByBookmaker.length;
      
      const bestHome = oddsByBookmaker.reduce((best, b) => b.home > best.home ? b : best);
      const bestAway = oddsByBookmaker.reduce((best, b) => b.away > best.away ? b : best);
      const bestDraw = oddsByBookmaker.reduce((best, b) => b.draw > best.draw ? b : best);
      
      comparisons.push({
        matchId: match.id,
        averageOdds: { home: avgHome, draw: avgDraw, away: avgAway },
        bestOdds: { 
          home: bestHome.home, 
          draw: bestDraw.draw, 
          away: bestAway.away, 
          bookmaker: `${bestHome.bookmaker}/${bestAway.bookmaker}` 
        },
        oddsByBookmaker
      });
    }
    
    console.log(`✅ Récupéré ${comparisons.length} matchs avec cotes réelles`);
    return comparisons;
    
  } catch (error) {
    console.error('❌ Erreur fetchCurrentOdds:', error);
    return [];
  }
}

/**
 * Récupère les cotes historiques depuis BetExplorer
 */
export async function fetchHistoricalOdds(
  homeTeam: string,
  awayTeam: string,
  date: string
): Promise<RealOdds | null> {
  try {
    // Utiliser le service de scraping BetExplorer
    const { betExplorerService } = await import('./betExplorerService');
    
    const odds = await betExplorerService.getMatchOdds(homeTeam, awayTeam, date);
    
    if (!odds) return null;
    
    return {
      matchId: `${homeTeam}_${awayTeam}_${date}`,
      homeTeam,
      awayTeam,
      bookmaker: 'Average',
      openingOdds: {
        home: odds.opening?.home || odds.home,
        draw: odds.opening?.draw || odds.draw,
        away: odds.opening?.away || odds.away,
        timestamp: `${date}T00:00:00Z`
      },
      closingOdds: {
        home: odds.closing?.home || odds.home,
        draw: odds.closing?.draw || odds.draw,
        away: odds.closing?.away || odds.away,
        timestamp: `${date}T23:59:59Z`
      },
      oddsMovement: {
        home: odds.opening?.home ? ((odds.closing?.home || odds.home) - odds.opening.home) / odds.opening.home * 100 : 0,
        draw: odds.opening?.draw ? ((odds.closing?.draw || odds.draw) - odds.opening.draw) / odds.opening.draw * 100 : 0,
        away: odds.opening?.away ? ((odds.closing?.away || odds.away) - odds.opening.away) / odds.opening.away * 100 : 0
      },
      margin: calculateBookmakerMargin(odds.home, odds.draw || calculateDrawOdds(odds.home, odds.away), odds.away),
      source: 'betexplorer',
      fetchedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Erreur fetchHistoricalOdds:', error);
    return null;
  }
}

/**
 * Calcule la marge du bookmaker
 */
function calculateBookmakerMargin(homeOdds: number, drawOdds: number, awayOdds: number): number {
  if (!homeOdds || !drawOdds || !awayOdds) return 0;
  const impliedProb = (1 / homeOdds) + (1 / drawOdds) + (1 / awayOdds);
  return (impliedProb - 1) * 100; // En pourcentage
}

/**
 * Estime la cote du match nul si non disponible
 */
function calculateDrawOdds(homeOdds: number, awayOdds: number): number {
  // Approximation basée sur la différence de cotes
  const diff = Math.abs(homeOdds - awayOdds);
  const base = 3.3;
  return base - (diff * 0.3); // Plus la différence est grande, plus le nul est probable
}

/**
 * Rate limiting
 */
async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Vérifie le statut de l'API
 */
export function getOddsAPIStatus(): {
  configured: boolean;
  requestsRemaining: number;
  requestsUsed: number;
} {
  return {
    configured: !!THE_ODDS_API_KEY,
    requestsRemaining: MAX_REQUESTS_PER_MONTH - requestCount,
    requestsUsed: requestCount
  };
}

// ===== SPORTS SUPPORTÉS =====

export const SUPPORTED_SPORTS = [
  { id: 'soccer_epl', name: 'Premier League' },
  { id: 'soccer_la_liga', name: 'La Liga' },
  { id: 'soccer_bundesliga', name: 'Bundesliga' },
  { id: 'soccer_serie_a', name: 'Serie A' },
  { id: 'soccer_ligue_one', name: 'Ligue 1' },
  { id: 'soccer_champions_league', name: 'Champions League' },
  { id: 'basketball_nba', name: 'NBA' }
];

export default {
  fetchCurrentOdds,
  fetchHistoricalOdds,
  getOddsAPIStatus,
  SUPPORTED_SPORTS
};
