/**
 * Module d'initialisation pour z-ai-web-dev-sdk
 * 
 * Supporte deux modes de configuration:
 * 1. Fichier .z-ai-config (développement local)
 * 2. Variables d'environnement (production Vercel):
 *    - ZAI_BASE_URL
 *    - ZAI_API_KEY
 *    - ZAI_CHAT_ID
 *    - ZAI_TOKEN
 *    - ZAI_USER_ID
 */

import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Instance unique du SDK
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
let isInitialized = false;
let initError: string | null = null;

interface ZAIConfig {
  baseUrl: string;
  apiKey: string;
  chatId: string;
  token: string;
  userId: string;
}

/**
 * Vérifie si les variables d'environnement ZAI sont configurées
 */
function hasEnvConfig(): boolean {
  return !!(
    process.env.ZAI_BASE_URL &&
    process.env.ZAI_API_KEY &&
    process.env.ZAI_CHAT_ID &&
    process.env.ZAI_TOKEN &&
    process.env.ZAI_USER_ID
  );
}

/**
 * Crée la configuration à partir des variables d'environnement
 */
function getConfigFromEnv(): ZAIConfig {
  return {
    baseUrl: process.env.ZAI_BASE_URL!,
    apiKey: process.env.ZAI_API_KEY!,
    chatId: process.env.ZAI_CHAT_ID!,
    token: process.env.ZAI_TOKEN!,
    userId: process.env.ZAI_USER_ID!,
  };
}

/**
 * Crée un fichier de config temporaire pour le SDK
 */
function createTempConfigFile(config: ZAIConfig): string {
  const configPath = path.join(tmpdir(), '.z-ai-config');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

/**
 * Initialise le SDK z-ai
 */
async function initZAI(): Promise<void> {
  if (isInitialized) return;

  try {
    console.log('🔧 Initialisation z-ai SDK...');

    // En production (Vercel), utiliser les variables d'environnement
    if (hasEnvConfig()) {
      console.log('📡 Configuration depuis variables d\'environnement');
      const config = getConfigFromEnv();
      const configPath = createTempConfigFile(config);
      
      // Le SDK cherche le fichier dans process.cwd(), homedir, ou /etc
      // On crée aussi dans process.cwd() pour être sûr
      const cwdConfigPath = path.join(process.cwd(), '.z-ai-config');
      fs.writeFileSync(cwdConfigPath, JSON.stringify(config, null, 2));
      
      console.log('✅ Fichier de config créé:', cwdConfigPath);
    }

    zaiInstance = await ZAI.create();
    console.log('✅ SDK z-ai initialisé avec succès');
    isInitialized = true;
    initError = null;
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('❌ Erreur initialisation z-ai:', initError);
    zaiInstance = null;
    isInitialized = true;
  }
}

/**
 * Récupère l'instance du SDK z-ai
 */
export async function getZAI(): Promise<Awaited<ReturnType<typeof ZAI.create>> | null> {
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
 * Récupère l'erreur d'initialisation
 */
export function getZaiError(): string | null {
  return initError;
}

/**
 * Recherche web via z-ai
 */
export async function zaiWebSearch(query: string, numResults: number = 5): Promise<{
  success: boolean;
  results: Array<{
    url: string;
    title: string;
    snippet: string;
  }>;
  error?: string;
}> {
  const zai = await getZAI();

  if (!zai) {
    return {
      success: false,
      results: [],
      error: initError || 'SDK z-ai non configuré',
    };
  }

  try {
    const searchResult = await zai.functions.invoke('web_search', {
      query,
      num: numResults,
    });

    // Le SDK retourne un tableau de résultats
    const rawResults = Array.isArray(searchResult) ? searchResult : [];

    const results = rawResults.map((item: any) => ({
      url: item.url || '',
      title: item.name || '',
      snippet: item.snippet || '',
    }));

    console.log(`🔍 Web search "${query}": ${results.length} résultats`);

    return {
      success: true,
      results,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur recherche web';
    console.error('❌ Erreur web search:', errorMsg);
    return {
      success: false,
      results: [],
      error: errorMsg,
    };
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
      error: initError || 'SDK z-ai non configuré',
    };
  }

  try {
    const result = await zai.functions.invoke('page_reader', { url });

    const content = typeof result === 'string'
      ? result
      : JSON.stringify(result);

    console.log(`📄 Page reader: ${url} (${content.length} chars)`);

    return {
      success: true,
      content,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur lecture page';
    console.error('❌ Erreur page reader:', errorMsg);
    return {
      success: false,
      content: '',
      error: errorMsg,
    };
  }
}

// Export par défaut
const ZaiInit = {
  getZAI,
  isZaiAvailable,
  getZaiError,
  zaiWebSearch,
  zaiPageReader,
};

export default ZaiInit;
