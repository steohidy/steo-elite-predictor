/**
 * Système de stockage Prisma pour les pronostics
 * Utilise Supabase PostgreSQL via Prisma
 * VERSION 3.0 - Persistant sur Vercel
 */

import prisma from './db';
import crypto from 'crypto';

// Secret pour la validation des données (sécurité)
const DATA_SECRET = process.env.DATA_SECRET || 'steo-elite-secret-2026';

// Structure des données
interface Prediction {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  matchDate: Date;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  predictedResult: string;
  predictedGoals?: string | null;
  predictedCards?: string | null;
  confidence: string;
  riskPercentage: number;
  homeScore?: number | null;
  awayScore?: number | null;
  actualResult?: string | null;
  status: string;
  resultMatch?: boolean | null;
  goalsMatch?: boolean | null;
  cardsMatch?: boolean | null;
  createdAt: Date;
  checkedAt?: Date | null;
  signature?: string | null;
}

// Statistiques détaillées
interface DetailedStats {
  total: number;
  correct: number;
  rate: number;
}

interface PeriodStats {
  totalPredictions: number;
  results: DetailedStats;
  goals: DetailedStats;
  cards: DetailedStats;
  overall: number;
  pending: number;
  completed: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface AllStats {
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
  overall: PeriodStats;
}

// Stats par catégorie de risque
interface RiskCategoryStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
}

// Stats par sport
interface SportStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
}

