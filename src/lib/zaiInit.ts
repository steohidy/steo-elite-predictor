/**
 * Module d'initialisation pour z-ai-web-dev-sdk
 *
 * Le SDK TypeScript déclare le constructeur comme "private", mais JavaScript l'autorise.
 * On utilise un cast pour contourner cette restriction sur Vercel.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuration depuis les variables d'environnement
interface ZAIConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
}

// Construit la config depuis les env vars
function buildConfig(): ZAIConfig {
  return {
    baseUrl: process.env.ZAI_BASE_URL || 'http://172.25.136.193:8080/v1',
    apiKey: process.env.ZAI_API_KEY || 'Z.ai',
    chatId: process.env.ZAI_CHAT_ID || 'chat-67ccc72c-b06c-4cdc-b880-f7e9f177527b',
    userId: process.env.ZAI_USER_ID || '7737fa81-0a8f-42f3-8d75-4ccad826a05d',
  };
}

// Instance unique
let zaiInstance: any = null;
let isInitialized = false;
let initError: string | null = null;

// Chemins standards du SDK pour le fichier de config
const SDK_CONFIG_PATHS = [
  path.join(process.cwd(), '.z-ai-config'),
  path.join(os.homedir(), '.z-ai-config'),
  '/etc/.z-ai-config',
];

/**
 * Détecte si on est sur Vercel
 */
function isVercel(): boolean {
  return !!(process.env.VERCEL || process.env.NOW_REGION || process.env.VERCEL_ENV);
}

/**
 * Vérifie si le fichier de config existe et est valide
 */
function configExists(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    return !!(config.baseUrl && config.apiKey);
  } catch {
    return false;
  }
}

/**
 * Écrit le fichier de config de manière synchrone
 */
function writeConfigSync(filePath: string, config: ZAIConfig): boolean {
  try {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    return configExists(filePath);
  } catch (err: any) {
    console.log(`⚠️ z-ai: Impossible d'écrire ${filePath}: ${err.code || err.message}`);
    return false;
  }
}

/**
 * Initialise le SDK avec gestion Vercel
 * Sur Vercel, le constructeur est appelé directement car le fichier n'est pas accessible
 */
async function initZAI(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  console.log('🔧 Initialisation z-ai SDK...');
  console.log(`📍 Environnement: ${isVercel() ? 'Vercel (serverless)' : 'Local/Dev'}`);

  const config = buildConfig();

  try {
    // Importer le SDK
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAIClass = ZAIModule.default;

    // Stratégie 1: Essayer create() - ça marche si un fichier de config existe
    let configFound = false;
    for (const p of SDK_CONFIG_PATHS) {
      if (configExists(p)) {
        console.log(`📦 Config existant: ${p}`);
        configFound = true;
        break;
      }
    }

    // Stratégie 2: Si pas de config et pas Vercel, essayer d'écrire
    if (!configFound && !isVercel()) {
      for (const p of SDK_CONFIG_PATHS) {
        if (writeConfigSync(p, config)) {
          console.log(`✅ Config écrit: ${p}`);
          configFound = true;
          break;
        }
      }
    }

    // Stratégie 3: Sur Vercel ou si create() échoue, utiliser le constructeur directement
    try {
      // Essayer d'abord create() si config existe
      if (configFound) {
        zaiInstance = await ZAIClass.create();
        console.log('✅ SDK z-ai initialisé via create()');
      } else {
        throw new Error('Pas de fichier de config disponible');
      }
    } catch {
      // Fallback: utiliser le constructeur directement (contourne le "private" TypeScript)
      console.log('📌 Utilisation du constructeur direct (bypass TypeScript private)');
      
      // @ts-ignore - Le constructeur est "private" en TypeScript mais fonctionne en JS
      const ZAIAsAny = ZAIClass as any;
      zaiInstance = new ZAIAsAny(config);
      console.log('✅ SDK z-ai initialisé via constructeur direct');
    }

    initError = null;

  } catch (error) {
    initError = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('❌ Erreur initialisation z-ai:', initError);
    console.log('📌 SDK z-ai désactivé. Les fallbacks seront utilisés.');
    zaiInstance = null;
  }
}

/**
 * Récupère l'instance du SDK
 */
export async function getZAI(): Promise<any> {
  if (!isInitialized) {
    await initZAI();
  }
  return zaiInstance;
}

/**
 * Vérifie si le SDK est disponible
 */
export async function isZaiAvailable(): Promise<boolean> {
  if (!isInitialized) {
    await initZAI();
  }
  return zaiInstance !== null;
}

/**
 * Récupère l'erreur d'initialisation (pour debug)
 */
export function getZaiError(): string | null {
  return initError;
}

/**
 * Recherche web via z-ai
 */
export async function zaiWebSearch(query: string, numResults: number = 5): Promise<{
  success: boolean;
  results: Array<{ url: string; title: string; snippet: string }>;
  error?: string;
}> {
  const zai = await getZAI();

  if (!zai) {
    return {
      success: false,
      results: [],
      error: initError || 'SDK z-ai non configuré'
    };
  }

  try {
    const searchResult = await zai.functions.invoke('web_search', { query, num: numResults });
    const rawResults = Array.isArray(searchResult) ? searchResult : [];

    return {
      success: true,
      results: rawResults.map((item: any) => ({
        url: item.url || '',
        title: item.name || '',
        snippet: item.snippet || '',
      })),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur recherche';
    console.error('❌ Erreur web search:', errorMsg);
    return { success: false, results: [], error: errorMsg };
  }
}

/**
 * Lit le contenu d'une page web via z-ai
 */
export async function zaiPageReader(url: string): Promise<{
  success: boolean;
  content: string;
  error?: string;
}> {
  const zai = await getZAI();

  if (!zai) {
    return {
      success: false,
      content: '',
      error: initError || 'SDK z-ai non configuré'
    };
  }

  try {
    const result = await zai.functions.invoke('page_reader', { url });
    const content = typeof result === 'string' ? result : JSON.stringify(result);
    return { success: true, content };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur lecture';
    console.error('❌ Erreur page reader:', errorMsg);
    return { success: false, content: '', error: errorMsg };
  }
}

const ZaiInit = {
  getZAI,
  isZaiAvailable,
  getZaiError,
  zaiWebSearch,
  zaiPageReader,
};

export default ZaiInit;
