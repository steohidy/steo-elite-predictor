'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MatchCard } from './MatchCard';
import { Trophy, RefreshCw, TrendingUp, BarChart3, Target, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: string;
  insight?: {
    riskPercentage: number;
    valueBetDetected: boolean;
    valueBetType: string | null;
    confidence: string;
  };
}

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
  cards: {
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

interface Stats {
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
  overall: PeriodStats;
}

const sportsConfig: Record<string, { icon: string; label: string; color: string }> = {
  Foot: { icon: '⚽', label: 'Football', color: 'data-[state=active]:bg-green-500 data-[state=active]:text-white' },
  NBA: { icon: '🏀', label: 'NBA', color: 'data-[state=active]:bg-orange-500 data-[state=active]:text-white' },
  NHL: { icon: '🏒', label: 'NHL', color: 'data-[state=active]:bg-blue-500 data-[state=active]:text-white' },
  AHL: { icon: '🏒', label: 'AHL', color: 'data-[state=active]:bg-cyan-500 data-[state=active]:text-white' },
};

export function Multisports() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState('all');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/matches');
      const data = await response.json();
      // L'API retourne { matches: [...], timing: {...} }
      setMatches(data.matches || data || []);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/results?action=stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    fetchStats();
  }, [fetchMatches, fetchStats]);

  const filteredMatches = activeSport === 'all' 
    ? matches 
    : matches.filter(m => m.sport === activeSport);

  const sportStats = matches.reduce((acc, match) => {
    if (!acc[match.sport]) {
      acc[match.sport] = { count: 0, avgRisk: 0, valueBets: 0 };
    }
    acc[match.sport].count++;
    acc[match.sport].avgRisk += match.insight?.riskPercentage || 50;
    if (match.insight?.valueBetDetected) acc[match.sport].valueBets++;
    return acc;
  }, {} as Record<string, { count: number; avgRisk: number; valueBets: number }>);

  // Calculate averages
  Object.keys(sportStats).forEach(sport => {
    sportStats[sport].avgRisk = Math.round(sportStats[sport].avgRisk / sportStats[sport].count);
  });

  return (
    <section id="multisports" className="scroll-mt-20">
      {/* Statistics Section */}
      {stats && !loadingStats && (
        <Card className="mb-6 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-green-500/5">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-green-500/10 to-transparent pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="p-1.5 sm:p-2 rounded-xl bg-green-500 shrink-0 shadow-lg shadow-green-500/20">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-lg sm:text-xl text-foreground">Statistiques des Pronostics</CardTitle>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    Suivi des résultats et performance
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-4 sm:p-6">
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              {/* Today's Stats */}
              <div className="p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-muted-foreground">Aujourd&apos;hui</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pronostics</span>
                    <span className="font-bold text-foreground">{stats.daily.totalPredictions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">En attente</span>
                    <span className="font-bold text-orange-500">{stats.daily.pending}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Réussite</span>
                    <span className={`font-bold ${stats.daily.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                      {stats.daily.winRate}%
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Weekly Stats */}
              <div className="p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-muted-foreground">Cette semaine</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pronostics</span>
                    <span className="font-bold text-foreground">{stats.weekly.totalPredictions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Réussite</span>
                    <span className={`font-bold ${stats.weekly.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                      {stats.weekly.winRate}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-500">{stats.weekly.wins} G</span>
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-500">{stats.weekly.losses} P</span>
                  </div>
                </div>
              </div>
              
              {/* Monthly Stats */}
              <div className="p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium text-muted-foreground">Ce mois</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pronostics</span>
                    <span className="font-bold text-foreground">{stats.monthly.totalPredictions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Réussite</span>
                    <span className={`font-bold ${stats.monthly.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                      {stats.monthly.winRate}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-500">{stats.monthly.wins} G</span>
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-500">{stats.monthly.losses} P</span>
                  </div>
                </div>
              </div>
              
              {/* Overall Stats */}
              <div className="p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium text-muted-foreground">Global</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="font-bold text-foreground">{stats.overall.totalPredictions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Réussite</span>
                    <span className={`font-bold ${stats.overall.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                      {stats.overall.winRate}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-500">{stats.overall.wins} G</span>
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-500">{stats.overall.losses} P</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Detailed Results Stats */}
            {(stats.overall.results.total > 0 || stats.overall.goals.total > 0) && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <h4 className="text-sm font-semibold mb-3 text-foreground">Détail par type de pari</h4>
                <div className="grid gap-3 grid-cols-3">
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Résultats (1N2)</div>
                    <div className="text-lg font-bold text-foreground">{stats.overall.results.rate}%</div>
                    <div className="text-xs text-muted-foreground">{stats.overall.results.correct}/{stats.overall.results.total}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Buts (O/U)</div>
                    <div className="text-lg font-bold text-foreground">{stats.overall.goals.rate}%</div>
                    <div className="text-xs text-muted-foreground">{stats.overall.goals.correct}/{stats.overall.goals.total}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Cartons</div>
                    <div className="text-lg font-bold text-foreground">{stats.overall.cards.rate}%</div>
                    <div className="text-xs text-muted-foreground">{stats.overall.cards.correct}/{stats.overall.cards.total}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Matches Section */}
      <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-orange-500/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-orange-500/10 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 rounded-xl bg-orange-500 shrink-0 shadow-lg shadow-orange-500/20">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl text-foreground">Multisports</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  Tous les matchs par sport
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setLoading(true); fetchMatches(); fetchStats(); }}
              disabled={loading}
              className="h-9 w-9 shrink-0 text-orange-500 hover:bg-orange-500/10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          <Tabs defaultValue="all" onValueChange={setActiveSport}>
            {/* Scrollable tabs on mobile */}
            <div className="overflow-x-auto -mx-4 sm:mx-0 mb-6">
              <TabsList className="w-full sm:w-auto justify-start min-w-max bg-muted/50 p-1 h-auto mx-4 sm:mx-0">
                <TabsTrigger 
                  value="all" 
                  className="data-[state=active]:bg-orange-500 data-[state=active]:text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium"
                >
                  Tous ({matches.length})
                </TabsTrigger>
                {Object.entries(sportsConfig).map(([sport, config]) => (
                  <TabsTrigger 
                    key={sport}
                    value={sport}
                    className={`${config.color} px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium`}
                  >
                    {config.icon} {sport} ({matches.filter(m => m.sport === sport).length})
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value={activeSport} className="mt-0">
              {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredMatches.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredMatches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                    <Trophy className="h-8 w-8 text-orange-500/50" />
                  </div>
                  <p className="text-foreground font-medium">
                    Aucun match disponible pour ce sport
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Sport Statistics */}
          {Object.keys(sportStats).length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/50">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                Statistiques par sport
              </h4>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {Object.entries(sportStats).map(([sport, stats]) => {
                  const config = sportsConfig[sport as keyof typeof sportsConfig];
                  return (
                    <div
                      key={sport}
                      className="p-3 sm:p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{config?.icon || '🏟️'}</span>
                        <span className="font-semibold text-sm text-foreground">{sport}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Matchs</div>
                          <div className="font-bold text-foreground">{stats.count}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Risque</div>
                          <div className={`font-bold ${
                            stats.avgRisk <= 40 ? 'text-green-500' : 
                            stats.avgRisk <= 60 ? 'text-orange-500' : 'text-red-500'
                          }`}>
                            {stats.avgRisk}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">VB</div>
                          <div className="font-bold text-orange-500">{stats.valueBets}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
