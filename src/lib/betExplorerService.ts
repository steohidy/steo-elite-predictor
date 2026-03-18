/**
 * BetExplorer Service - Scraping des cotes historiques
 * 
 * Récupère les cotes d'ouverture et de clôture depuis BetExplorer
 * Note: Usage personnel uniquement, respecter les conditions d'utilisation
 */

// ===== TYPES =====

export interface BetExplorerOdds {
  match: string;
  date: string;
  result: string;
  homeScore: number;
  awayScore: number;
  home: number;
  draw: number;
  away: number;
  opening?: {
    home: number;
    draw: number;
    away: number;
  };
  closing?: {
    home: number;
    draw: number;
    away: number;
  };
  bookmakers?: {
    name: string;
    home: number;
    draw: number;
    away: number;
  }[];
}

// ===== FONCTIONS =====

/**
 * Récupère les cotes d'un match depuis BetExplorer
 * Note: Cette fonction utilise une approche simplifiée
 * En production, utiliser une vraie API ou un scraper dédié
 */
export async function getMatchOdds(
  homeTeam: string,
  awayTeam: string,
  date: string
): Promise<BetExplorerOdds | null> {
  try {
    // Normaliser les noms d'équipes pour BetExplorer
    const normalizedHome = normalizeTeamName(homeTeam);
    const normalizedAway = normalizeTeamName(awayTeam);
    
    // URL BetExplorer (format: /matchs/match/equipe1-vs-equipe2/DATE/)
    const matchUrl = `https://www.betexplorer.com/matchs/match/${normalizedHome}-${normalizedAway}/${date.replace(/-/g, '')}/`;
    
    // Note: En production, implémenter le scraping ici
    // Pour l'instant, on retourne des données estimées basées sur les stats
    
    console.log(`📊 BetExplorer: Recherche cotes pour ${homeTeam} vs ${awayTeam} (${date})`);
    
    // Données estimées (à remplacer par vrai scraping)
    const estimatedOdds = estimateOddsFromTeams(homeTeam, awayTeam);
    
    return {
      match: `${homeTeam} vs ${awayTeam}`,
      date,
      result: '',
      homeScore: 0,
      awayScore: 0,
      home: estimatedOdds.home,
      draw: estimatedOdds.draw,
      away: estimatedOdds.away,
      opening: estimatedOdds.opening,
      closing: estimatedOdds.closing
    };
    
  } catch (error) {
    console.error('❌ Erreur BetExplorer:', error);
    return null;
  }
}

/**
 * Normalise le nom d'une équipe pour BetExplorer
 */
function normalizeTeamName(team: string): string {
  const replacements: Record<string, string> = {
    'Manchester City': 'manchester-city',
    'Manchester United': 'manchester-united',
    'Man City': 'manchester-city',
    'Man Utd': 'manchester-united',
    'Tottenham': 'tottenham',
    'Arsenal': 'arsenal',
    'Chelsea': 'chelsea',
    'Liverpool': 'liverpool',
    'Real Madrid': 'real-madrid',
    'Barcelona': 'barcelona',
    'Bayern Munich': 'bayern-munich',
    'PSG': 'paris-sg',
    'Paris Saint-Germain': 'paris-sg',
    'Inter Milan': 'inter',
    'Inter': 'inter',
    'AC Milan': 'milan',
    'Juventus': 'juventus',
    'Napoli': 'napoli',
    'Roma': 'roma',
    'Lazio': 'lazio',
    'Atletico Madrid': 'atletico-madrid',
    'Sevilla': 'sevilla',
    'Dortmund': 'dortmund',
    'RB Leipzig': 'rb-leipzig',
    'Bayer Leverkusen': 'leverkusen'
  };
  
  return replacements[team] || team.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Estime les cotes basées sur la force des équipes
 * Note: À remplacer par de vraies données
 */
function estimateOddsFromTeams(homeTeam: string, awayTeam: string): {
  home: number;
  draw: number;
  away: number;
  opening?: { home: number; draw: number; away: number };
  closing?: { home: number; draw: number; away: number };
} {
  // Force approximative des équipes (0-100)
  const teamStrength: Record<string, number> = {
    'Manchester City': 95,
    'Arsenal': 90,
    'Liverpool': 88,
    'Real Madrid': 92,
    'Barcelona': 88,
    'Bayern Munich': 90,
    'PSG': 88,
    'Inter': 85,
    'Juventus': 82,
    'Chelsea': 80,
    'Tottenham': 78,
    'Manchester United': 75,
    'Atletico Madrid': 82,
    'Dortmund': 80,
    'RB Leipzig': 78,
    'Napoli': 80,
    'Roma': 72,
    'Lazio': 70,
    'Sevilla': 72
  };
  
  const homeStrength = teamStrength[homeTeam] || 60;
  const awayStrength = teamStrength[awayTeam] || 60;
  
  // Avantage domicile: +10%
  const homeStrengthAdjusted = homeStrength + 10;
  
  // Calculer les probabilités
  const totalStrength = homeStrengthAdjusted + awayStrength + 25; // 25% pour le nul
  const homeProb = homeStrengthAdjusted / totalStrength;
  const drawProb = 25 / totalStrength;
  const awayProb = awayStrength / totalStrength;
  
  // Convertir en cotes (avec marge bookmaker ~5%)
  const margin = 1.05;
  const home = Math.round((1 / homeProb) * margin * 100) / 100;
  const draw = Math.round((1 / drawProb) * margin * 100) / 100;
  const away = Math.round((1 / awayProb) * margin * 100) / 100;
  
  // Simuler mouvement de cotes (ouverture vs clôture)
  const movement = (Math.random() - 0.5) * 0.1; // -5% à +5%
  
  return {
    home,
    draw,
    away,
    opening: {
      home: Math.round(home * (1 + movement) * 100) / 100,
      draw: Math.round(draw * (1 + movement * 0.5) * 100) / 100,
      away: Math.round(away * (1 - movement) * 100) / 100
    },
    closing: {
      home,
      draw,
      away
    }
  };
}

/**
 * Récupère les cotes historiques d'une ligue pour une saison
 */
export async function getLeagueHistoricalOdds(
  league: string,
  season: string
): Promise<BetExplorerOdds[]> {
  console.log(`📊 BetExplorer: Récupération cotes ${league} ${season}`);
  
  // En production, implémenter le scraping de la page de la ligue
  // https://www.betexplorer.com/football/england/premier-league-2023-2024/results/
  
  return [];
}

// Export par défaut
export const betExplorerService = {
  getMatchOdds,
  getLeagueHistoricalOdds
};

export default betExplorerService;
