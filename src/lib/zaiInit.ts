/**
 * Module d'initialisation pour z-ai-web-dev-sdk
 * Gère la configuration pour le développement local et Vercel
 *
 * IMPORTANT: Le SDK nécessite un fichier .z-ai-config avec:
 * {
 *   "baseUrl": "...",
 *   "apiKey": "...",
 *   "chatId": "...",
 *   "token": "...",
 *   "userId": "..."
 * }
 *
 * Sur Vercel, configurez les variables d'environnement:
 * ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_TOKEN, ZAI_USER_ID
 */

import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ZAIConfig {
  baseUrl: string;
  apiKey: string;
  chatId: string;
  token: string;
  userId: string;
}

// Instance unique du SDK
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
let isInitialized = false;
let initError: string | null = null;

// Configuration depuis les variables d'environnement (pour Vercel)
const ENV_CONFIG: ZAIConfig = {
  baseUrl: process.env.ZAI_BASE_URL || '',
  apiKey: process.env.ZAI_API_KEY || '',
  chatId: process.env.ZAI_CHAT_ID || '',
  token: process.env.ZAI_TOKEN || '',
  userId: process.env.ZAI_USER_ID || '',
};

// Détecter si on est sur Vercel
const IS_VERCEL = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;

/**
 * Vérifie si la configuration env est valide
 */
function hasValidEnvConfig(): boolean {
  return !!(ENV_CONFIG.baseUrl && ENV_CONFIG.apiKey && ENV_CONFIG.token);
}

/**
 * Crée le fichier de config pour le SDK
 * Le SDK cherche dans cet ordre: cwd, home, /etc
 */
function createConfigFile(config: ZAIConfig): string | null {
  // Créer dans le cwd (current working directory)
  // C'est le premier endroit où le SDK cherche
  const cwdConfigPath = path.join(process.cwd(), '.z-ai-config');
  
  try {
    fs.writeFileSync(cwdConfigPath, JSON.stringify(config, null, 2));
    console.log(`✅ Fichier config z-ai créé: ${cwdConfigPath}`);
    return cwdConfigPath;
  } catch (error) {
    console.error('❌ Erreur création fichier config:', error);
    return null;
  }
}

/**
 * Charge la configuration depuis le fichier .z-ai-config existant
 */
function loadExistingConfig(): ZAIConfig | null {
  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        console.log(`✅ Config z-ai trouvée: ${configPath}`);
        return config;
      }
    } catch {
      // Continuer au prochain chemin
    }
  }

  return null;
}

/**
 * Initialise le SDK z-ai
 */
async function initZAI(): Promise<void> {
  if (isInitialized) return;

  try {
    // 1. Vérifier si un fichier de config existe déjà
    const existingConfig = loadExistingConfig();
    if (existingConfig) {
      console.log('🔧 Initialisation z-ai depuis fichier existant...');
      zaiInstance = await ZAI.create();
      console.log('✅ SDK z-ai initialisé');
      isInitialized = true;
      return;
    }

    // 2. Si variables d'environnement présentes, créer le fichier
    if (hasValidEnvConfig()) {
      console.log('🔧 Création config z-ai depuis variables d\'environnement...');
      
      const configPath = createConfigFile(ENV_CONFIG);
      if (configPath) {
        zaiInstance = await ZAI.create();
        console.log('✅ SDK z-ai initialisé (depuis env vars)');
        isInitialized = true;
        return;
      }
    }

    // 3. Pas de configuration disponible
    initError = 'Configuration z-ai non trouvée. Variables d\'environnement requises: ZAI_BASE_URL, ZAI_API_KEY, ZAI_TOKEN';
    console.warn(`⚠️ ${initError}`);
    isInitialized = true;

  } catch (error) {
    initError = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('❌ Erreur initialisation z-ai:', initError);
    isInitialized = true;
    zaiInstance = null;
  }
}

/**
 * Récupère l'instance du SDK z-ai
 * Retourne null si le SDK n'est pas configuré
 */
export async function getZAI(): Promise<Awaited<ReturnType<typeof ZAI.create>> | null> {
  if (!isInitialized) {
    await initZAI();
  }
  return zaiInstance;
}

/**
 * Vérifie si le SDK est disponible
 * Déclenche l'initialisation si nécessaire
 */
export async function isZaiAvailable(): Promise<boolean> {
  if (!isInitialized) {
    await initZAI();
  }
  return zaiInstance !== null;
}

/**
 * Récupère l'erreur d'initialisation si présente
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

    const results = (searchResult as any[] || []).map((item: any) => ({
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
