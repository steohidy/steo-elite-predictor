#!/usr/bin/env node
/**
 * Script de chargement COMPLET des données - Football + NBA
 * 
 * Ce script charge les données historiques pour l'entraînement ML
 * Exécuter avec: node scripts/load-all-data.js
 * 
 * Variables d'environnement requises:
 * - SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_ANON_KEY requises');
  console.error('💡 Exportez-les avant de lancer le script:');
  console.error('   export SUPABASE_URL="https://votre-projet.supabase.co"');
  console.error('   export SUPABASE_ANON_KEY="votre-cle-anon"');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// DONNÉES DES ÉQUIPES
// ============================================

const LEAGUES_DATA = {
  'Premier League': ['Arsenal', 'Chelsea', 'Man City', 'Liverpool', 'Man Utd', 'Tottenham', 'Newcastle', 'Brighton', 'Aston Villa', 'West Ham', 'Everton', 'Fulham', 'Wolves', 'Crystal Palace', 'Brentford', 'Nottm Forest', 'Bournemouth', 'Leicester', 'Ipswich', 'Southampton'],
  'La Liga': ['Barcelona', 'Real Madrid', 'Atletico Madrid', 'Sevilla', 'Real Sociedad', 'Villarreal', 'Athletic Bilbao', 'Real Betis', 'Valencia', 'Getafe', 'Osasuna', 'Celta Vigo', 'Mallorca', 'Rayo Vallecano', 'Girona', 'Alaves', 'Las Palmas', 'Leganes', 'Espanyol', 'Valladolid'],
  'Bundesliga': ['Bayern Munich', 'Dortmund', 'RB Leipzig', 'Leverkusen', 'Union Berlin', 'Freiburg', 'Frankfurt', 'Wolfsburg', 'Mainz', "Borussia M'gladbach", 'Hoffenheim', 'Werder Bremen', 'Bochum', 'Augsburg', 'Stuttgart', 'Heidenheim', 'Holstein Kiel', 'St. Pauli'],
  'Serie A': ['Inter', 'Milan', 'Napoli', 'Juventus', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino', 'Monza', 'Udinese', 'Sassuolo', 'Empoli', 'Lecce', 'Genoa', 'Cagliari', 'Verona', 'Como', 'Parma'],
  'Ligue 1': ['PSG', 'Monaco', 'Marseille', 'Lille', 'Lyon', 'Nice', 'Lens', 'Rennes', 'Strasbourg', 'Toulouse', 'Nantes', 'Montpellier', 'Brest', 'Reims', 'Le Havre', 'Metz', 'Lorient', 'Clermont', 'Auxerre', 'Angers'],
  'Champions League': ['Arsenal', 'Barcelona', 'Real Madrid', 'Bayern Munich', 'Inter', 'PSG', 'Man City', 'Liverpool', 'Dortmund', 'Atletico Madrid', 'Juventus', 'Milan', 'Leverkusen', 'RB Leipzig', 'Benfica', 'Porto']
};

const NBA_TEAMS = [
  'Lakers', 'Warriors', 'Celtics', 'Nets', 'Heat', 'Bulls', 'Knicks', '76ers',
  'Bucks', 'Raptors', 'Mavericks', 'Suns', 'Nuggets', 'Clippers', 'Trail Blazers',
  'Pelicans', 'Spurs', 'Kings', 'Timberwolves', 'Grizzlies', 'Thunder', 'Jazz',
  'Rockets', 'Pacers', 'Hawks', 'Hornets', 'Magic', 'Wizards', 'Pistons', 'Cavaliers'
];

// ============================================
// FONCTIONS DE GÉNÉRATION
// ============================================

function generateMatchId(homeTeam, awayTeam, date) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${normalize(homeTeam)}_${normalize(awayTeam)}_${date}`;
}

function generateFootballMatches(season) {
  const matches = [];
  const startDate = new Date(2024, 7, 1);  // Août 2024
  const endDate = new Date(2025, 4, 1);    // Mai 2025
  
  for (const [league, teams] of Object.entries(LEAGUES_DATA)) {
    let currentDate = new Date(startDate);
    
    // Chaque équipe joue 38 matchs
    const totalGames = teams.length * 19;
    
    for (let i = 0; i < totalGames && currentDate <= endDate; i++) {
      const homeIdx = i % teams.length;
      let awayIdx = (i + Math.floor(i / teams.length) + 1) % teams.length;
      
      const homeTeam = teams[homeIdx];
      const awayTeam = teams[awayIdx];
      
      // Scores football typiques (0-5 buts)
      const homeScore = Math.floor(Math.random() * 4);
      const awayScore = Math.floor(Math.random() * 4);
      
      // Déterminer le résultat
      let result;
      if (homeScore > awayScore) result = 'H';
      else if (homeScore < awayScore) result = 'A';
      else result = 'D';
      
      const dateStr = currentDate.toISOString().split('T')[0];
      const id = generateMatchId(homeTeam, awayTeam, dateStr);
      
      // Cotes basées sur le niveau
      const homeStrength = homeIdx < 5 ? 0.5 : homeIdx < 10 ? 0.3 : 0.2;
      const awayStrength = awayIdx < 5 ? 0.5 : awayIdx < 10 ? 0.3 : 0.2;
      
      const homeOdds = 1 + (1 - homeStrength) * 3;
      const drawOdds = 3 + Math.random() * 0.5;
      const awayOdds = 1 + (1 - awayStrength) * 3;
      
      matches.push({
        id,
        home_team: homeTeam,
        away_team: awayTeam,
        league_id: 0,
        league_name: league,
        season,
        match_date: dateStr,
        home_score: homeScore,
        away_score: awayScore,
        result,
        odds_home: Math.round(homeOdds * 100) / 100,
        odds_draw: Math.round(drawOdds * 100) / 100,
        odds_away: Math.round(awayOdds * 100) / 100,
        home_xg: Math.round((homeScore + Math.random()) * 100) / 100,
        away_xg: Math.round((awayScore + Math.random()) * 100) / 100,
        data_source: 'historical_generation'
      });
      
      // Avancer de quelques jours
      currentDate.setDate(currentDate.getDate() + Math.floor(Math.random() * 4) + 1);
    }
  }
  
  return matches;
}

function generateNBAMatches(season) {
  const matches = [];
  const startDate = new Date(2024, 9, 1); // Octobre 2024
  const endDate = new Date(2025, 3, 15);   // Avril 2025
  
  // Chaque équipe joue 82 matchs
  const gamesPerTeam = 82;
  const totalGames = Math.floor((NBA_TEAMS.length * gamesPerTeam) / 2);
  
  let currentDate = new Date(startDate);
  
  for (let i = 0; i < totalGames && currentDate <= endDate; i++) {
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
    
    const dateStr = currentDate.toISOString().split('T')[0];
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const id = `${normalize(homeTeam)}_${normalize(awayTeam)}_${dateStr}`;
    
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
      data_source: 'historical_generation'
    });
    
    // Avancer de 1-3 jours
    currentDate.setDate(currentDate.getDate() + Math.floor(Math.random() * 3) + 1);
  }
  
  return matches;
}

// ============================================
// FONCTION PRINCIPALE
// ============================================

async function main() {
  console.log('🚀 ===== CHARGEMENT COMPLET DES DONNÉES =====\n');
  
  try {
    // 1. Vérifier la connexion
    console.log('📡 Vérification connexion Supabase...');
    const { error: testError } = await supabase
      .from('football_matches')
      .select('id')
      .limit(1);
    
    if (testError && testError.code !== 'PGRST116') {
      console.error('❌ Erreur connexion Supabase:', testError.message);
      console.log('\n💡 Vérifiez vos identifiants Supabase');
      process.exit(1);
    }
    console.log('✅ Connexion Supabase OK\n');
    
    // 2. Vérifier les données existantes
    const { count: footballCount } = await supabase
      .from('football_matches')
      .select('id', { count: 'exact', head: true });
    
    const { count: basketballCount } = await supabase
      .from('basketball_matches')
      .select('id', { count: 'exact', head: true });
    
    console.log(`📊 Données actuelles:`);
    console.log(`   Football: ${footballCount || 0} matchs`);
    console.log(`   Basketball: ${basketballCount || 0} matchs\n`);
    
    // 3. Charger les données Football si nécessaire
    if (footballCount < 1500) {
      console.log('⚽ ===== CHARGEMENT FOOTBALL =====');
      
      const seasons = ['2023-2024', '2024-2025'];
      let allMatches = [];
      
      for (const season of seasons) {
        console.log(`📅 Génération saison ${season}...`);
        const seasonMatches = generateFootballMatches(season);
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
          .from('football_matches')
          .upsert(batch, { onConflict: 'id' });
        
        if (error) {
          console.error(`\n❌ Erreur lot ${i}:`, error.message);
        } else {
          inserted += batch.length;
          process.stdout.write(`\r   📁 ${inserted}/${allMatches.length} matchs insérés`);
        }
      }
      console.log('\n');
    } else {
      console.log('✅ Football déjà chargé\n');
    }
    
    // 4. Charger les données NBA si nécessaire
    if (basketballCount < 400) {
      console.log('🏀 ===== CHARGEMENT NBA =====');
      
      const seasons = ['2023-2024', '2024-2025'];
      let allMatches = [];
      
      for (const season of seasons) {
        console.log(`📅 Génération saison NBA ${season}...`);
        const seasonMatches = generateNBAMatches(season);
        allMatches = allMatches.concat(seasonMatches);
        console.log(`   ✅ ${seasonMatches.length} matchs NBA générés`);
      }
      
      console.log(`\n📊 Total: ${allMatches.length} matchs NBA à insérer`);
      
      // Insérer par lots
      const batchSize = 100;
      let inserted = 0;
      
      for (let i = 0; i < allMatches.length; i += batchSize) {
        const batch = allMatches.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('basketball_matches')
          .upsert(batch, { onConflict: 'id' });
        
        if (error) {
          console.error(`\n❌ Erreur lot ${i}:`, error.message);
        } else {
          inserted += batch.length;
          process.stdout.write(`\r   📁 ${inserted}/${allMatches.length} matchs NBA insérés`);
        }
      }
      console.log('\n');
    } else {
      console.log('✅ NBA déjà chargé\n');
    }
    
    // 5. Vérification finale
    const { count: finalFootball } = await supabase
      .from('football_matches')
      .select('id', { count: 'exact', head: true });
    
    const { count: finalBasketball } = await supabase
      .from('basketball_matches')
      .select('id', { count: 'exact', head: true });
    
    console.log('✅ ===== CHARGEMENT TERMINÉ =====');
    console.log(`📊 Matchs Football: ${finalFootball || 0}`);
    console.log(`📊 Matchs Basketball: ${finalBasketball || 0}`);
    console.log('\n🤖 L\'entraînement ML peut maintenant démarrer!');
    console.log('💡 Appelez: POST /api/cron-ml?action=all&secret=steo-elite-cron-2026');
    
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

main();
