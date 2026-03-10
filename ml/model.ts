/**
 * Modèle ML léger pour prédiction sportive
 * 
 * Architecture: Réseau de neurones simple (Multi-Layer Perceptron)
 - Compatible JSON pour export/import
 * - Inférence rapide sur Vercel
 */

import { normalizeFeatures, MatchFeatures, FEATURE_NAMES } from './featureEngineering';

// ===== INTERFACES DU MODÈLE =====

export interface ModelConfig {
  inputSize: number;
  hiddenLayers: number[];
  outputSize: number;
  activation: 'relu' | 'sigmoid' | 'tanh';
  outputActivation: 'softmax' | 'sigmoid';
}

export interface ModelWeights {
  layers: {
    weights: number[][];
    biases: number[];
  }[];
  config: ModelConfig;
  trainingInfo: {
    epochs: number;
    loss: number;
    accuracy: number;
    trainedAt: string;
    samplesUsed: number;
  };
  featureStats?: {
    mean: number[];
    std: number[];
  };
}

export interface PredictionResult {
  homeWin: number; // Probabilité 0-1
  draw: number;
  awayWin: number;
  predictedResult: 'home' | 'draw' | 'away';
  confidence: number; // 0-1
  predictedScore: {
    home: number;
    away: number;
  };
  overUnder25: {
    over: number;
    under: number;
  };
  btts: {
    yes: number;
    no: number;
  };
}

// ===== FONCTIONS D'ACTIVATION =====

