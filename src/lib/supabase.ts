/**
 * Configuration Supabase pour Pronostics App
 * Base de données PostgreSQL pour stocker les matchs historiques
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Vérifier si Supabase est configuré
export const isSupabaseConfigured = !!(supabaseUrl && (supabaseAnonKey || supabaseServiceKey));

// Client Supabase pour opérations publiques (lecture seule)
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey)
  : null;

// Client Supabase Admin pour opérations serveur (insert, update, delete)
// Utilise la clé service_role pour contourner RLS
let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  
  return _supabaseAdmin;
}

// ===== TYPES =====

export interface FootballMatch {
  id: string;
  home_team: string;
  away_team: string;
  league_id?: number;
  league_name: string;
  season: string;
  match_date: string;
  home_score?: number;
  away_score?: number;
  result?: 'H' | 'D' | 'A';
  odds_home?: number;
  odds_draw?: number;
  odds_away?: number;
  home_xg?: number;
  away_xg?: number;
  data_source?: string;
  created_at?: string;
}

export interface BasketballMatch {
  id: string;
  home_team: string;
  away_team: string;
  league_name: string;
  season: string;
  match_date: string;
  home_score?: number;
  away_score?: number;
  result?: 'H' | 'A';
  odds_home?: number;
  odds_away?: number;
  data_source?: string;
  created_at?: string;
}

export interface TeamSeasonStats {
  team_name: string;
  league_name: string;
  season: string;
  sport: 'football' | 'basketball';
  matches_played: number;
  wins: number;
  draws?: number;
  losses: number;
  goals_scored?: number;
  goals_conceded?: number;
  home_wins?: number;
  home_draws?: number;
  home_losses?: number;
  home_goals_scored?: number;
  home_goals_conceded?: number;
  away_wins?: number;
  away_draws?: number;
  away_losses?: number;
  away_goals_scored?: number;
  away_goals_conceded?: number;
  created_at?: string;
}

export interface MLPredictionHistory {
  id: string;
  match_id: string;
  sport: 'football' | 'basketball';
  prediction_type: string;
  predicted_result: string;
  confidence: number;
  actual_result?: string;
  is_correct?: boolean;
  model_version: string;
  created_at: string;
}

export interface MLModelMetrics {
  id?: string;
  model_version: string;
  accuracy: number;
  home_accuracy: number;
  draw_accuracy: number;
  away_accuracy: number;
  brier_score?: number;
  roi_percent: number;
  total_predictions: number;
  training_date: string;
}

// ===== CONSTANTES =====

export const TABLES = {
  FOOTBALL_MATCHES: 'football_matches',
  BASKETBALL_MATCHES: 'basketball_matches',
  TEAM_STATS: 'team_season_stats',
  ML_PREDICTIONS: 'ml_prediction_history',
  ML_METRICS: 'ml_model_metrics',
  ML_QUEUE: 'ml_training_queue'
} as const;

// ===== FONCTIONS UTILITAIRES =====

/**
 * Génère un ID unique pour un match
 */
export function generateMatchId(homeTeam: string, awayTeam: string, date: string): string {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${normalize(homeTeam)}_${normalize(awayTeam)}_${date}`;
}

/**
 * Formate une date pour la base de données
 */
export function formatDateForDB(date: Date | string): string {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

/**
 * Détermine le résultat du match
 */
export function getMatchResult(homeScore: number, awayScore: number): 'H' | 'D' | 'A' {
  if (homeScore > awayScore) return 'H';
  if (homeScore < awayScore) return 'A';
  return 'D';
}

/**
 * Teste la connexion Supabase
 */
export async function testSupabaseConnection(): Promise<{ connected: boolean; error?: string }> {
  if (!supabase) {
    return { connected: false, error: 'Supabase non configuré' };
  }

  try {
    const { error } = await supabase
      .from(TABLES.FOOTBALL_MATCHES)
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      return { connected: false, error: error.message };
    }

    return { connected: true };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}

/**
 * Récupère les métriques du dernier entraînement
 */
export async function getMLModelMetrics(): Promise<MLModelMetrics | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(TABLES.ML_METRICS)
      .select('*')
      .order('training_date', { ascending: false })
      .limit(1)
      .single();

    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Sauvegarde les métriques d'entraînement
 */
export async function saveMLModelMetrics(metrics: MLModelMetrics): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from(TABLES.ML_METRICS)
      .insert(metrics);

    return !error;
  } catch {
    return false;
  }
}

export default {
  supabase,
  isSupabaseConfigured,
  TABLES,
  generateMatchId,
  formatDateForDB,
  getMatchResult,
  testSupabaseConnection,
  getMLModelMetrics,
  saveMLModelMetrics
};
