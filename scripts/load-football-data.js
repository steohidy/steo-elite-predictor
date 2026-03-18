#!/usr/bin/env node
/**
 * Script de chargement des données Football
 * 
 * Charge les matchs de football depuis les données disponibles
 * Exécuter avec: node scripts/load-football-data.js
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_ANON_KEY requises');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Données de football
const LEAGUES = {
  'Premier League': ['Arsenal', 'Chelsea', 'Man City', 'Liverpool', 'Man Utd', 'Tottenham', 'Newcastle', 'Brighton', 'Aston Villa', 'West Ham', 'Everton', 'Fulham', 'Wolves', 'Crystal Palace', 'Brentford', 'Nottm Forest', 'Bournemouth', 'Luton', 'Burnley', 'Sheffield Utd'],
  'La Liga': ['Barcelona', 'Real Madrid', 'Atletico Madrid', 'Sevilla', 'Real Sociedad', 'Villarreal', 'Athletic Bilbao', 'Real Betis', 'Valencia', 'Getafe', 'Osasuna', 'Celta Vigo', 'Mallorca', 'Rayo Vallecano', 'Cadiz', 'Girona', 'Almeria', 'Las Palmas', 'Alaves', 'Granada'],
  'Bundesliga': ['Bayern Munich', 'Dortmund', 'RB Leipzig', 'Leverkusen', 'Union Berlin', 'Freiburg', 'Frankfurt', 'Wolfsburg', 'Mainz', 'Borussia M\'gladbach', 'Köln', 'Hoffenheim', 'Werder Bremen', 'Bochum', 'Augsburg', 'Stuttgart', 'Darmstadt', 'Heidenheim'],
  'Serie A': ['Inter', 'Milan', 'Napoli', 'Juventus', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino', 'Monza', 'Udinese', 'Sassuolo', 'Empoli', 'Lecce', 'Genoa', 'Cagliari', 'Verona', 'Frosinone', 'Salernitana'],
  'Ligue 1': ['PSG', 'Monaco', 'Marseille', 'Lille', 'Lyon', 'Nice', 'Lens', 'Rennes', 'Strasbourg', 'Toulouse', 'Nantes', 'Montpellier', 'Brest', 'Reims', 'Le Havre', 'Metz', 'Lorient', 'Clermont']
};

// Générer des matchs historiques simulés
function generateFootballMatches(season) {
  const matches = [];
  const startDate = new Date(2024, 7, 1);  // Août 2024
  const endDate = new Date(2025, 4, 1);    // Mai 2025
  
  for (const [league, teams] of Object.entries(LEAGUES)) {
    let currentDate = new Date(startDate);
    
    // Chaque équipe joue 38 matchs (contre chaque autre équipe home+away)
    const totalGames = teams.length * 19; // ~380 matchs par ligue
    
    for (let i = 0; i < totalGames && currentDate <= endDate; i++) {
      // Sélectionner deux équipes
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
      
      // Formater la date
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Générer l'ID
      const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const id = `${normalize(homeTeam)}_${normalize(awayTeam)}_${dateStr}`;
      
      // Cotes basées sur le niveau (approximatif)
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
        data_source: 'simulation'
      });
      
      // Avancer de quelques jours
      currentDate.setDate(currentDate.getDate() + Math.floor(Math.random() * 4) + 1);
    }
  }
  
  return matches;
}

async function main() {
  console.log('⚽ ===== CHARGEMENT DONNÉES FOOTBALL =====\n');
  
  try {
    // Vérifier les matchs existants
    const { count: existingCount, error: countError } = await supabase
      .from('football_matches')
      .select('id', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Erreur vérification:', countError.message);
      console.log('\n💡 Exécutez d\'abord le script SQL dans Supabase');
      return;
    }
    
    console.log(`📊 Matchs Football actuels: ${existingCount || 0}`);
    
    if (existingCount && existingCount > 1500) {
      console.log('✅ Données Football déjà chargées!');
      return;
    }
    
    // Générer les matchs
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
    
    console.log('\n\n✅ ===== CHARGEMENT TERMINÉ =====');
    console.log(`📊 Total matchs Football insérés: ${inserted}`);
    
    // Vérifier le résultat
    const { count: finalCount } = await supabase
      .from('football_matches')
      .select('id', { count: 'exact', head: true });
    
    console.log(`📊 Matchs Football en base: ${finalCount || 0}`);
    
  } catch (err) {
    console.error('❌ Erreur:', err.message);
  }
}

main();
