-- ============================================
-- SCRIPT SQL POUR SUPABASE - Pronostics App
-- ============================================
-- Exécuter ce script dans l'éditeur SQL Supabase
-- ============================================

-- 1. TABLE DES MATCHS DE FOOTBALL
CREATE TABLE IF NOT EXISTS football_matches (
  id TEXT PRIMARY KEY,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league_id INTEGER DEFAULT 0,
  league_name TEXT NOT NULL,
  season TEXT NOT NULL,
  match_date DATE NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  result TEXT CHECK (result IN ('H', 'D', 'A')),
  odds_home DECIMAL(6,2),
  odds_draw DECIMAL(6,2),
  odds_away DECIMAL(6,2),
  home_xg DECIMAL(4,2),
  away_xg DECIMAL(4,2),
  data_source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_football_date ON football_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_football_league ON football_matches(league_name);
CREATE INDEX IF NOT EXISTS idx_football_season ON football_matches(season);

-- 2. TABLE DES MATCHS DE BASKETBALL
CREATE TABLE IF NOT EXISTS basketball_matches (
  id TEXT PRIMARY KEY,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league_name TEXT NOT NULL,
  season TEXT NOT NULL,
  match_date DATE NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  result TEXT CHECK (result IN ('H', 'A')),
  odds_home DECIMAL(6,2),
  odds_away DECIMAL(6,2),
  data_source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_basketball_date ON basketball_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_basketball_league ON basketball_matches(league_name);

-- 3. TABLE DES STATS D'ÉQUIPE
CREATE TABLE IF NOT EXISTS team_season_stats (
  id SERIAL PRIMARY KEY,
  team_name TEXT NOT NULL,
  league_name TEXT NOT NULL,
  season TEXT NOT NULL,
  sport TEXT CHECK (sport IN ('football', 'basketball')) NOT NULL,
  matches_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  goals_scored INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  home_wins INTEGER DEFAULT 0,
  home_draws INTEGER DEFAULT 0,
  home_losses INTEGER DEFAULT 0,
  home_goals_scored INTEGER DEFAULT 0,
  home_goals_conceded INTEGER DEFAULT 0,
  away_wins INTEGER DEFAULT 0,
  away_draws INTEGER DEFAULT 0,
  away_losses INTEGER DEFAULT 0,
  away_goals_scored INTEGER DEFAULT 0,
  away_goals_conceded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_name, season, league_name)
);

-- 4. TABLE DES MÉTRIQUES ML
CREATE TABLE IF NOT EXISTS ml_model_metrics (
  id SERIAL PRIMARY KEY,
  model_version TEXT NOT NULL,
  accuracy DECIMAL(5,2) NOT NULL,
  home_accuracy DECIMAL(5,2) DEFAULT 0,
  draw_accuracy DECIMAL(5,2) DEFAULT 0,
  away_accuracy DECIMAL(5,2) DEFAULT 0,
  brier_score DECIMAL(6,4),
  roi_percent DECIMAL(6,2) DEFAULT 0,
  total_predictions INTEGER DEFAULT 0,
  training_date TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLE DE QUEUE D'ENTRAÎNEMENT
CREATE TABLE IF NOT EXISTS ml_training_queue (
  id SERIAL PRIMARY KEY,
  job_type TEXT CHECK (job_type IN ('full_training', 'incremental', 'backtest')) NOT NULL,
  sport TEXT DEFAULT 'football',
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  params JSONB DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLE DES PRÉDICTIONS ML
CREATE TABLE IF NOT EXISTS ml_prediction_history (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  sport TEXT CHECK (sport IN ('football', 'basketball')) NOT NULL,
  prediction_type TEXT NOT NULL,
  predicted_result TEXT NOT NULL,
  confidence DECIMAL(5,2) NOT NULL,
  actual_result TEXT,
  is_correct BOOLEAN,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACTIVER ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE football_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_model_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_training_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_prediction_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLITIQUES D'ACCÈS PUBLIC (pour l'application)
-- ============================================
CREATE POLICY "Allow public read" ON football_matches FOR SELECT USING (true);
CREATE POLICY "Allow public write" ON football_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON football_matches FOR UPDATE USING (true);

CREATE POLICY "Allow public read" ON basketball_matches FOR SELECT USING (true);
CREATE POLICY "Allow public write" ON basketball_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON basketball_matches FOR UPDATE USING (true);

CREATE POLICY "Allow public read" ON team_season_stats FOR SELECT USING (true);
CREATE POLICY "Allow public write" ON team_season_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON team_season_stats FOR UPDATE USING (true);

CREATE POLICY "Allow public read" ON ml_model_metrics FOR SELECT USING (true);
CREATE POLICY "Allow public write" ON ml_model_metrics FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read" ON ml_training_queue FOR SELECT USING (true);
CREATE POLICY "Allow public write" ON ml_training_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON ml_training_queue FOR UPDATE USING (true);

CREATE POLICY "Allow public read" ON ml_prediction_history FOR SELECT USING (true);
CREATE POLICY "Allow public write" ON ml_prediction_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON ml_prediction_history FOR UPDATE USING (true);

-- ============================================
-- VÉRIFICATION FINALE
-- ============================================
SELECT 'football_matches' as table_name, COUNT(*) as count FROM football_matches
UNION ALL
SELECT 'basketball_matches', COUNT(*) FROM basketball_matches
UNION ALL
SELECT 'ml_model_metrics', COUNT(*) FROM ml_model_metrics;
