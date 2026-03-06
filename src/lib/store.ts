/**
 * Système de stockage fichier pour les pronostics
 * Utilise un fichier JSON persistant sur Vercel
 * VERSION 2.0 - Stats détaillées par type et période
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Chemin du fichier de données
const DATA_FILE = path.join(process.cwd(), 'data', 'predictions.json');

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
  matchDate: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  predictedResult: string;
  predictedGoals?: string;
  predictedCards?: string;
  confidence: string;
  riskPercentage: number;
  homeScore?: number;
  awayScore?: number;
  totalGoals?: number;
  actualResult?: string;
  status: 'pending' | 'completed';
  resultMatch?: boolean;
  goalsMatch?: boolean;
  cardsMatch?: boolean;
  createdAt: string;
  checkedAt?: string;
  signature?: string; // Pour l'intégrité des données
}

interface DataStore {
  predictions: Prediction[];
  lastUpdate: string;
  version: string;
  checksum?: string;
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
  riskCategories?: {
    sure: RiskCategoryStats;      // ≤30%
    modere: RiskCategoryStats;    // 31-50%
    risque: RiskCategoryStats;    // >50%
  };
}

// Stats complètes
interface CompleteStats {
  byRisk: {
    sure: RiskCategoryStats;      // ≤30% - Sûr
    modere: RiskCategoryStats;    // 31-50% - Modéré
    risque: RiskCategoryStats;    // >50% - Risqué
  };
  bySport: {
    foot: SportStats;
    basket: SportStats;
  };
  overall: PeriodStats;
}

// S'assurer que le dossier data existe
function ensureDataDir() {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Générer une signature pour l'intégrité des données
function generateSignature(data: Prediction): string {
  const payload = `${data.matchId}|${data.homeTeam}|${data.awayTeam}|${data.predictedResult}|${DATA_SECRET}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

// Vérifier la signature d'un pronostic
function verifySignature(data: Prediction): boolean {
  if (!data.signature) return true; // Rétrocompatibilité
  const expected = generateSignature(data);
  return data.signature === expected;
}

// Charger les données
function loadData(): DataStore {
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(content);
      
      // Vérifier l'intégrité des pronostics terminés
      if (data.predictions) {
        data.predictions = data.predictions.filter((p: Prediction) => {
          if (p.status === 'completed' && !verifySignature(p)) {
            console.warn(`⚠️ Pronostic ${p.matchId} invalide, exclusion`);
            return false;
          }
          return true;
        });
      }
      
      return data;
    }
  } catch (error) {
    console.error('Erreur chargement données:', error);
  }
  return { 
    predictions: [], 
    lastUpdate: new Date().toISOString(),
    version: '2.0'
  };
}

// Sauvegarder les données
function saveData(data: DataStore) {
  try {
    ensureDataDir();
    data.lastUpdate = new Date().toISOString();
    data.version = '2.0';
    
    // Générer checksum global
    const payload = JSON.stringify(data.predictions.map(p => p.id).sort());
    data.checksum = crypto.createHash('md5').update(payload).digest('hex');
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Erreur sauvegarde données:', error);
    return false;
  }
}

// Générer un ID unique
function generateId(): string {
  return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
  const resultsPredicted = completed.filter(p => p.resultMatch !== undefined);
  const resultsCorrect = completed.filter(p => p.resultMatch === true);
  
  // Stats des buts (Over/Under/BTTS)
  const goalsPredicted = completed.filter(p => p.goalsMatch !== undefined);
  const goalsCorrect = completed.filter(p => p.goalsMatch === true);
  
  // Stats des cartons
  const cardsPredicted = completed.filter(p => p.predictedCards && p.cardsMatch !== undefined);
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

// Calculer les stats complètes par catégorie de risque et sport
function calculateCompleteStats(predictions: Prediction[]): CompleteStats {
  // Par catégorie de risque
  const surePredictions = predictions.filter(p => getRiskCategory(p.riskPercentage) === 'sure');
  const moderePredictions = predictions.filter(p => getRiskCategory(p.riskPercentage) === 'modere');
  const risquePredictions = predictions.filter(p => getRiskCategory(p.riskPercentage) === 'risque');
  
  // Par sport
  const footPredictions = predictions.filter(p => p.sport === 'Foot');
  const basketPredictions = predictions.filter(p => p.sport === 'Basket');
  
  // Stats par sport avec catégories
  const calculateSportStats = (sportPredictions: Prediction[]): SportStats => {
    const completed = sportPredictions.filter(p => p.status === 'completed');
    const pending = sportPredictions.filter(p => p.status === 'pending');
    const wins = completed.filter(p => p.resultMatch === true).length;
    const losses = completed.filter(p => p.resultMatch === false).length;
    
    return {
      total: sportPredictions.length,
      wins,
      losses,
      pending: pending.length,
      winRate: completed.length > 0 ? Math.round((wins / completed.length) * 100) : 0,
      riskCategories: {
        sure: calculateRiskStats(sportPredictions.filter(p => getRiskCategory(p.riskPercentage) === 'sure')),
        modere: calculateRiskStats(sportPredictions.filter(p => getRiskCategory(p.riskPercentage) === 'modere')),
        risque: calculateRiskStats(sportPredictions.filter(p => getRiskCategory(p.riskPercentage) === 'risque'))
      }
    };
  };
  
  return {
    byRisk: {
      sure: calculateRiskStats(surePredictions),
      modere: calculateRiskStats(moderePredictions),
      risque: calculateRiskStats(risquePredictions)
    },
    bySport: {
      foot: calculateSportStats(footPredictions),
      basket: calculateSportStats(basketPredictions)
    },
    overall: calculatePeriodStats(predictions)
  };
}

// === API publique ===

export const PredictionStore = {
  // Récupérer tous les pronostics
  getAll(): Prediction[] {
    return loadData().predictions;
  },

  // Récupérer les pronostics en attente
  getPending(): Prediction[] {
    return loadData().predictions.filter(p => p.status === 'pending');
  },

  // Récupérer les pronostics terminés
  getCompleted(): Prediction[] {
    return loadData().predictions.filter(p => p.status === 'completed');
  },

  // Ajouter un pronostic
  add(data: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>): Prediction {
    const store = loadData();
    
    // Vérifier si déjà existant
    const exists = store.predictions.find(p => p.matchId === data.matchId);
    if (exists) return exists;
    
    const prediction: Prediction = {
      ...data,
      id: generateId(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // Ajouter signature pour l'intégrité
    prediction.signature = generateSignature(prediction);
    
    store.predictions.push(prediction);
    saveData(store);
    
    return prediction;
  },

  // Ajouter plusieurs pronostics
  addMany(predictions: Omit<Prediction, 'id' | 'createdAt' | 'status' | 'signature'>[]): number {
    const store = loadData();
    let added = 0;
    
    for (const data of predictions) {
      const exists = store.predictions.find(p => p.matchId === data.matchId);
      if (!exists) {
        const prediction: Prediction = {
          ...data,
          id: generateId(),
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        prediction.signature = generateSignature(prediction);
        store.predictions.push(prediction);
        added++;
      }
    }
    
    saveData(store);
    return added;
  },

  // Mettre à jour un pronostic
  update(matchId: string, data: Partial<Prediction>): boolean {
    const store = loadData();
    const index = store.predictions.findIndex(p => p.matchId === matchId);
    
    if (index === -1) return false;
    
    store.predictions[index] = {
      ...store.predictions[index],
      ...data
    };
    
    // Mettre à jour la signature si modifié
    if (data.status === 'completed') {
      store.predictions[index].signature = generateSignature(store.predictions[index]);
    }
    
    saveData(store);
    return true;
  },

  // Marquer comme terminé avec résultats
  complete(matchId: string, result: {
    homeScore: number;
    awayScore: number;
    actualResult: string;
    resultMatch: boolean;
    goalsMatch?: boolean;
    cardsMatch?: boolean;
  }): boolean {
    return this.update(matchId, {
      ...result,
      totalGoals: result.homeScore + result.awayScore,
      status: 'completed',
      checkedAt: new Date().toISOString()
    });
  },

  // Calculer les statistiques détaillées
  getDetailedStats(): AllStats {
    const store = loadData();
    const now = new Date();
    
    const startOfDay = getStartOfDay(now);
    const startOfWeek = getStartOfWeek(now);
    const startOfMonth = getStartOfMonth(now);
    
    // Filtrer par période
    const dailyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfDay
    );
    
    const weeklyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfWeek
    );
    
    const monthlyPredictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= startOfMonth
    );
    
    return {
      daily: calculatePeriodStats(dailyPredictions),
      weekly: calculatePeriodStats(weeklyPredictions),
      monthly: calculatePeriodStats(monthlyPredictions),
      overall: calculatePeriodStats(store.predictions)
    };
  },

  // Ancienne méthode pour compatibilité
  getStats() {
    const detailed = this.getDetailedStats();
    return detailed.overall;
  },

  // Obtenir les stats complètes par catégorie de risque et sport
  getCompleteStats(): CompleteStats {
    const store = loadData();
    return calculateCompleteStats(store.predictions);
  },

  // Obtenir les stats par catégorie de risque uniquement
  getStatsByRisk(): { sure: RiskCategoryStats; modere: RiskCategoryStats; risque: RiskCategoryStats } {
    const store = loadData();
    
    const surePredictions = store.predictions.filter(p => getRiskCategory(p.riskPercentage) === 'sure');
    const moderePredictions = store.predictions.filter(p => getRiskCategory(p.riskPercentage) === 'modere');
    const risquePredictions = store.predictions.filter(p => getRiskCategory(p.riskPercentage) === 'risque');
    
    return {
      sure: calculateRiskStats(surePredictions),
      modere: calculateRiskStats(moderePredictions),
      risque: calculateRiskStats(risquePredictions)
    };
  },

  // Obtenir les stats par sport uniquement
  getStatsBySport(): { foot: SportStats; basket: SportStats } {
    const store = loadData();
    
    const footPredictions = store.predictions.filter(p => p.sport === 'Foot');
    const basketPredictions = store.predictions.filter(p => p.sport === 'Basket');
    
    const calcStats = (predictions: Prediction[]): SportStats => {
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
    };
    
    return {
      foot: calcStats(footPredictions),
      basket: calcStats(basketPredictions)
    };
  },

  // Nettoyer les anciennes données (plus de 2 mois)
  cleanup(): number {
    const store = loadData();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    
    const initialCount = store.predictions.length;
    store.predictions = store.predictions.filter(p => 
      new Date(p.matchDate) >= twoMonthsAgo
    );
    
    saveData(store);
    return initialCount - store.predictions.length;
  },

  // Supprimer TOUTES les données (pour reset)
  clearAll(): boolean {
    try {
      const store: DataStore = {
        predictions: [],
        lastUpdate: new Date().toISOString(),
        version: '2.0'
      };
      saveData(store);
      return true;
    } catch {
      return false;
    }
  },

  // Infos du stockage
  getInfo() {
    const store = loadData();
    const detailed = this.getDetailedStats();
    
    return {
      total: store.predictions.length,
      pending: store.predictions.filter(p => p.status === 'pending').length,
      completed: store.predictions.filter(p => p.status === 'completed').length,
      lastUpdate: store.lastUpdate,
      version: store.version,
      checksum: store.checksum,
      dailyStats: detailed.daily,
      weeklyStats: detailed.weekly,
      monthlyStats: detailed.monthly
    };
  },
  
  // Vérifier l'intégrité des données
  verifyIntegrity(): { valid: boolean; invalidCount: number; total: number } {
    const store = loadData();
    let invalidCount = 0;
    
    for (const p of store.predictions) {
      if (p.status === 'completed' && !verifySignature(p)) {
        invalidCount++;
      }
    }
    
    return {
      valid: invalidCount === 0,
      invalidCount,
      total: store.predictions.length
    };
  }
};

export default PredictionStore;
