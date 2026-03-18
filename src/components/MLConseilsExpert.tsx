'use client';

/**
 * ML Conseils Expert - Composant Admin
 * 
 * Affiche les prédictions ML optimisées pour les administrateurs.
 * - Jauges de progression Football/Basketball
 * - Métriques du modèle
 * - Entraînement ML
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Zap, 
  RefreshCw, 
  Database,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Trophy,
  CircleDot
} from 'lucide-react';

// ===== TYPES =====

interface TrainingProgress {
  football: {
    loaded: number;
    target: number;
    percent: number;
    status: 'pending' | 'loading' | 'training' | 'completed' | 'error';
  };
  basketball: {
    loaded: number;
    target: number;
    percent: number;
    status: 'pending' | 'loading' | 'training' | 'completed' | 'error';
  };
  training: {
    completed: boolean;
    accuracy: number | null;
    lastRun: string | null;
  };
}

interface ModelMetrics {
  model_version: string;
  accuracy: number;
  home_accuracy: number;
  draw_accuracy: number;
  away_accuracy: number;
  roi_percent: number;
  total_predictions: number;
  training_date: string;
}

// ===== COMPOSANT PRINCIPAL =====

export default function MLConseilsExpert() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('progress');
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgress>({
    football: { loaded: 0, target: 2000, percent: 0, status: 'pending' },
    basketball: { loaded: 0, target: 500, percent: 0, status: 'pending' },
    training: { completed: false, accuracy: null, lastRun: null }
  });

  useEffect(() => {
    fetchMetrics();
    fetchTrainingProgress();
    
    const interval = setInterval(fetchTrainingProgress, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/ml/train');
      const data = await response.json();
      
      if (data.status === 'success' && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Erreur chargement métriques:', err);
    }
  };

  const fetchTrainingProgress = async () => {
    try {
      const response = await fetch('/api/cron-ml?action=progress&secret=steo-elite-cron-2026');
      const data = await response.json();
      
      if (data.status === 'success' && data.progress) {
        setTrainingProgress({
          football: {
            loaded: data.progress.football?.loaded || 0,
            target: data.progress.football?.target || 2000,
            percent: data.progress.football?.percent || 0,
            status: data.progress.football?.status || 'pending'
          },
          basketball: {
            loaded: data.progress.basketball?.loaded || 0,
            target: data.progress.basketball?.target || 500,
            percent: data.progress.basketball?.percent || 0,
            status: data.progress.basketball?.status || 'pending'
          },
          training: {
            completed: data.progress.training?.completed || false,
            accuracy: data.progress.training?.accuracy || null,
            lastRun: data.progress.training?.lastRun || null
          }
        });
      }
    } catch (err) {
      console.error('Erreur chargement progression:', err);
    }
  };

  const handleTrain = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/ml/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season: '2024-2025',
          sport: 'football',
          testSplit: 0.2
        })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setMetrics(data.result);
        fetchTrainingProgress();
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeNBA = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/cron-ml?action=nba&secret=steo-elite-cron-2026', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.status !== 'success') {
        setError(data.message || 'Erreur lors du scraping NBA');
      } else {
        setTimeout(fetchTrainingProgress, 2000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ===== COMPOSANT JAUGE CIRCULAIRE =====

  const CircularProgress = ({ 
    percent, 
    status, 
    label, 
    icon,
    loaded,
    target
  }: { 
    percent: number; 
    status: string; 
    label: string;
    icon: React.ReactNode;
    loaded: number;
    target: number;
  }) => {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percent / 100) * circumference;
    
    const getStrokeColor = () => {
      switch (status) {
        case 'completed': return '#22c55e';
        case 'loading':
        case 'training': return '#3b82f6';
        case 'error': return '#ef4444';
        default: return '#9ca3af';
      }
    };

    return (
      <div className="flex flex-col items-center p-4">
        <div className="relative">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r={radius}
              stroke="#e5e7eb"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="64"
              cy="64"
              r={radius}
              stroke={getStrokeColor()}
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {icon}
            <span className="text-2xl font-bold" style={{ color: getStrokeColor() }}>
              {percent}%
            </span>
          </div>
        </div>
        <div className="mt-3 text-center">
          <div className="font-medium">{label}</div>
          <p className="text-sm text-muted-foreground mt-1">
            {loaded.toLocaleString()} / {target.toLocaleString()} matchs
          </p>
          <Badge variant={status === 'completed' ? 'default' : 'secondary'} className="mt-2">
            {status === 'completed' ? '✅ Terminé' : 
             status === 'loading' || status === 'training' ? '⏳ En cours...' :
             status === 'error' ? '❌ Erreur' : '⏳ En attente'}
          </Badge>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-500" />
            ML Conseils Expert
          </h2>
          <p className="text-muted-foreground">
            Prédictions optimisées par Machine Learning (Admin uniquement)
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          v{metrics?.model_version || '2.0.0'}
        </Badge>
      </div>

      {/* JAUGES DE PROGRESSION CIRCULAIRES */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Progression de l'Apprentissage
          </CardTitle>
          <CardDescription>
            État du chargement des données et de l'entraînement du modèle
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CircularProgress 
              percent={trainingProgress.football.percent}
              status={trainingProgress.football.status}
              label="⚽ Football"
              icon={<Trophy className="h-5 w-5 text-yellow-500" />}
              loaded={trainingProgress.football.loaded}
              target={trainingProgress.football.target}
            />
            
            <CircularProgress 
              percent={trainingProgress.basketball.percent}
              status={trainingProgress.basketball.status}
              label="🏀 Basketball"
              icon={<CircleDot className="h-5 w-5 text-orange-500" />}
              loaded={trainingProgress.basketball.loaded}
              target={trainingProgress.basketball.target}
            />
            
            {/* Statut Entraînement */}
            <div className="flex flex-col items-center p-4">
              <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-8"
                style={{ 
                  borderColor: trainingProgress.training.completed ? '#22c55e' : '#e5e7eb'
                }}>
                {trainingProgress.training.completed ? (
                  <CheckCircle className="h-12 w-12 text-green-500" />
                ) : (
                  <Brain className="h-12 w-12 text-gray-400" />
                )}
              </div>
              <div className="mt-3 text-center">
                <div className="font-medium">🤖 Entraînement</div>
                {trainingProgress.training.completed ? (
                  <>
                    <p className="text-sm text-muted-foreground mt-1">
                      Accuracy: <span className="font-bold text-green-500">
                        {trainingProgress.training.accuracy?.toFixed(1)}%
                      </span>
                    </p>
                    <Badge className="mt-2 bg-green-500">✅ Terminé</Badge>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mt-1">
                      En attente de données
                    </p>
                    <Badge variant="secondary" className="mt-2">⏳ En attente</Badge>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Barre de progression globale */}
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progression Globale</span>
              <span className="text-sm text-muted-foreground">
                {Math.round((trainingProgress.football.percent + trainingProgress.basketball.percent) / 2)}%
              </span>
            </div>
            <Progress 
              value={(trainingProgress.football.percent + trainingProgress.basketball.percent) / 2}
              className="h-3"
            />
          </div>
        </CardContent>
      </Card>

      {/* Métriques globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Accuracy</p>
                <p className="text-2xl font-bold">
                  {metrics?.accuracy?.toFixed(1) || '--'}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
                {metrics?.roi_percent && metrics.roi_percent > 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <p className="text-sm text-muted-foreground">ROI</p>
                  <p className="text-2xl font-bold">
                    {metrics?.roi_percent?.toFixed(1) || '--'}%
                  </p>
                </div>
              </div>
            </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Matchs DB</p>
                <p className="text-2xl font-bold">
                  {(trainingProgress.football.loaded + trainingProgress.basketball.loaded).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Prédictions</p>
                <p className="text-2xl font-bold">
                  {metrics?.total_predictions?.toLocaleString() || '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Onglets */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="progress">Progression</TabsTrigger>
          <TabsTrigger value="metrics">Métriques</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Détails de la Progression</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Football */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    ⚽ Football
                  </span>
                  <Badge variant={trainingProgress.football.status === 'completed' ? 'default' : 'secondary'}>
                    {trainingProgress.football.status === 'completed' ? '✅ Terminé' : '⏳ En cours'}
                  </Badge>
                </div>
                <Progress value={trainingProgress.football.percent} className="h-3" />
                <div className="flex justify-between text-sm text-muted">
                  <span>{trainingProgress.football.loaded.toLocaleString()} matchs</span>
                  <span>Objectif: {trainingProgress.football.target.toLocaleString()}</span>
                </div>
              </div>

              {/* Basketball */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium flex items-center gap-2">
                    <CircleDot className="h-4 w-4 text-orange-500" />
                    🏀 Basketball
                  </span>
                  <Badge variant={trainingProgress.basketball.status === 'completed' ? 'default' : 'secondary'}>
                    {trainingProgress.basketball.status === 'completed' ? '✅ Terminé' : '⏳ En attente'}
                  </Badge>
                </div>
                <Progress value={trainingProgress.basketball.percent} className="h-3" />
                <div className="flex justify-between text-sm text-muted">
                  <span>{trainingProgress.basketball.loaded.toLocaleString()} matchs</span>
                  <span>Objectif: {trainingProgress.basketball.target.toLocaleString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t flex flex-wrap gap-2">
                <Button onClick={handleTrain} disabled={loading || trainingProgress.football.status !== 'completed'}>
                  <Brain className="h-4 w-4 mr-2" />
                  Entraîner
                </Button>
                <Button onClick={handleScrapeNBA} disabled={loading} variant="outline">
                  <CircleDot className="h-4 w-4 mr-2" />
                  Charger NBA
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance du Modèle</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Accuracy Home</span>
                      <span className="text-sm font-medium">{metrics.home_accuracy?.toFixed(1)}%</span>
                    </div>
                    <Progress value={metrics.home_accuracy} className="h-2" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Accuracy Draw</span>
                      <span className="text-sm font-medium">{metrics.draw_accuracy?.toFixed(1)}%</span>
                    </div>
                    <Progress value={metrics.draw_accuracy} className="h-2" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">Accuracy Away</span>
                      <span className="text-sm font-medium">{metrics.away_accuracy?.toFixed(1)}%</span>
                    </div>
                    <Progress value={metrics.away_accuracy} className="h-2" />
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Dernier entraînement: {' '}
                      {metrics.training_date 
                        ? new Date(metrics.training_date).toLocaleString('fr-FR')
                        : 'N/A'
                      }
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Aucune métrique disponible. Lancez un entraînement.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Administration ML</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={handleTrain} disabled={loading || trainingProgress.football.status !== 'completed'}>
                  <Brain className="h-4 w-4 mr-2" />
                  Entraîner Modèle
                </Button>
                
                <Button onClick={handleScrapeNBA} disabled={loading} variant="outline">
                  <CircleDot className="h-4 w-4 mr-2" />
                  Charger NBA
                </Button>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-2">Statut Système</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Modèle Dixon-Coles v2.0</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {trainingProgress.training.completed ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    )}
                    <span>
                      Entraînement: {trainingProgress.training.completed 
                        ? `✅ Terminé (${trainingProgress.training.accuracy?.toFixed(1)}%)` 
                        : '⏳ En attente'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
