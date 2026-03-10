/**
 * Injury Scraper - Agrège les blessures depuis plusieurs sources
 * 
 * Sources:
 * - Transfermarkt (via z-ai web search)
 * - ESPN Injury Report
 * - Team official sites
 */

import { zaiWebSearch, zaiPageReader, isZaiAvailable } from './zaiInit';

export interface InjuryInfo {
  player: string;
  team: string;
  type: 'injury' | 'suspension' | 'questionable';
  reason: string;
  returnDate?: string;
  source: string;
}

// Cache des blessures (30 min)
const injuryCache = new Map<string, { data: InjuryInfo[]; timestamp: number }>();
const INJURY_CACHE_DURATION = 30 * 60 * 1000;

/**
 * Récupère les blessures d'une équipe de football
 */
export async function scrapeFootballInjuries(teamName: string): Promise<InjuryInfo[]> {
  // Vérifier le cache
  const cacheKey = `football_${teamName}`;
  const cached = injuryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < INJURY_CACHE_DURATION) {
    return cached.data;
  }

  if (!(await isZaiAvailable())) {
    console.log('⚠️ z-ai SDK non disponible pour injury scraper');
    return [];
  }

  const injuries: InjuryInfo[] = [];

  try {
    // Recherche Transfermarkt
    const tmSearch = await zaiWebSearch(`${teamName} injury list transfermarkt 2025`, 2);
    
    if (tmSearch.success) {
      for (const result of tmSearch.results) {
        if (result.url.includes('transfermarkt')) {
          const pageContent = await zaiPageReader(result.url);
          
          if (pageContent.success) {
            // Parser le contenu pour extraire les blessures
            const parsedInjuries = parseTransfermarktContent(pageContent.content, teamName);
            injuries.push(...parsedInjuries);
          }
        }
      }
    }

    // Recherche ESPN
    const espnSearch = await zaiWebSearch(`${teamName} injury report ESPN`, 2);
    
    if (espnSearch.success) {
      for (const result of espnSearch.results) {
        if (result.url.includes('espn')) {
          const pageContent = await zaiPageReader(result.url);
          
          if (pageContent.success) {
            const parsedInjuries = parseESPNInjuryContent(pageContent.content, teamName);
            injuries.push(...parsedInjuries);
          }
        }
      }
    }

    // Déduquer les doublons
    const uniqueInjuries = deduplicateInjuries(injuries);

    // Mettre en cache
    injuryCache.set(cacheKey, { data: uniqueInjuries, timestamp: Date.now() });

    console.log(`✅ Blessures ${teamName}: ${uniqueInjuries.length} trouvées`);
    return uniqueInjuries;

  } catch (error) {
    console.error('❌ Erreur scrap blessures:', error);
    return injuries;
  }
}

/**
 * Récupère les blessures NBA
 */
export async function scrapeNBAInjuries(teamName: string): Promise<InjuryInfo[]> {
  // Vérifier le cache
  const cacheKey = `nba_${teamName}`;
  const cached = injuryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < INJURY_CACHE_DURATION) {
    return cached.data;
  }

  if (!(await isZaiAvailable())) {
    console.log('⚠️ z-ai SDK non disponible pour NBA injury scraper');
    return [];
  }

  const injuries: InjuryInfo[] = [];

  try {
    // Recherche NBA.com injury report
    const nbaSearch = await zaiWebSearch(`${teamName} NBA injury report today`, 3);

    if (nbaSearch.success) {
      for (const result of nbaSearch.results) {
        // Essayer de lire les pages qui semblent pertinentes
        if (result.url.includes('nba.com') || 
            result.url.includes('espn.com') ||
            result.url.includes('rotowire')) {
          
          const pageContent = await zaiPageReader(result.url);
          
          if (pageContent.success) {
            const parsedInjuries = parseNBAInjuryContent(pageContent.content, teamName);
            injuries.push(...parsedInjuries);
          }
        }
      }
    }

    // Déduquer les doublons
    const uniqueInjuries = deduplicateInjuries(injuries);

    // Mettre en cache
    injuryCache.set(cacheKey, { data: uniqueInjuries, timestamp: Date.now() });

    console.log(`✅ Blessures NBA ${teamName}: ${uniqueInjuries.length} trouvées`);
    return uniqueInjuries;

  } catch (error) {
    console.error('❌ Erreur scrap blessures NBA:', error);
    return injuries;
  }
}

/**
 * Parse le contenu Transfermarkt
 */
