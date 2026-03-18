#!/usr/bin/env node
/**
 * Script de chargement des données NBA
 * 
 * Charge les matchs NBA depuis Basketball-Reference
 * Exécuter avec: node scripts/load-nba-data.js
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_ANON_KEY requises');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Données NBA simulées (en production, utiliser basketball-reference)
const NBA_TEAMS = [
  'Lakers', 'Warriors', 'Celtics', 'Nets', 'Heat', 'Bulls', 'Knicks', '76ers',
  'Bucks', 'Raptors', 'Mavericks', 'Suns', 'Nuggets', 'Clippers', 'Trail Blazers',
  'Pelicans', 'Spurs', 'Kings', 'Timberwolves', 'Grizzlies', 'Thunder', 'Jazz',
  'Rockets', 'Pacers', 'Hawks', 'Hornets', 'Magic', 'Wizards', 'Pistons', 'Cavaliers'
];

// Générer des matchs NBA historiques simulés
function generateNBAMatches(season) {
  const matches = [];
  const startDate = new Date(2024, 9, 1); // Octobre 2024
  const endDate = new Date(2025, 3, 15);   // Avril 2025
  
  // Chaque équipe joue 82 matchs
  const gamesPerTeam = 82;
  const totalGames = Math.floor((NBA_TEAMS.length * gamesPerTeam) / 2);
  
  let currentDate = new Date(startDate);
  
  for (let i = 0; i < totalGames && currentDate <= endDate; i++) {
    // Sélectionner deux équipes aléatoires
    const homeIdx = Math.floor(Math.random() * NBA_TEAMS.length);
    let awayIdx = Math.floor(Math.random() * NBA_TEAMS.length);
    while (awayIdx === homeIdx) {
      awayIdx = Math.floor(Math.random() * NBA_TEAMS.length);
    }
    
    const homeTeam = NBA_TEAMS[homeIdx];
    const awayTeam = NBA_TEAMS[awayIdx];
    
    // Scores NBA typiques (90-130 points)
    const homeScore = Math.floor(Math.random() * 40) + 95;
    const awayScore = Math.floor(Math.random() * 40) + 95;
    
    // Formater la date
    const dateStr = currentDate.toISOString().split('T')[0];
    
    // Générer l'ID
    const id = `${homeTeam.toLowerCase().replace(/\s/g, '')}_${awayTeam.toLowerCase().replace(/\s/g, '')}_${dateStr}`;
    
    matches.push({
      id,
      home_team: homeTeam,
      away_team: awayTeam,
      league_name: 'NBA',
      season,
      match_date: dateStr,
      home_score: homeScore,
      away_score: awayScore,
      result: homeScore > awayScore ? 'H' : 'A',
      odds_home: 1.85 + Math.random() * 0.3,
      odds_away: 1.85 + Math.random() * 0.3,
      data_source: 'simulation'
    });
    
    // Avancer de 1-3 jours
    currentDate.setDate(currentDate.getDate() + Math.floor(Math.random() * 3) + 1);
  }
  
  return matches;
}

async function main() {
  console.log('🏀 ===== CHARGEMENT DONNÉES NBA =====\n');
  
  try {
    // Vérifier les matchs existants
    const { count: existingCount, error: countError } = await supabase
      .from('basketball_matches')
      .select('id', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Erreur vérification:', countError.message);
      console.log('\n💡 Exécutez d\'abord le script SQL dans Supabase');
      return;
    }
    
    console.log(`📊 Matchs NBA actuels: ${existingCount || 0}`);
    
    if (existingCount && existingCount > 200) {
      console.log('✅ Données NBA déjà chargées!');
      return;
    }
    
    // Générer les matchs
    const seasons = ['2023-2024', '2024-2025'];
    let allMatches = [];
    
    for (const season of seasons) {
      console.log(`📅 Génération saison ${season}...`);
      const seasonMatches = generateNBAMatches(season);
      allMatches = allMatches.concat(seasonMatches);
      console.log(`   ✅ ${seasonMatches.length} matchs générés`);
    }
    
    console.log(`\n📊 Total: ${allMatches.length} matchs à insérer`);
    
    // Insérer par lots
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < allMatches.length; i += batchSize) {
      const batch = allMatches.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('basketball_matches')
        .upsert(batch, { onConflict: 'id' });
      
      if (error) {
        console.error(`❌ Erreur lot ${i}:`, error.message);
      } else {
        inserted += batch.length;
        process.stdout.write(`\r   📁 ${inserted}/${allMatches.length} matchs insérés`);
      }
    }
    
    console.log('\n\n✅ ===== CHARGEMENT TERMINÉ =====');
    console.log(`📊 Total matchs NBA insérés: ${inserted}`);
    
    // Vérifier le résultat
    const { count: finalCount } = await supabase
      .from('basketball_matches')
      .select('id', { count: 'exact', head: true });
    
    console.log(`📊 Matchs NBA en base: ${finalCount || 0}`);
    
  } catch (err) {
    console.error('❌ Erreur:', err.message);
  }
}

main();