function relu(x: number): number {
  return Math.max(0, x);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

function tanh(x: number): number {
  return Math.tanh(x);
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exp = arr.map(x => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(x => x / sum);
}

// ===== CLASSE DU MODÈLE =====

export class MLPredictor {
  private weights: ModelWeights | null = null;
  private config: ModelConfig;

  constructor() {
    this.config = {
      inputSize: 34, // Nombre de features
      hiddenLayers: [64, 32, 16],
      outputSize: 3, // home, draw, away
      activation: 'relu',
      outputActivation: 'softmax'
    };
  }

  /**
   * Charge un modèle pré-entraîné depuis JSON
   */
  loadModel(weights: ModelWeights): void {
    this.weights = weights;
    this.config = weights.config;
    console.log(`✅ Modèle chargé: ${weights.trainingInfo.samplesUsed} échantillons, accuracy ${weights.trainingInfo.accuracy.toFixed(2)}%`);
  }

  /**
   * Vérifie si le modèle est chargé
   */
  isLoaded(): boolean {
    return this.weights !== null;
  }

  /**
   * Prédiction pour un match
   */
  predict(features: MatchFeatures): PredictionResult {
    if (!this.weights) {
      throw new Error('Modèle non chargé. Appelez loadModel() d\'abord.');
    }

    // Normaliser les features
    let normalizedInput = normalizeFeatures(features);
    
    // Appliquer la normalisation statistique si disponible
    if (this.weights.featureStats) {
      normalizedInput = normalizedInput.map((x, i) => {
        const mean = this.weights!.featureStats!.mean[i] || 0;
        const std = this.weights!.featureStats!.std[i] || 1;
        return (x - mean) / (std + 1e-8);
      });
    }

    // Forward pass
    let activation = normalizedInput;
    
    for (let i = 0; i < this.weights.layers.length; i++) {
      const layer = this.weights.layers[i];
      const newActivation: number[] = [];
      
      for (let j = 0; j < layer.biases.length; j++) {
        let sum = layer.biases[j];
        
        for (let k = 0; k < activation.length; k++) {
          sum += activation[k] * layer.weights[k][j];
        }
        
        // Fonction d'activation
        if (i < this.weights.layers.length - 1) {
          // Couches cachées
          switch (this.config.activation) {
            case 'relu': newActivation.push(relu(sum)); break;
            case 'sigmoid': newActivation.push(sigmoid(sum)); break;
            case 'tanh': newActivation.push(tanh(sum)); break;
          }
        } else {
          // Couche de sortie
          newActivation.push(sum);
        }
      }
      
      activation = newActivation;
    }

    // Softmax pour les probabilités
    const probs = softmax(activation);
    
    // Déterminer le résultat prédit
    let predictedResult: 'home' | 'draw' | 'away';
    let maxProb = 0;
    
    if (probs[0] >= probs[1] && probs[0] >= probs[2]) {
      predictedResult = 'home';
      maxProb = probs[0];
    } else if (probs[1] >= probs[0] && probs[1] >= probs[2]) {
      predictedResult = 'draw';
      maxProb = probs[1];
    } else {
      predictedResult = 'away';
      maxProb = probs[2];
    }

    // Prédiction du score basée sur les stats
    const predictedHomeGoals = Math.round(
      features.homeAvgGoalsScored * 0.6 + features.awayAvgGoalsConceded * 0.4
    );
    const predictedAwayGoals = Math.round(
      features.awayAvgGoalsScored * 0.6 + features.homeAvgGoalsConceded * 0.4
    );

    // Over/Under 2.5 basé sur les stats
    const expectedTotal = predictedHomeGoals + predictedAwayGoals;
    const overProb = sigmoid((expectedTotal - 2.5) * 2);
    
    // BTTS
    const bttsProb = sigmoid(
      (features.homeAvgGoalsScored - 0.8) * 2 +
      (features.awayAvgGoalsScored - 0.8) * 2 -
      (features.homeAvgGoalsConceded + features.awayAvgGoalsConceded - 2) * 0.5
    );

    return {
      homeWin: Math.round(probs[0] * 1000) / 1000,
      draw: Math.round(probs[1] * 1000) / 1000,
      awayWin: Math.round(probs[2] * 1000) / 1000,
      predictedResult,
      confidence: maxProb,
      predictedScore: {
        home: predictedHomeGoals,
        away: predictedAwayGoals
      },
      overUnder25: {
        over: Math.round(overProb * 1000) / 1000,
        under: Math.round((1 - overProb) * 1000) / 1000
      },
      btts: {
        yes: Math.round(bttsProb * 1000) / 1000,
        no: Math.round((1 - bttsProb) * 1000) / 1000
      }
    };
  }

  /**
   * Prédiction rapide depuis des features déjà normalisées
   */
  predictFromNormalized(normalizedInput: number[]): number[] {
    if (!this.weights) {
      throw new Error('Modèle non chargé');
    }

    let activation = normalizedInput;
    
    for (let i = 0; i < this.weights.layers.length; i++) {
      const layer = this.weights.layers[i];
      const newActivation: number[] = [];
      
      for (let j = 0; j < layer.biases.length; j++) {
        let sum = layer.biases[j];
        
        for (let k = 0; k < activation.length; k++) {
          sum += activation[k] * layer.weights[k][j];
        }
        
        if (i < this.weights.layers.length - 1) {
          switch (this.config.activation) {
            case 'relu': newActivation.push(relu(sum)); break;
            case 'sigmoid': newActivation.push(sigmoid(sum)); break;
            case 'tanh': newActivation.push(tanh(sum)); break;
          }
        } else {
          newActivation.push(sum);
        }
      }
      
      activation = newActivation;
    }

    return softmax(activation);
  }

  /**
   * Retourne la configuration du modèle
   */
  getConfig(): ModelConfig {
    return this.config;
  }

  /**
   * Retourne les noms des features
   */
  getFeatureNames(): string[] {
    return FEATURE_NAMES;
  }
}

// Instance globale pour l'inférence
let globalPredictor: MLPredictor | null = null;

/**
 * Obtient l'instance globale du prédicteur
 */
export function getPredictor(): MLPredictor {
  if (!globalPredictor) {
    globalPredictor = new MLPredictor();
  }
  return globalPredictor;
}

/**
 * Initialise le prédicteur avec un modèle pré-entraîné
 */
export function initPredictor(weights: ModelWeights): void {
  const predictor = getPredictor();
  predictor.loadModel(weights);
}