function parseTransfermarktContent(content: string, teamName: string): InjuryInfo[] {
  const injuries: InjuryInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    
    if (line.includes('injur') || line.includes('sidelined')) {
      // Essayer d'extraire le nom du joueur (approximatif)
      const playerName = extractPlayerName(lines[i]);
      
      if (playerName) {
        injuries.push({
          player: playerName,
          team: teamName,
          type: 'injury',
          reason: extractInjuryType(lines[i]) || 'Unknown injury',
          source: 'Transfermarkt',
        });
      }
    }
  }

  return injuries.slice(0, 10);
}

/**
 * Parse le contenu ESPN Injury Report
 */
function parseESPNInjuryContent(content: string, teamName: string): InjuryInfo[] {
  const injuries: InjuryInfo[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const lineLower = line.toLowerCase();
    
    if (lineLower.includes('out') || 
        lineLower.includes('questionable') ||
        lineLower.includes('doubtful')) {
      
      const playerName = extractPlayerName(line);
      
      if (playerName) {
        injuries.push({
          player: playerName,
          team: teamName,
          type: lineLower.includes('questionable') ? 'questionable' : 'injury',
          reason: extractInjuryType(line) || 'Not specified',
          source: 'ESPN',
        });
      }
    }
  }

  return injuries.slice(0, 10);
}

/**
 * Parse le contenu NBA injury report
 */
function parseNBAInjuryContent(content: string, teamName: string): InjuryInfo[] {
  const injuries: InjuryInfo[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const lineLower = line.toLowerCase();
    
    // Pattern NBA typique: "Player Name (G) - Out - Knee"
    const match = line.match(/([A-Z][a-z]+ [A-Z][a-z]+).*?(Out|Questionable|Doubtful|Day-to-Day).*?([A-Za-z ]+)/i);
    
    if (match) {
      injuries.push({
        player: match[1].trim(),
        team: teamName,
        type: match[2].toLowerCase().includes('questionable') ? 'questionable' : 'injury',
        reason: match[3].trim() || 'Not specified',
        source: 'NBA Injury Report',
      });
    }
  }

  return injuries.slice(0, 10);
}

/**
 * Extrait le nom d'un joueur d'une ligne de texte
 */
function extractPlayerName(line: string): string | null {
  // Pattern: "FirstName LastName" (majuscule au début de chaque mot)
  const match = line.match(/([A-Z][a-z]+ [A-Z][a-z]+)/);
  return match ? match[1] : null;
}

/**
 * Extrait le type de blessure
 */
function extractInjuryType(line: string): string | null {
  const injuryTypes = [
    'knee', 'ankle', 'hamstring', 'groin', 'hip', 'back', 
    'shoulder', 'elbow', 'wrist', 'foot', 'calf', 'thigh',
    'muscle', 'ligament', 'fracture', 'sprain', 'strain'
  ];
  
  const lineLower = line.toLowerCase();
  
  for (const type of injuryTypes) {
    if (lineLower.includes(type)) {
      return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }
  
  return null;
}

/**
 * Dédoublonne les blessures
 */
function deduplicateInjuries(injuries: InjuryInfo[]): InjuryInfo[] {
  const seen = new Set<string>();
  return injuries.filter(injury => {
    const key = `${injury.player}_${injury.team}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Récupère toutes les blessures pour un match
 */
export async function getMatchInjuries(
  homeTeam: string, 
  awayTeam: string,
  sport: 'football' | 'basketball'
): Promise<{
  homeInjuries: InjuryInfo[];
  awayInjuries: InjuryInfo[];
  impactLevel: 'low' | 'medium' | 'high';
}> {
  const scraper = sport === 'football' ? scrapeFootballInjuries : scrapeNBAInjuries;
  
  const [homeInjuries, awayInjuries] = await Promise.all([
    scraper(homeTeam),
    scraper(awayTeam),
  ]);

  // Calculer l'impact
  const totalKeyPlayers = homeInjuries.length + awayInjuries.length;
  let impactLevel: 'low' | 'medium' | 'high' = 'low';
  
  if (totalKeyPlayers >= 4) {
    impactLevel = 'high';
  } else if (totalKeyPlayers >= 2) {
    impactLevel = 'medium';
  }

  return {
    homeInjuries,
    awayInjuries,
    impactLevel,
  };
}

// Export par défaut
const InjuryScraper = {
  scrapeFootballInjuries,
  scrapeNBAInjuries,
  getMatchInjuries,
};

export default InjuryScraper;
