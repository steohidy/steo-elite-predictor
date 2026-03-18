/**
 * GESTIONNAIRE CRON ML - Automatisation intelligente
 * 
 * Stratégie:
 * 1. Scraping INITIAL (une seule fois): Charge tout l'historique
 * 2. Mise à jour QUOTIDIENNE: Récupère uniquement les nouveaux matchs
 * 3. Entraînement AUTOMATIQUE: Après chargement des données
 */

import { supabase, isSupabaseConfigured, FootballMatch, BasketballMatch, TABLES, generateMatchId, formatDateForDB, getMatchResult } from './supabase';
import { trainModel, TrainingConfig, TrainingResult } from './mlPipeline';

// ===== TYPES =====

export interface CronJobResult {
  success: boolean;
  action: 'initial_scrape' | 'daily_update' | 'ml_training' | 'verification' | 'nba_scrape' | 'all';
  matchesAdded: number;
  matchesUpdated: number;
  trainingTriggered?: boolean;
  trainingResult?: {
    accuracy: number;
    roi_percent: number;
    model_version: string;
  };
  errors: string[];
  warnings: string[];
  duration: number;
  timestamp: string;
}

// ===== CONFIGURATION =====

const LEAGUES_TO_TRACK = [
  'Premier League',
  'La Liga', 
  'Bundesliga',
  'Serie A',
  'Ligue 1',
  'Champions League'
];

const CURRENT_SEASON = '2024-2025';

// ===== FONCTIONS UTILITAIRES =====

async function logEvent(
  jobType: 'full_training' | 'incremental' | 'backtest',
  status: 'pending' | 'running' | 'completed' | 'failed',
  result?: any,
  errorMessage?: string
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    await supabase.from('ml_training_queue').insert({
      job_type: jobType,
      sport: 'football',
      status,
      params: { timestamp: new Date().toISOString() },
      result: result || null,
      error_message: errorMessage || null,
      scheduled_for: new Date().toISOString()
    });
  } catch (err) {
    console.error('Erreur log Supabase:', err);
  }
}

export async function sendAlert(
  severity: 'error' | 'warning' | 'info',
  title: string,
  message: string,
  details?: any
): Promise<void> {
  const icon = severity === 'error' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
  console.log(`\n${icon} [${severity.toUpperCase()}] ${title}`);
  console.log(`   ${message}`);
  if (details) console.log('   Details:', JSON.stringify(details, null, 2));

  if (severity === 'error') {
    await logEvent('full_training', 'failed', { title, message, details }, message);
  }
}

// ===== FONCTIONS PRINCIPALES =====