// Générer une signature pour l'intégrité des données
function generateSignature(matchId: string, homeTeam: string, awayTeam: string, predictedResult: string): string {
  const payload = `${matchId}|${homeTeam}|${awayTeam}|${predictedResult}|${DATA_SECRET}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

// Vérifier la signature d'un pronostic
function verifySignature(prediction: Prediction): boolean {
  if (!prediction.signature) return true; // Rétrocompatibilité
  const expected = generateSignature(prediction.matchId, prediction.homeTeam, prediction.awayTeam, prediction.predictedResult);
  return prediction.signature === expected;
}

// Obtenir le début de la journée (minuit)
function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Obtenir le début de la semaine (lundi)
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Obtenir le début du mois
function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Calculer les stats pour une période
function calculatePeriodStats(predictions: Prediction[]): PeriodStats {
  const completed = predictions.filter(p => p.status === 'completed');
  const pending = predictions.filter(p => p.status === 'pending');

  // Stats des résultats (1N2)
  const resultsPredicted = completed.filter(p => p.resultMatch !== null && p.resultMatch !== undefined);
  const resultsCorrect = completed.filter(p => p.resultMatch === true);

  // Stats des buts (Over/Under/BTTS)
  const goalsPredicted = completed.filter(p => p.goalsMatch !== null && p.goalsMatch !== undefined);
  const goalsCorrect = completed.filter(p => p.goalsMatch === true);

  // Stats des cartons
  const cardsPredicted = completed.filter(p => p.predictedCards && p.cardsMatch !== null && p.cardsMatch !== undefined);
  const cardsCorrect = completed.filter(p => p.cardsMatch === true);

  // Calcul du taux global
  const totalChecks = resultsPredicted.length + goalsPredicted.length + cardsPredicted.length;
  const totalCorrect = resultsCorrect.length + goalsCorrect.length + cardsCorrect.length;

  // Victoires et défaites (basé sur les résultats 1N2)
  const wins = resultsCorrect.length;
  const losses = resultsPredicted.length - resultsCorrect.length;

  return {
    totalPredictions: predictions.length,
    results: {
      total: resultsPredicted.length,
      correct: resultsCorrect.length,
      rate: resultsPredicted.length > 0
        ? Math.round((resultsCorrect.length / resultsPredicted.length) * 100)
        : 0
    },
    goals: {
      total: goalsPredicted.length,
      correct: goalsCorrect.length,
      rate: goalsPredicted.length > 0
        ? Math.round((goalsCorrect.length / goalsPredicted.length) * 100)
        : 0
    },
    cards: {
      total: cardsPredicted.length,
      correct: cardsCorrect.length,
      rate: cardsPredicted.length > 0
        ? Math.round((cardsCorrect.length / cardsPredicted.length) * 100)
        : 0
    },
    overall: totalChecks > 0
      ? Math.round((totalCorrect / totalChecks) * 100)
      : 0,
    pending: pending.length,
    completed: completed.length,
    wins,
    losses,
    winRate: resultsPredicted.length > 0
      ? Math.round((wins / resultsPredicted.length) * 100)
      : 0
  };
}

// Catégorie de risque
type RiskCategory = 'sure' | 'modere' | 'risque';

function getRiskCategory(risk: number): RiskCategory {
  if (risk <= 30) return 'sure';
  if (risk <= 50) return 'modere';
  return 'risque';
}

// Calculer les stats par catégorie de risque
function calculateRiskStats(predictions: Prediction[]): RiskCategoryStats {
  const completed = predictions.filter(p => p.status === 'completed');
  const pending = predictions.filter(p => p.status === 'pending');
  const wins = completed.filter(p => p.resultMatch === true).length;
  const losses = completed.filter(p => p.resultMatch === false).length;

  return {
    total: predictions.length,
    wins,
    losses,
    pending: pending.length,
    winRate: completed.length > 0 ? Math.round((wins / completed.length) * 100) : 0
  };
}

// === API publique ===

export const PredictionStore = {
  // Récupérer tous les pronostics
  async getAll(): Promise<Prediction[]> {
    const results = await prisma.prediction.findMany({
      orderBy: { matchDate: 'desc' }
    });
    return results as Prediction[];
  },

  // Récupérer les pronostics en attente
  async getPending(): Promise<Prediction[]> {
    const results = await prisma.prediction.findMany({
      where: { status: 'pending' },
      orderBy: { matchDate: 'asc' }
    });
    return results as Prediction[];
  },

  // Récupérer les pronostics terminés
  async getCompleted(): Promise<Prediction[]> {
    const results = await prisma.prediction.findMany({
      where: { status: 'completed' },
      orderBy: { matchDate: 'desc' }
    });
    return results as Prediction[];
  },

  // Ajouter un pronostic
  async add(data: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>): Promise<Prediction> {
    // Vérifier si déjà existant
    const exists = await prisma.prediction.findUnique({
      where: { matchId: data.matchId }
    });

    if (exists) return exists as Prediction;

    const signature = generateSignature(
      data.matchId,
      data.homeTeam,
      data.awayTeam,
      data.predictedResult
    );

    const prediction = await prisma.prediction.create({
      data: {
        matchId: data.matchId,
        homeTeam: data.homeTeam,
        awayTeam: data.awayTeam,
        league: data.league,
        sport: data.sport,
        matchDate: new Date(data.matchDate),
        oddsHome: data.oddsHome,
        oddsDraw: data.oddsDraw,
        oddsAway: data.oddsAway,
        predictedResult: data.predictedResult,
        predictedGoals: data.predictedGoals,
        predictedCards: data.predictedCards,
        confidence: data.confidence,
        riskPercentage: data.riskPercentage,
        status: 'pending',
        signature
      }
    });

    return prediction as Prediction;
  },

  // Ajouter plusieurs pronostics
  async addMany(predictions: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>[]): Promise<number> {
    let added = 0;

    for (const data of predictions) {
      const exists = await prisma.prediction.findUnique({
        where: { matchId: data.matchId }
      });

      if (!exists) {
        const signature = generateSignature(
          data.matchId,
          data.homeTeam,
          data.awayTeam,
          data.predictedResult
        );

        await prisma.prediction.create({
          data: {
            matchId: data.matchId,
            homeTeam: data.homeTeam,
            awayTeam: data.awayTeam,
            league: data.league,
            sport: data.sport,
            matchDate: new Date(data.matchDate),
            oddsHome: data.oddsHome,
            oddsDraw: data.oddsDraw,
            oddsAway: data.oddsAway,
            predictedResult: data.predictedResult,
            predictedGoals: data.predictedGoals,
            predictedCards: data.predictedCards,
            confidence: data.confidence,
            riskPercentage: data.riskPercentage,
            status: 'pending',
            signature
          }
        });
        added++;
      }
    }

    return added;
  },

  // Mettre à jour un pronostic
  async update(matchId: string, data: Partial<Prediction>): Promise<boolean> {
    try {
      await prisma.prediction.update({
        where: { matchId },
        data: {
          ...data,
          matchDate: data.matchDate ? new Date(data.matchDate) : undefined,
          checkedAt: data.checkedAt ? new Date(data.checkedAt) : undefined
        }
      });
      return true;
    } catch {
      return false;
    }
  },

  // Marquer comme terminé avec résultats
  async complete(matchId: string, result: {
    homeScore: number;
    awayScore: number;
    actualResult: string;
    resultMatch: boolean;
    goalsMatch?: boolean;
    cardsMatch?: boolean;
  }): Promise<boolean> {
    return this.update(matchId, {
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      actualResult: result.actualResult,
      resultMatch: result.resultMatch,
      goalsMatch: result.goalsMatch,
      cardsMatch: result.cardsMatch,
      status: 'completed',
      checkedAt: new Date()
    });
  },

  // Calculer les statistiques détaillées
  async getDetailedStats(): Promise<AllStats> {
    const predictions = await this.getAll();
    const now = new Date();

    const startOfDay = getStartOfDay(now);
    const startOfWeek = getStartOfWeek(now);
    const startOfMonth = getStartOfMonth(now);

    // Filtrer par période
    const dailyPredictions = predictions.filter(p =>
      new Date(p.matchDate) >= startOfDay
    );

    const weeklyPredictions = predictions.filter(p =>
      new Date(p.matchDate) >= startOfWeek
    );

    const monthlyPredictions = predictions.filter(p =>
      new Date(p.matchDate) >= startOfMonth
    );

    return {
      daily: calculatePeriodStats(dailyPredictions),
      weekly: calculatePeriodStats(weeklyPredictions),
      monthly: calculatePeriodStats(monthlyPredictions),
      overall: calculatePeriodStats(predictions)
    };
  },

  // Ancienne méthode pour compatibilité
  async getStats() {
    const detailed = await this.getDetailedStats();
    return detailed.overall;
  },

  // Obtenir les stats par catégorie de risque
  async getStatsByRisk(): Promise<{ sure: RiskCategoryStats; modere: RiskCategoryStats; risque: RiskCategoryStats }> {
    const predictions = await this.getAll();

    const surePredictions = predictions.filter(p => getRiskCategory(p.riskPercentage) === 'sure');
    const moderePredictions = predictions.filter(p => getRiskCategory(p.riskPercentage) === 'modere');
    const risquePredictions = predictions.filter(p => getRiskCategory(p.riskPercentage) === 'risque');

    return {
      sure: calculateRiskStats(surePredictions),
      modere: calculateRiskStats(moderePredictions),
      risque: calculateRiskStats(risquePredictions)
    };
  },

  // Obtenir les stats par sport
  async getStatsBySport(): Promise<{ foot: SportStats; basket: SportStats }> {
    const predictions = await this.getAll();

    const footPredictions = predictions.filter(p => p.sport === 'Foot');
    const basketPredictions = predictions.filter(p => p.sport === 'Basket');

    const calcStats = (preds: Prediction[]): SportStats => {
      const completed = preds.filter(p => p.status === 'completed');
      const pending = preds.filter(p => p.status === 'pending');
      const wins = completed.filter(p => p.resultMatch === true).length;
      const losses = completed.filter(p => p.resultMatch === false).length;

      return {
        total: preds.length,
        wins,
        losses,
        pending: pending.length,
        winRate: completed.length > 0 ? Math.round((wins / completed.length) * 100) : 0
      };
    };

    return {
      foot: calcStats(footPredictions),
      basket: calcStats(basketPredictions)
    };
  },

  // Obtenir les stats complètes
  async getCompleteStats() {
    const predictions = await this.getAll();
    const statsByRisk = await this.getStatsByRisk();
    const statsBySport = await this.getStatsBySport();
    const overall = calculatePeriodStats(predictions);

    return {
      byRisk: statsByRisk,
      bySport: statsBySport,
      overall
    };
  },

  // Nettoyer les anciennes données (plus de 2 mois)
  async cleanup(): Promise<number> {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const result = await prisma.prediction.deleteMany({
      where: {
        matchDate: { lt: twoMonthsAgo }
      }
    });

    return result.count;
  },

  // Supprimer TOUTES les données (pour reset)
  async clearAll(): Promise<boolean> {
    try {
      await prisma.prediction.deleteMany({});
      return true;
    } catch {
      return false;
    }
  },

  // Infos du stockage
  async getInfo() {
    const predictions = await this.getAll();
    const detailed = await this.getDetailedStats();

    return {
      total: predictions.length,
      pending: predictions.filter(p => p.status === 'pending').length,
      completed: predictions.filter(p => p.status === 'completed').length,
      lastUpdate: new Date().toISOString(),
      version: '3.0-prisma',
      dailyStats: detailed.daily,
      weeklyStats: detailed.weekly,
      monthlyStats: detailed.monthly
    };
  },

  // Vérifier l'intégrité des données
  async verifyIntegrity(): Promise<{ valid: boolean; invalidCount: number; total: number }> {
    const predictions = await this.getAll();
    let invalidCount = 0;

    for (const p of predictions) {
      if (p.status === 'completed' && !verifySignature(p)) {
        invalidCount++;
      }
    }

    return {
      valid: invalidCount === 0,
      invalidCount,
      total: predictions.length
    };
  }
};

export default PredictionStore;
