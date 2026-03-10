/**
 * Script de récupération des résultats récents
 * Utilisé par la GitHub Action pour mettre à jour les données
 */

import * as fs from 'fs';
import * as path from 'path';

// Interfaces
interface MatchResult {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  status: 'FT' | 'NS' | 'LIVE';
  league: string;
}

interface TrainingReport {
  accuracy: number;
  loss: number;
  epochs: number;
  samplesUsed: number;
  trainedAt: string;
  newMatchesAdded: number;
}

// Résultats récents (simulation - en production, récupérer depuis l'API)
async function fetchRecentResults(): Promise<MatchResult[]> {
  console.log('📥 Récupération des résultats récents...');
  
  const results: MatchResult[] = [];
  
  // Essayer de récupérer depuis ESPN NBA
  try {
    const espnResponse = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { next: { revalidate: 0 } }
    );
    
    if (espnResponse.ok) {
      const data = await espnResponse.json();
      
      for (const event of data.events || []) {
        if (event.status?.type?.completed) {
          const home = event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = event.competitions[0]?.competitors?.find((c: any) => c.homeAway === 'away');
          
          if (home && away) {
            results.push({
              id: event.id,
              date: event.date,
              homeTeam: home.team?.shortDisplayName || 'Unknown',
              awayTeam: away.team?.shortDisplayName || 'Unknown',
              homeGoals: parseInt(home.score) || 0,
              awayGoals: parseInt(away.score) || 0,
              status: 'FT',
              league: 'NBA'
            });
          }
        }
      }
      console.log(`✅ NBA: ${results.filter(r => r.league === 'NBA').length} résultats`);
    }
  } catch (error) {
    console.log('⚠️ Erreur ESPN NBA:', error);
  }
  
  // Essayer de récupérer depuis Football-Data API
  const footballApiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (footballApiKey) {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const dateFrom = yesterday.toISOString().split('T')[0];
      const dateTo = today.toISOString().split('T')[0];
      
      const response = await fetch(
        `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        {
          headers: { 'X-Auth-Token': footballApiKey },
          next: { revalidate: 0 }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        
        for (const match of data.matches || []) {
          if (match.status === 'FINISHED') {
            results.push({
              id: match.id.toString(),
              date: match.utcDate,
              homeTeam: match.homeTeam?.name || 'Unknown',
              awayTeam: match.awayTeam?.name || 'Unknown',
              homeGoals: match.score?.fullTime?.home || 0,
              awayGoals: match.score?.fullTime?.away || 0,
              status: 'FT',
              league: match.competition?.name || 'Unknown'
            });
          }
        }
        console.log(`✅ Football: ${results.filter(r => r.league !== 'NBA').length} résultats`);
      }
    } catch (error) {
      console.log('⚠️ Erreur Football-Data:', error);
    }
  }
  
  return results;
}

// Sauvegarder les résultats
function saveResults(results: MatchResult[]): void {
  const dataDir = path.join(process.cwd(), 'data', 'matches');
  
  // Créer le dossier si nécessaire
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Charger les résultats existants
  const existingFile = path.join(dataDir, 'historical.json');
  let existingResults: MatchResult[] = [];
  
  if (fs.existsSync(existingFile)) {
    try {
      existingResults = JSON.parse(fs.readFileSync(existingFile, 'utf8'));
    } catch (e) {
      existingResults = [];
    }
  }
  
  // Fusionner (éviter les doublons)
  const existingIds = new Set(existingResults.map(r => r.id));
  const newResults = results.filter(r => !existingIds.has(r.id));
  
  const allResults = [...existingResults, ...newResults];
  
  // Sauvegarder
  fs.writeFileSync(existingFile, JSON.stringify(allResults, null, 2));
  
  console.log(`💾 ${newResults.length} nouveaux résultats sauvegardés (${allResults.length} total)`);
}

// Main
async function main() {
  console.log('🚀 Début de la récupération des résultats...\n');
  
  try {
    const results = await fetchRecentResults();
    
    if (results.length > 0) {
      saveResults(results);
    } else {
      console.log('ℹ️ Aucun nouveau résultat à ajouter');
    }
    
    // Générer un rapport
    const report: TrainingReport = {
      accuracy: 0,
      loss: 0,
      epochs: 0,
      samplesUsed: 0,
      trainedAt: new Date().toISOString(),
      newMatchesAdded: results.length
    };
    
    const reportPath = path.join(process.cwd(), 'data', 'ml', 'training-report.json');
    const reportDir = path.dirname(reportPath);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n✅ Récupération terminée');
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

main();