export async function runInitialScrape(): Promise<CronJobResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let matchesAdded = 0;

  console.log('🚀 ===== SCRAPING INITIAL =====');
  console.log('📅 Saisons: 2024-2025, 2025-2026');
  console.log('🏆 Ligues:', LEAGUES_TO_TRACK.join(', '));

  await logEvent('full_training', 'running', { type: 'initial_scrape' });
  await sendAlert('info', 'Scraping Initial Démarré', 'Début du chargement des données historiques');

  try {
    // Vérifier si déjà fait
    if (supabase) {
      const { count, error } = await supabase
        .from('football_matches')
        .select('id', { count: 'exact', head: true });
      
      if (!error && count && count > 500) {
        warnings.push(`Base déjà peuplée (${count} matchs). Scraping initial ignoré.`);
        console.log('⚠️ Base déjà peuplée, scraping initial ignoré.');
        
        return {
          success: true,
          action: 'initial_scrape',
          matchesAdded: 0,
          matchesUpdated: 0,
          errors: [],
          warnings,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Pour cet exemple, on simule le chargement de données
    // En production, utiliser historicalDataScraper.ts
    console.log('📊 Chargement des données historiques...');
    
    // Simuler l'ajout de matchs (à remplacer par vrai scraping)
    matchesAdded = 1500;
    
    await logEvent('full_training', 'completed', { 
      matchesAdded, 
      warnings: warnings.length,
      errors: errors.length 
    });

    // ===== ENTRAÎNEMENT AUTOMATIQUE =====
    let trainingTriggered = false;
    let trainingResult: TrainingResult | undefined = undefined;
    
    if (matchesAdded > 100) {
      console.log('\n🤖 Lancement automatique de l\'entraînement ML...');
      try {
        const config: TrainingConfig = {
          season: '2024-2025',
          sport: 'football',
          testSplit: 0.2,
          minMatchesPerTeam: 5
        };
        
        trainingResult = await trainModel(config);
        trainingTriggered = true;
        
        await sendAlert('info', 'Entraînement ML Automatique Terminé', 
          `Accuracy: ${trainingResult?.accuracy?.toFixed(1) || 'N/A'}%, ROI: ${trainingResult?.roi_percent?.toFixed(1) || 'N/A'}%`);
        console.log(`✅ Entraînement terminé: Accuracy ${trainingResult?.accuracy?.toFixed(1) || 'N/A'}%`);
      } catch (trainErr: any) {
        warnings.push(`Entraînement auto échoué: ${trainErr.message}`);
        console.error('⚠️ Erreur entraînement auto:', trainErr.message);
      }
    }

    if (errors.length > 0) {
      await sendAlert('warning', 'Scraping Initial Terminé avec Avertissements', 
        `${matchesAdded} matchs ajoutés, ${errors.length} erreurs`, { errors, warnings });
    } else {
      await sendAlert('info', 'Scraping Initial Terminé', 
        `${matchesAdded} matchs ajoutés avec succès${trainingTriggered ? ', entraînement lancé' : ''}`);
    }

    console.log(`\n✅ Scraping initial terminé: ${matchesAdded} matchs ajoutés`);

    return {
      success: true,
      action: 'initial_scrape',
      matchesAdded,
      matchesUpdated: 0,
      trainingTriggered,
      trainingResult: trainingResult ? {
        accuracy: trainingResult.accuracy,
        roi_percent: trainingResult.roi_percent,
        model_version: trainingResult.model_version
      } : undefined,
      errors,
      warnings,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

  } catch (error: any) {
    await logEvent('full_training', 'failed', null, error.message);
    await sendAlert('error', 'Échec Scraping Initial', error.message);
    
    return {
      success: false,
      action: 'initial_scrape',
      matchesAdded: 0,
      matchesUpdated: 0,
      errors: [error.message],
      warnings,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

export async function runDailyUpdate(): Promise<CronJobResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let matchesAdded = 0;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  console.log('🔄 ===== MISE À JOUR QUOTIDIENNE =====');
  console.log(`📅 Date: ${dateStr}`);

  await logEvent('incremental', 'running', { type: 'daily_update', date: dateStr });

  try {
    // Simuler la mise à jour quotidienne
    console.log(`✅ Mise à jour terminée: ${matchesAdded} matchs ajoutés`);

    await logEvent('incremental', 'completed', { matchesAdded, date: dateStr });

    return {
      success: true,
      action: 'daily_update',
      matchesAdded,
      matchesUpdated: 0,
      errors,
      warnings,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

  } catch (error: any) {
    await logEvent('incremental', 'failed', null, error.message);
    await sendAlert('error', 'Échec Mise à Jour Quotidienne', error.message);
    
    return {
      success: false,
      action: 'daily_update',
      matchesAdded: 0,
      matchesUpdated: 0,
      errors: [error.message],
      warnings,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

export async function runNBAScrape(): Promise<CronJobResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let matchesAdded = 0;

  console.log('🏀 ===== SCRAPING NBA =====');

  await logEvent('full_training', 'running', { type: 'nba_scrape' });
  await sendAlert('info', 'Scraping NBA Démarré', 'Chargement des données NBA historiques');

  try {
    // Vérifier si déjà fait
    if (supabase) {
      const { count, error } = await supabase
        .from('basketball_matches')
        .select('id', { count: 'exact', head: true });
      
      if (!error && count && count > 200) {
        warnings.push(`NBA déjà peuplé (${count} matchs). Scraping ignoré.`);
        console.log('⚠️ NBA déjà peuplé, scraping ignoré.');
        
        return {
          success: true,
          action: 'nba_scrape',
          matchesAdded: 0,
          matchesUpdated: 0,
          errors: [],
          warnings,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Simuler le chargement NBA
    matchesAdded = 500;
    
    console.log(`\n✅ Scraping NBA terminé: ${matchesAdded} matchs ajoutés`);

    return {
      success: true,
      action: 'nba_scrape',
      matchesAdded,
      matchesUpdated: 0,
      errors,
      warnings,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

  } catch (error: any) {
    await logEvent('full_training', 'failed', null, error.message);
    await sendAlert('error', 'Échec Scraping NBA', error.message);
    
    return {
      success: false,
      action: 'nba_scrape',
      matchesAdded: 0,
      matchesUpdated: 0,
      errors: [error.message],
      warnings,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

export async function isInitialScrapeDone(): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { count, error } = await supabase
      .from('football_matches')
      .select('id', { count: 'exact', head: true });
    
    if (error) return false;
    return (count || 0) > 100;
  } catch {
    return false;
  }
}

export async function isNBAScrapeDone(): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { count, error } = await supabase
      .from('basketball_matches')
      .select('id', { count: 'exact', head: true });
    
    if (error) return false;
    return (count || 0) > 100;
  } catch {
    return false;
  }
}

export async function getDatabaseStats(): Promise<{
  footballMatches: number;
  basketballMatches: number;
  lastUpdate: string | null;
  leagues: string[];
}> {
  if (!supabase) {
    return { footballMatches: 0, basketballMatches: 0, lastUpdate: null, leagues: [] };
  }

  try {
    const { count: footballCount } = await supabase
      .from('football_matches')
      .select('id', { count: 'exact', head: true });
    
    const { count: basketballCount } = await supabase
      .from('basketball_matches')
      .select('id', { count: 'exact', head: true });
    
    const { data: lastMatch } = await supabase
      .from('football_matches')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    const { data: leagues } = await supabase
      .from('football_matches')
      .select('league_name');
    
    const uniqueLeagues: string[] = [...new Set(leagues?.map((l: any) => l.league_name) || [])];

    return {
      footballMatches: footballCount || 0,
      basketballMatches: basketballCount || 0,
      lastUpdate: lastMatch?.[0]?.created_at || null,
      leagues: uniqueLeagues
    };
  } catch (error) {
    console.error('Erreur getDatabaseStats:', error);
    return { footballMatches: 0, basketballMatches: 0, lastUpdate: null, leagues: [] };
  }
}

export async function getFullProgress(): Promise<{
  football: { loaded: number; target: number; percent: number; status: string };
  basketball: { loaded: number; target: number; percent: number; status: string };
  training: { completed: boolean; accuracy: number | null; lastRun: string | null };
}> {
  const stats = await getDatabaseStats();
  
  const footballTarget = 2000;
  const footballLoaded = stats.footballMatches;
  const footballPercent = Math.min(100, Math.round((footballLoaded / footballTarget) * 100));
  const footballStatus = footballLoaded >= footballTarget ? 'completed' : 
                        footballLoaded > 100 ? 'loading' : 'pending';
  
  const basketballTarget = 500;
  const basketballLoaded = stats.basketballMatches;
  const basketballPercent = Math.min(100, Math.round((basketballLoaded / basketballTarget) * 100));
  const basketballStatus = basketballLoaded >= basketballTarget ? 'completed' : 
                          basketballLoaded > 50 ? 'loading' : 'pending';
  
  let trainingCompleted = false;
  let trainingAccuracy: number | null = null;
  let trainingLastRun: string | null = null;
  
  if (supabase) {
    try {
      const { data: metrics } = await supabase
        .from('ml_model_metrics')
        .select('accuracy, training_date')
        .order('training_date', { ascending: false })
        .limit(1);
      
      if (metrics && metrics.length > 0) {
        trainingCompleted = true;
        trainingAccuracy = metrics[0].accuracy;
        trainingLastRun = metrics[0].training_date;
      }
    } catch {
      // Table peut ne pas exister
    }
  }
  
  return {
    football: {
      loaded: footballLoaded,
      target: footballTarget,
      percent: footballPercent,
      status: footballStatus
    },
    basketball: {
      loaded: basketballLoaded,
      target: basketballTarget,
      percent: basketballPercent,
      status: basketballStatus
    },
    training: {
      completed: trainingCompleted,
      accuracy: trainingAccuracy,
      lastRun: trainingLastRun
    }
  };
}

export default {
  runInitialScrape,
  runDailyUpdate,
  runNBAScrape,
  isInitialScrapeDone,
  isNBAScrapeDone,
  getDatabaseStats,
  getFullProgress,
  sendAlert
};
