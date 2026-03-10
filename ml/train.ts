/**
 * Script d'entraînement du modèle ML
 * 
 * ⚠️ À exécuter en LOCAL uniquement (pas sur Vercel)
 * 
 * Usage:
 *   npx ts-node ml/train.ts
 *   ou
 *   bun ml/train.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  MatchFeatures, 
  MatchLabel, 
  TeamStats, 
  generateMatchFeatures,
  normalizeFeatures,
  FEATURE_NAMES
} from './featureEngineering';

// ===== INTERFACES =====

interface TrainingData {
  features: number[][];
  labels: number[][]; // One-hot: [home, draw, away]
  matchInfo: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    date: string;
  }[];
}

interface TrainingConfig {
  epochs: number;
  learningRate: number;
  batchSize: number;
  validationSplit: number;
  hiddenLayers: number[];
  activation: 'relu' | 'sigmoid' | 'tanh';
}

interface ModelWeights {
  layers: {
    weights: number[][];
    biases: number[];
  }[];
  config: {
    inputSize: number;
    hiddenLayers: number[];
    outputSize: number;
    activation: 'relu' | 'sigmoid' | 'tanh';
    outputActivation: 'softmax' | 'sigmoid';
  };
  trainingInfo: {
    epochs: number;
    loss: number;
    accuracy: number;
    trainedAt: string;
    samplesUsed: number;
  };
  featureStats: {
    mean: number[];
    std: number[];
  };
}

// ===== DONNÉES HISTORIQUES (SIMULÉES POUR L'ENTRAÎNEMENT) =====

// Ces données seraient normalement récupérées via API-Football ou autre source
// Pour l'instant, on génère des données synthétiques réalistes

function generateSyntheticTrainingData(numSamples: number = 5000): TrainingData {
  const features: number[][] = [];
  const labels: number[][] = [];
  const matchInfo: { id: string; homeTeam: string; awayTeam: string; date: string }[] = [];

  // Équipes types
  const teams = [
    'Arsenal', 'Chelsea', 'Liverpool', 'Man City', 'Man United', 'Tottenham',
    'Barcelona', 'Real Madrid', 'Atletico Madrid', 'Sevilla',
    'Bayern', 'Dortmund', 'PSG', 'Lyon', 'Juventus', 'Inter', 'Milan', 'Napoli'
  ];

  // Ligues
  const leagues = ['Premier League', 'La Liga', 'Bundesliga', 'Ligue 1', 'Serie A'];

  for (let i = 0; i < numSamples; i++) {
    const homeTeam = teams[Math.floor(Math.random() * teams.length)];
    let awayTeam = teams[Math.floor(Math.random() * teams.length)];
    while (awayTeam === homeTeam) {
      awayTeam = teams[Math.floor(Math.random() * teams.length)];
    }

    // Générer des stats réalistes
    const homeStats = generateRandomTeamStats(homeTeam, true);
    const awayStats = generateRandomTeamStats(awayTeam, false);

    // Générer des cotes basées sur les stats
    const homeStrength = homeStats.avgGoalsScored - homeStats.avgGoalsConceded + homeStats.homeAdvantage * 0.5;
    const awayStrength = awayStats.avgGoalsScored - awayStats.avgGoalsConceded;
    
    const strengthDiff = homeStrength - awayStrength;
    
    // Convertir en cotes (simplifié)
    const baseHomeOdds = Math.max(1.1, 3.0 - strengthDiff * 0.5);
    const baseAwayOdds = Math.max(1.1, 3.0 + strengthDiff * 0.5);
    const baseDrawOdds = 3.2 + Math.abs(strengthDiff) * 0.1;

    // Ajouter du bruit réaliste
    const oddsHome = baseHomeOdds + (Math.random() - 0.5) * 0.3;
    const oddsDraw = baseDrawOdds + (Math.random() - 0.5) * 0.2;
    const oddsAway = baseAwayOdds + (Math.random() - 0.5) * 0.3;

    // Créer les features
    const matchData = {
      id: `match_${i}`,
      homeTeam,
      awayTeam,
      league: leagues[Math.floor(Math.random() * leagues.length)],
      date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      oddsHome: Math.round(oddsHome * 100) / 100,
      oddsDraw: Math.round(oddsDraw * 100) / 100,
      oddsAway: Math.round(oddsAway * 100) / 100
    };

    const matchFeatures = generateMatchFeatures(matchData, homeStats, awayStats);
    const normalizedFeatures = normalizeFeatures(matchFeatures);

    // Générer le résultat basé sur les probabilités implicites + facteurs
    const homeProb = 1 / oddsHome;
    const drawProb = 1 / oddsDraw;
    const awayProb = 1 / oddsAway;
    const total = homeProb + drawProb + awayProb;

    const adjustedHomeProb = (homeProb / total) + (homeStats.homeAdvantage * 0.1) + (homeStats.motivation === 'high' ? 0.05 : 0);
    const adjustedAwayProb = (awayProb / total) - (homeStats.homeAdvantage * 0.05) + (awayStats.motivation === 'high' ? 0.05 : 0);
    const adjustedDrawProb = (drawProb / total) * (1 - Math.abs(strengthDiff) * 0.05);

    // Normaliser
    const probSum = adjustedHomeProb + adjustedDrawProb + adjustedAwayProb;
    const finalProbs = [adjustedHomeProb / probSum, adjustedDrawProb / probSum, adjustedAwayProb / probSum];

    // Simuler le résultat
    const rand = Math.random();
    let result: 'home' | 'draw' | 'away';
    if (rand < finalProbs[0]) {
      result = 'home';
    } else if (rand < finalProbs[0] + finalProbs[1]) {
      result = 'draw';
    } else {
      result = 'away';
    }

    // One-hot encoding
    const label = result === 'home' ? [1, 0, 0] : result === 'draw' ? [0, 1, 0] : [0, 0, 1];

    features.push(normalizedFeatures);
    labels.push(label);
    matchInfo.push({
      id: matchData.id,
      homeTeam,
      awayTeam,
      date: matchData.date
    });
  }

  return { features, labels, matchInfo };
}

function generateRandomTeamStats(teamName: string, isHome: boolean): TeamStats {
  const baseStrength = Math.random() * 0.5 + 0.5; // 0.5 à 1.0
  
  return {
    teamId: teamName.toLowerCase().replace(/\s/g, ''),
    teamName,
    
    last5Matches: {
      goalsScored: Array(5).fill(0).map(() => Math.floor(Math.random() * 4 * baseStrength)),
      goalsConceded: Array(5).fill(0).map(() => Math.floor(Math.random() * 3 * (1 - baseStrength * 0.5))),
      results: Array(5).fill(0).map(() => {
        const r = Math.random();
        return r < baseStrength * 0.5 ? 'W' : r < baseStrength * 0.8 ? 'D' : 'L';
      }) as ('W' | 'D' | 'L')[],
      xG: Array(5).fill(0).map(() => Math.random() * 3 * baseStrength),
      shots: Array(5).fill(0).map(() => Math.floor(Math.random() * 15 + 5)),
      possession: Array(5).fill(0).map(() => Math.random() * 30 + 35)
    },
    
    avgGoalsScored: 1.2 + baseStrength * 1.2,
    avgGoalsConceded: 1.5 - baseStrength * 0.8,
    avgXG: 1.0 + baseStrength * 1.0,
    avgShots: 10 + baseStrength * 8,
    avgPossession: 45 + baseStrength * 15,
    
    seasonStats: {
      played: Math.floor(Math.random() * 10 + 25),
      won: Math.floor(baseStrength * 20),
      drawn: Math.floor(Math.random() * 8),
      lost: Math.floor((1 - baseStrength) * 15),
      goalsFor: Math.floor(baseStrength * 50 + 20),
      goalsAgainst: Math.floor((1 - baseStrength) * 40 + 15),
      points: Math.floor(baseStrength * 60 + 20),
      position: Math.floor((1 - baseStrength) * 18 + 1)
    },
    
    homeAdvantage: isHome ? 0.15 + Math.random() * 0.1 : 0,
    daysSinceLastMatch: Math.floor(Math.random() * 7 + 2),
    isInjuryCrisis: Math.random() < 0.1,
    motivation: Math.random() < 0.3 ? 'high' : Math.random() < 0.7 ? 'medium' : 'low'
  };
}

// ===== ENTRAÎNEMENT =====

function relu(x: number): number {
  return Math.max(0, x);
}

function reluDerivative(x: number): number {
  return x > 0 ? 1 : 0;
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exp = arr.map(x => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(x => x / sum);
}

function crossEntropyLoss(predicted: number[], actual: number[]): number {
  let loss = 0;
  for (let i = 0; i < predicted.length; i++) {
    loss -= actual[i] * Math.log(predicted[i] + 1e-10);
  }
  return loss;
}

class NeuralNetwork {
  private layers: { weights: number[][]; biases: number[] }[] = [];
  private config: TrainingConfig;

  constructor(config: TrainingConfig, inputSize: number) {
    this.config = config;
    
    // Initialiser les couches
    const sizes = [inputSize, ...config.hiddenLayers, 3]; // 3 outputs
    
    for (let i = 0; i < sizes.length - 1; i++) {
      const inputDim = sizes[i];
      const outputDim = sizes[i + 1];
      
      // Initialisation Xavier/He
      const scale = Math.sqrt(2 / inputDim);
      
      this.layers.push({
        weights: Array(inputDim).fill(0).map(() =>
          Array(outputDim).fill(0).map(() => (Math.random() - 0.5) * 2 * scale)
        ),
        biases: Array(outputDim).fill(0).map(() => (Math.random() - 0.5) * 0.1)
      });
    }
  }

  forward(input: number[]): { activations: number[][]; preActivations: number[][] } {
    const activations: number[][] = [input];
    const preActivations: number[][] = [];
    
    let current = input;
    
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const preActivation: number[] = [];
      const activation: number[] = [];
      
      for (let j = 0; j < layer.biases.length; j++) {
        let sum = layer.biases[j];
        for (let k = 0; k < current.length; k++) {
          sum += current[k] * layer.weights[k][j];
        }
        preActivation.push(sum);
      }
      
      preActivations.push(preActivation);
      
      // Activation
      if (i < this.layers.length - 1) {
        // Couche cachée
        for (const x of preActivation) {
          if (this.config.activation === 'relu') {
            activation.push(relu(x));
          } else {
            activation.push(Math.tanh(x));
          }
        }
      } else {
        // Couche de sortie: softmax
        const probs = softmax(preActivation);
        activation.push(...probs);
      }
      
      activations.push(activation);
      current = activation;
    }
    
    return { activations, preActivations };
  }

  train(trainingData: TrainingData): { loss: number; accuracy: number } {
    const { features, labels } = trainingData;
    const numSamples = features.length;
    
    // Mélanger les données
    const indices = Array.from({ length: numSamples }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    let totalLoss = 0;
    let correct = 0;

    // Entraînement par mini-batches
    for (let batchStart = 0; batchStart < numSamples; batchStart += this.config.batchSize) {
      const batchEnd = Math.min(batchStart + this.config.batchSize, numSamples);
      const batchIndices = indices.slice(batchStart, batchEnd);
      
      // Accumulateurs de gradients
      const weightGradients = this.layers.map(layer => 
        layer.weights.map(row => row.map(() => 0))
      );
      const biasGradients = this.layers.map(layer => 
        layer.biases.map(() => 0)
      );
      
      let batchLoss = 0;
      
      for (const idx of batchIndices) {
        const x = features[idx];
        const y = labels[idx];
        
        // Forward pass
        const { activations, preActivations } = this.forward(x);
        const output = activations[activations.length - 1];
        
        // Loss
        batchLoss += crossEntropyLoss(output, y);
        
        // Accuracy
        const predicted = output.indexOf(Math.max(...output));
        const actual = y.indexOf(1);
        if (predicted === actual) correct++;
        
        // Backward pass (simplifié)
        let delta = output.map((o, i) => o - y[i]);
        
        for (let l = this.layers.length - 1; l >= 0; l--) {
          const layer = this.layers[l];
          const activation = activations[l];
          
          // Calculer les gradients
          for (let j = 0; j < layer.biases.length; j++) {
            biasGradients[l][j] += delta[j];
            for (let k = 0; k < activation.length; k++) {
              weightGradients[l][k][j] += activation[k] * delta[j];
            }
          }
          
          // Propager l'erreur
          if (l > 0) {
            const newDelta: number[] = [];
            for (let k = 0; k < activation.length; k++) {
              let sum = 0;
              for (let j = 0; j < layer.biases.length; j++) {
                sum += delta[j] * layer.weights[k][j];
              }
              // Dérivée de l'activation
              if (this.config.activation === 'relu') {
                sum *= reluDerivative(preActivations[l - 1][k]);
              } else {
                sum *= (1 - Math.tanh(preActivations[l - 1][k]) ** 2);
              }
              newDelta.push(sum);
            }
            delta = newDelta;
          }
        }
      }
      
      // Appliquer les gradients
      const batchSize = batchIndices.length;
      const lr = this.config.learningRate;
      
      for (let l = 0; l < this.layers.length; l++) {
        for (let j = 0; j < this.layers[l].biases.length; j++) {
          this.layers[l].biases[j] -= lr * biasGradients[l][j] / batchSize;
          for (let k = 0; k < this.layers[l].weights.length; k++) {
            this.layers[l].weights[k][j] -= lr * weightGradients[l][k][j] / batchSize;
          }
        }
      }
      
      totalLoss += batchLoss;
    }
    
    return {
      loss: totalLoss / numSamples,
      accuracy: correct / numSamples
    };
  }

  getWeights(): ModelWeights['layers'] {
    return this.layers.map(layer => ({
      weights: layer.weights.map(row => [...row]),
      biases: [...layer.biases]
    }));
  }
}

// ===== MAIN =====

async function main() {
  console.log('🏋️ Démarrage de l\'entraînement du modèle ML...\n');

  const config: TrainingConfig = {
    epochs: 100,
    learningRate: 0.01,
    batchSize: 32,
    validationSplit: 0.2,
    hiddenLayers: [64, 32, 16],
    activation: 'relu'
  };

  // Générer les données d'entraînement
  console.log('📊 Génération des données d\'entraînement...');
  const trainingData = generateSyntheticTrainingData(10000);
  console.log(`   ✓ ${trainingData.features.length} échantillons générés\n`);

  // Calculer les statistiques de features
  const featureMean = Array(FEATURE_NAMES.length).fill(0);
  const featureStd = Array(FEATURE_NAMES.length).fill(0);
  
  for (const sample of trainingData.features) {
    for (let i = 0; i < sample.length; i++) {
      featureMean[i] += sample[i];
    }
  }
  for (let i = 0; i < featureMean.length; i++) {
    featureMean[i] /= trainingData.features.length;
  }
  for (const sample of trainingData.features) {
    for (let i = 0; i < sample.length; i++) {
      featureStd[i] += (sample[i] - featureMean[i]) ** 2;
    }
  }
  for (let i = 0; i < featureStd.length; i++) {
    featureStd[i] = Math.sqrt(featureStd[i] / trainingData.features.length);
  }

  // Normaliser les features avec les stats calculées
  const normalizedFeatures = trainingData.features.map(sample =>
    sample.map((x, i) => (x - featureMean[i]) / (featureStd[i] + 1e-8))
  );

  // Créer le réseau
  const nn = new NeuralNetwork(config, FEATURE_NAMES.length);

  // Entraîner
  console.log('🧠 Entraînement en cours...');
  for (let epoch = 0; epoch < config.epochs; epoch++) {
    const result = nn.train({ ...trainingData, features: normalizedFeatures });
    
    if ((epoch + 1) % 10 === 0 || epoch === 0) {
      console.log(`   Epoch ${epoch + 1}/${config.epochs} - Loss: ${result.loss.toFixed(4)} - Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
    }
  }

  // Exporter le modèle
  const modelWeights: ModelWeights = {
    layers: nn.getWeights(),
    config: {
      inputSize: FEATURE_NAMES.length,
      hiddenLayers: config.hiddenLayers,
      outputSize: 3,
      activation: config.activation,
      outputActivation: 'softmax'
    },
    trainingInfo: {
      epochs: config.epochs,
      loss: 0,
      accuracy: 0,
      trainedAt: new Date().toISOString(),
      samplesUsed: trainingData.features.length
    },
    featureStats: {
      mean: featureMean,
      std: featureStd
    }
  };

  // Test final pour accuracy
  let correct = 0;
  for (let i = 0; i < normalizedFeatures.length; i++) {
    const x = normalizedFeatures[i];
    const y = trainingData.labels[i];
    
    // Forward pass simple
    let activation = x;
    for (const layer of modelWeights.layers) {
      const newActivation: number[] = [];
      for (let j = 0; j < layer.biases.length; j++) {
        let sum = layer.biases[j];
        for (let k = 0; k < activation.length; k++) {
          sum += activation[k] * layer.weights[k][j];
        }
        if (layer === modelWeights.layers[modelWeights.layers.length - 1]) {
          // Dernière couche: on calcule softmax après
          newActivation.push(sum);
        } else {
          newActivation.push(relu(sum));
        }
      }
      if (layer === modelWeights.layers[modelWeights.layers.length - 1]) {
        activation = softmax(newActivation);
      } else {
        activation = newActivation;
      }
    }
    
    const predicted = activation.indexOf(Math.max(...activation));
    const actual = y.indexOf(1);
    if (predicted === actual) correct++;
  }

  modelWeights.trainingInfo.accuracy = correct / normalizedFeatures.length;

  // Sauvegarder
  const outputPath = path.join(__dirname, '..', 'data', 'ml', 'model.json');
  fs.writeFileSync(outputPath, JSON.stringify(modelWeights, null, 2));
  
  console.log(`\n✅ Modèle sauvegardé: ${outputPath}`);
  console.log(`   📈 Accuracy finale: ${(modelWeights.trainingInfo.accuracy * 100).toFixed(1)}%`);
  console.log(`   📊 Échantillons: ${modelWeights.trainingInfo.samplesUsed}`);
  console.log(`   🕒 Entraîné le: ${modelWeights.trainingInfo.trainedAt}`);
}

main().catch(console.error);
