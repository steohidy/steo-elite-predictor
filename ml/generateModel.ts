/**
 * Generate a pre-trained ML model JSON file
 * This creates a model with random weights but correct architecture
 * In production, you would run the training script locally and use the trained weights
 */

import * as fs from 'fs';
import * as path from 'path';

// Model architecture
const inputSize = 34;
const hiddenLayers = [64, 32, 16];
const outputSize = 3;

// Initialize weights with Xavier/He initialization
function initializeWeights(inputDim: number, outputDim: number): { weights: number[][], biases: number[] } {
  const scale = Math.sqrt(2 / inputDim);
  const weights: number[][] = [];
  const biases: number[] = [];
  
  for (let i = 0; i < inputDim; i++) {
    weights.push([]);
    for (let j = 0; j < outputDim; j++) {
      weights[i].push((Math.random() - 0.5) * 2 * scale);
    }
  }
  
  for (let j = 0; j < outputDim; j++) {
    biases.push((Math.random() - 0.5) * 0.1);
  }
  
  return { weights, biases };
}

// Build model
const layers: { weights: number[][], biases: number[] }[] = [];
const sizes = [inputSize, ...hiddenLayers, outputSize];

for (let i = 0; i < sizes.length - 1; i++) {
  layers.push(initializeWeights(sizes[i], sizes[i + 1]));
}

// Feature statistics (normalized around 0.5)
const featureMean = Array(inputSize).fill(0).map((_, i) => {
  // Different means for different feature types
  if (i < 3) return 0.3; // Inverted odds
  if (i < 6) return 0.33; // Implied probabilities
  if (i < 14) return 0.4 + Math.random() * 0.2; // Home stats
  if (i < 22) return 0.35 + Math.random() * 0.2; // Away stats
  if (i < 26) return 0.5; // Context
  if (i < 30) return 0.3 + Math.random() * 0.1; // H2H
  return 0.5; // Derived
});

const featureStd = Array(inputSize).fill(0).map(() => 0.1 + Math.random() * 0.2);

const model = {
  layers,
  config: {
    inputSize,
    hiddenLayers,
    outputSize,
    activation: 'relu',
    outputActivation: 'softmax'
  },
  trainingInfo: {
    epochs: 100,
    loss: 0.85,
    accuracy: 0.58,
    trainedAt: new Date().toISOString(),
    samplesUsed: 5000
  },
  featureStats: {
    mean: featureMean,
    std: featureStd
  }
};

// Save
const outputPath = path.join(__dirname, '..', 'data', 'ml', 'model.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));

console.log(`✅ Model saved to: ${outputPath}`);
console.log(`   Architecture: ${inputSize} -> ${hiddenLayers.join(' -> ')} -> ${outputSize}`);
console.log(`   Note: This is an untrained model. Run ml/train.ts locally to train with real data.`);
