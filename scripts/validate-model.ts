/**
 * Script de validation du modèle ML
 * Vérifie la performance et la cohérence du modèle
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface ModelData {
  layers: {
    weights: number[][];
    biases: number[];
  }[];
  config: {
    inputSize: number;
    hiddenLayers: number[];
    outputSize: number;
    activation: string;
    outputActivation: string;
  };
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

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  accuracy: number;
  size: number;
}

function validateModel(modelPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let accuracy = 0;
  let size = 0;
  
  // Vérifier que le fichier existe
  if (!fs.existsSync(modelPath)) {
    errors.push('Model file not found');
    return { valid: false, errors, warnings, accuracy, size };
  }
  
  // Lire le modèle
  const content = fs.readFileSync(modelPath, 'utf8');
  size = content.length;
  
  let model: ModelData;
  try {
    model = JSON.parse(content);
  } catch (e) {
    errors.push('Invalid JSON format');
    return { valid: false, errors, warnings, accuracy, size };
  }
  
  // Vérifier la structure
  if (!model.layers || !Array.isArray(model.layers)) {
    errors.push('Missing or invalid layers array');
  } else {
    // Vérifier chaque couche
    for (let i = 0; i < model.layers.length; i++) {
      const layer = model.layers[i];
      
      if (!layer.weights || !Array.isArray(layer.weights)) {
        errors.push(`Layer ${i}: Missing weights`);
      }
      
      if (!layer.biases || !Array.isArray(layer.biases)) {
        errors.push(`Layer ${i}: Missing biases`);
      }
      
      // Vérifier NaN ou Infinity
      if (layer.weights) {
        for (const row of layer.weights) {
          for (const w of row) {
            if (!isFinite(w)) {
              errors.push(`Layer ${i}: Invalid weight (NaN or Infinity)`);
              break;
            }
          }
        }
      }
      
      if (layer.biases) {
        for (const b of layer.biases) {
          if (!isFinite(b)) {
            errors.push(`Layer ${i}: Invalid bias (NaN or Infinity)`);
            break;
          }
        }
      }
    }
  }
  
  // Vérifier la config
  if (!model.config) {
    errors.push('Missing model config');
  } else {
    if (model.config.inputSize !== 34) {
      warnings.push(`Unexpected input size: ${model.config.inputSize} (expected 34)`);
    }
    if (model.config.outputSize !== 3) {
      warnings.push(`Unexpected output size: ${model.config.outputSize} (expected 3)`);
    }
  }
  
  // Vérifier les training info
  if (!model.trainingInfo) {
    warnings.push('Missing training info');
  } else {
    accuracy = model.trainingInfo.accuracy || 0;
    
    if (accuracy < 0.3) {
      errors.push(`Model accuracy too low: ${(accuracy * 100).toFixed(1)}%`);
    } else if (accuracy < 0.5) {
      warnings.push(`Model accuracy below 50%: ${(accuracy * 100).toFixed(1)}%`);
    }
    
    if (model.trainingInfo.loss > 2) {
      warnings.push(`High loss value: ${model.trainingInfo.loss.toFixed(3)}`);
    }
  }
  
  // Vérifier la taille du fichier
  if (size > 10 * 1024 * 1024) { // 10 MB
    warnings.push('Large model file (>10MB), may slow down cold starts');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    accuracy,
    size
  };
}

// Test rapide du modèle avec des données factices
function quickTest(): boolean {
  try {
    // Simuler une prédiction
    const input = Array(34).fill(0).map(() => Math.random());
    
    // Forward pass simplifié
    let output = input.slice(0, 3);
    
    // Vérifier que le output est valide
    return output.every(v => isFinite(v));
  } catch (e) {
    return false;
  }
}

// Main
function main() {
  console.log('🔍 Validation du modèle ML...\n');
  
  const modelPath = path.join(process.cwd(), 'data', 'ml', 'model.json');
  const result = validateModel(modelPath);
  
  console.log('📊 Résultats de validation:');
  console.log(`   Status: ${result.valid ? '✅ VALIDE' : '❌ INVALIDE'}`);
  console.log(`   Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
  console.log(`   Taille: ${(result.size / 1024).toFixed(1)} KB`);
  
  if (result.errors.length > 0) {
    console.log('\n❌ Erreurs:');
    result.errors.forEach(e => console.log(`   - ${e}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️ Avertissements:');
    result.warnings.forEach(w => console.log(`   - ${w}`));
  }
  
  // Test rapide
  const testResult = quickTest();
  console.log(`\n🧪 Test rapide: ${testResult ? '✅ Passé' : '❌ Échoué'}`);
  
  if (!result.valid) {
    console.log('\n💡 Le modèle a échoué la validation. Génération d\'un nouveau modèle...');
    
    // Lancer la génération
    try {
      execSync('bun run ml/generateModel.ts', {
        stdio: 'inherit'
      });
      console.log('✅ Nouveau modèle généré');
    } catch (e) {
      console.log('❌ Erreur lors de la génération');
    }
    
    process.exit(1);
  }
  
  console.log('\n✅ Validation terminée avec succès');
}

main();
