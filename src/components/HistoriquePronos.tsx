'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  History, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  TrendingDown,
  Shield,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface Prediction {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  matchDate: string;
  predictedResult: string;
  predictedGoals?: string;
  riskPercentage: number;
  homeScore?: number;
  awayScore?: number;
  actualResult?: string;
  status: 'pending' | 'completed';
  resultMatch?: boolean;
  goalsMatch?: boolean;
}

interface HistoryData {
  completed: Prediction[];
  pending: Prediction[];
  stats: {
    total: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number;
  };
}

// Configuration des catégories de risque
const riskConfig = {
  sure: { 
    label: 'Sûr', 
    icon: Shield, 
    color: 'text-green-500', 
    bg: 'bg-green-500/15',
    border: 'border-green-500/30'
  },
  modere: { 
    label: 'Modéré', 
    icon: Zap, 
    color: 'text-orange-500', 
    bg: 'bg-orange-500/15',
    border: 'border-orange-500/30'
  },
  risque: { 
    label: 'Risqué', 
    icon: AlertTriangle, 
    color: 'text-red-500', 
    bg: 'bg-red-500/15',
    border: 'border-red-500/30'
  }
};

function getRiskCategory(risk: number): 'sure' | 'modere' | 'risque' {
  if (risk <= 30) return 'sure';
  if (risk <= 50) return 'modere';
  return 'risque';
}

function getRiskLabel(result: string): string {
  switch (result) {
    case 'home': return 'Victoire Domicile';
    case 'away': return 'Victoire Extérieur';
    case 'draw': return 'Match Nul';
    default: return result;
  }
}

export function HistoriquePronos() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showPending, setShowPending] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/results?action=all');
      const json = await response.json();
      
      const completed = json.predictions?.filter((p: Prediction) => p.status === 'completed') || [];
      const pending = json.predictions?.filter((p: Prediction) => p.status === 'pending') || [];
      
      setData({
        completed,
        pending,
        stats: {
          total: json.predictions?.length || 0,
          wins: completed.filter((p: Prediction) => p.resultMatch).length,
          losses: completed.filter((p: Prediction) => !p.resultMatch).length,
          pending: pending.length,
          winRate: completed.length > 0 
            ? Math.round((completed.filter((p: Prediction) => p.resultMatch).length / completed.length) * 100) 
            : 0
        }
      });
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card className="border-purple-500/30">
        <CardContent className="p-6">
          <div className="h-32 rounded-lg bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <section id="history" className="scroll-mt-20">
      <Card className="overflow-hidden border-purple-500/30 bg-gradient-to-br from-card via-card to-purple-500/5">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-purple-500/10 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 rounded-xl bg-purple-500 shrink-0 shadow-lg shadow-purple-500/20">
                <History className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl text-foreground">Historique des Pronostics</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  Suivi complet des résultats par catégorie
                </p>
              </div>
            </div>
            
            {/* Stats rapides */}
            <div className="hidden sm:flex items-center gap-2">
              <Badge className={`${data.stats.winRate >= 50 ? 'bg-green-500/15 text-green-500 border-green-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30'}`}>
                {data.stats.winRate}% réussite
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          {/* Résumé par catégorie */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {Object.entries(riskConfig).map(([key, config]) => {
              const Icon = config.icon;
              const categoryPredictions = [
                ...data.completed.filter(p => getRiskCategory(p.riskPercentage) === key),
                ...data.pending.filter(p => getRiskCategory(p.riskPercentage) === key)
              ];
              const wins = data.completed.filter(p => getRiskCategory(p.riskPercentage) === key && p.resultMatch).length;
              const losses = data.completed.filter(p => getRiskCategory(p.riskPercentage) === key && !p.resultMatch).length;
              const completed = data.completed.filter(p => getRiskCategory(p.riskPercentage) === key);
              const winRate = completed.length > 0 ? Math.round((wins / completed.length) * 100) : 0;
              
              return (
                <div key={key} className={`p-3 rounded-lg border ${config.border} ${config.bg}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    <span className={`text-xs font-semibold ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${winRate > 0 ? (winRate >= 50 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                      {completed.length > 0 ? `${winRate}%` : '-'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {wins}V/{losses}D • {categoryPredictions.length} total
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pronostics terminés */}
          {data.completed.length > 0 && (
            <div className="mb-6">
              <button 
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 w-full text-left mb-3"
              >
                {showCompleted ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Pronostics terminés ({data.completed.length})
                </h4>
              </button>
              
              {showCompleted && (
                <div className="space-y-2">
                  {data.completed.map((prediction) => {
                    const riskCat = getRiskCategory(prediction.riskPercentage);
                    const config = riskConfig[riskCat];
                    const Icon = config.icon;
                    
                    return (
                      <div 
                        key={prediction.id}
                        className={`p-3 rounded-lg border ${prediction.resultMatch ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium truncate">
                                {prediction.homeTeam} vs {prediction.awayTeam}
                              </span>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {prediction.league}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDate(prediction.matchDate)}
                            </div>
                          </div>
                          
                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              {prediction.resultMatch ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className={`text-sm font-bold ${prediction.resultMatch ? 'text-green-500' : 'text-red-500'}`}>
                                {prediction.homeScore}-{prediction.awayScore}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Icon className={`h-3 w-3 ${config.color}`} />
                              <span className="text-[10px] text-muted-foreground">{prediction.riskPercentage}%</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-2 text-xs">
                          <span className="text-muted-foreground">
                            Prédit: <span className="text-foreground font-medium">{getRiskLabel(prediction.predictedResult)}</span>
                          </span>
                          {prediction.predictedGoals && (
                            <span className="text-muted-foreground">
                              • <span className={prediction.goalsMatch ? 'text-green-500' : 'text-red-500'}>
                                {prediction.predictedGoals} {prediction.goalsMatch ? '✓' : '✗'}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Pronostics en attente */}
          {data.pending.length > 0 && (
            <div>
              <button 
                onClick={() => setShowPending(!showPending)}
                className="flex items-center gap-2 w-full text-left mb-3"
              >
                {showPending ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  En attente de résultat ({data.pending.length})
                </h4>
              </button>
              
              {showPending && (
                <div className="space-y-2">
                  {data.pending.map((prediction) => {
                    const riskCat = getRiskCategory(prediction.riskPercentage);
                    const config = riskConfig[riskCat];
                    const Icon = config.icon;
                    
                    return (
                      <div 
                        key={prediction.id}
                        className="p-3 rounded-lg border border-border/50 bg-muted/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium truncate">
                                {prediction.homeTeam} vs {prediction.awayTeam}
                              </span>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {prediction.league}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDate(prediction.matchDate)}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                            <span className={`text-xs font-medium ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({prediction.riskPercentage}%)
                            </span>
                          </div>
                        </div>
                        
                        <div className="mt-2 pt-2 border-t border-border/30 text-xs text-muted-foreground">
                          Prédit: <span className="text-foreground font-medium">{getRiskLabel(prediction.predictedResult)}</span>
                          {prediction.predictedGoals && (
                            <span> • {prediction.predictedGoals}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Message si aucune donnée */}
          {data.completed.length === 0 && data.pending.length === 0 && (
            <div className="text-center py-8">
              <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Aucun pronostic enregistré</p>
              <p className="text-sm text-muted-foreground mt-1">
                L'historique apparaîtra automatiquement après les matchs
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
