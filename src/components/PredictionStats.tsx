'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Trophy, 
  Target, 
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface PeriodStats {
  totalPredictions: number;
  results: {
    total: number;
    correct: number;
    rate: number;
  };
  goals: {
    total: number;
    correct: number;
    rate: number;
  };
  overall: number;
  pending: number;
  completed: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface StatsData {
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
  overall: PeriodStats;
  total: number;
  pending: number;
  completed: number;
  lastUpdate: string;
}

export function PredictionStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/results?action=stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleCheckResults = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_results' })
      });
      await fetchStats();
    } catch (error) {
      console.error('Error checking results:', error);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <Card className="border-purple-500/30 bg-gradient-to-br from-card via-card to-purple-500/5">
        <CardContent className="p-6">
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  // Sélectionner les stats à afficher
  const displayStats = stats.daily.totalPredictions > 0 ? stats.daily : 
                       stats.weekly.totalPredictions > 0 ? stats.weekly : 
                       stats.overall;

  return (
    <section id="stats" className="scroll-mt-20">
      <Card className="overflow-hidden border-purple-500/30 bg-gradient-to-br from-card via-card to-purple-500/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-purple-500/10 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 rounded-xl bg-purple-500 shrink-0 shadow-lg shadow-purple-500/20">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl text-foreground">Statistiques Pronostics</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  Suivi des performances et taux de réussite
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCheckResults}
                disabled={refreshing}
                className="text-purple-500 hover:bg-purple-500/10"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Vérifier
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          {/* Stats principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {/* Total pronostics */}
            <div className="p-4 rounded-xl border border-border/50 bg-muted/30 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Target className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Total</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">pronostics</p>
            </div>

            {/* En attente */}
            <div className="p-4 rounded-xl border border-border/50 bg-muted/30 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">En attente</span>
              </div>
              <p className="text-2xl font-bold text-orange-500">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">matchs</p>
            </div>

            {/* Taux de réussite */}
            <div className="p-4 rounded-xl border border-border/50 bg-muted/30 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                {displayStats.winRate >= 50 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className="text-xs text-muted-foreground">Réussite</span>
              </div>
              <p className={`text-2xl font-bold ${displayStats.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                {displayStats.winRate}%
              </p>
              <p className="text-xs text-muted-foreground">victoires</p>
            </div>

            {/* Victoires/Défaites */}
            <div className="p-4 rounded-xl border border-border/50 bg-muted/30 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <span className="text-xs text-muted-foreground">V/D</span>
              </div>
              <p className="text-2xl font-bold">
                <span className="text-green-500">{displayStats.wins}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-red-500">{displayStats.losses}</span>
              </p>
              <p className="text-xs text-muted-foreground">résultats</p>
            </div>
          </div>

          {/* Stats par période */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              Performance par période
            </h4>
            
            <div className="grid grid-cols-3 gap-3">
              {/* Journalier */}
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1">Aujourd'hui</p>
                <div className="flex items-center gap-2">
                  <Badge className={`${stats.daily.winRate >= 50 ? 'bg-green-500/15 text-green-500 border-green-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30'}`}>
                    {stats.daily.winRate}%
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {stats.daily.wins}V/{stats.daily.losses}D
                  </span>
                </div>
              </div>

              {/* Hebdo */}
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1">Cette semaine</p>
                <div className="flex items-center gap-2">
                  <Badge className={`${stats.weekly.winRate >= 50 ? 'bg-green-500/15 text-green-500 border-green-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30'}`}>
                    {stats.weekly.winRate}%
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {stats.weekly.wins}V/{stats.weekly.losses}D
                  </span>
                </div>
              </div>

              {/* Mensuel */}
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1">Ce mois</p>
                <div className="flex items-center gap-2">
                  <Badge className={`${stats.monthly.winRate >= 50 ? 'bg-green-500/15 text-green-500 border-green-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30'}`}>
                    {stats.monthly.winRate}%
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {stats.monthly.wins}V/{stats.monthly.losses}D
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Détail des prédictions */}
          {(displayStats.results.total > 0 || displayStats.goals.total > 0) && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex flex-wrap gap-4 text-sm">
                {displayStats.results.total > 0 && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Résultats 1N2: <strong>{displayStats.results.rate}%</strong></span>
                  </div>
                )}
                {displayStats.goals.total > 0 && (
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-500" />
                    <span>Buts O/U: <strong>{displayStats.goals.rate}%</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Message si pas de données */}
          {stats.total === 0 && (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Aucun pronostic enregistré</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les statistiques apparaîtront automatiquement après les matchs
              </p>
            </div>
          )}

          {/* Last update */}
          {stats.lastUpdate && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Dernière mise à jour: {new Date(stats.lastUpdate).toLocaleString('fr-FR')}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
