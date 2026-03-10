/**
 * Module d'initialisation pour z-ai-web-dev-sdk
 * Gère la configuration pour le développement local et Vercel
 *
 * IMPORTANT: Sur Vercel, le SDK nécessite les variables d'environnement:
 * - ZAI_BASE_URL
 * - ZAI_API_KEY
 * - ZAI_CHAT_ID
 * - ZAI_TOKEN
 * - ZAI_USER_ID
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
const ENV_CONFIG = {
  baseUrl: process.env.ZAI_BASE_URL,
  apiKey: process.env.ZAI_API_KEY,
  chatId: process.env.ZAI_CHAT_ID,
  token: process.env.ZAI_TOKEN,
  userId: process.env.ZAI_USER_ID,
};

// Détecter si on est sur Vercel
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

/**
 * Charge la configuration depuis le fichier .z-ai-config
 */
function loadConfigFile(): ZAIConfig | null {
  // Chemins possibles pour le fichier de config
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
        console.log(`✅ Config z-ai chargée depuis: ${configPath}`);
        return config;
      }
    } catch (error) {
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
    // Essayer d'abord les variables d'environnement (Vercel)
    if (ENV_CONFIG.baseUrl && ENV_CONFIG.apiKey && ENV_CONFIG.token) {
      console.log('🔧 Initialisation z-ai depuis variables d\'environnement...');
      
      // Le SDK z-ai-web-dev-sdk utilise un fichier de config
      // On doit créer un fichier temporaire pour Vercel
      const tmpConfigPath = path.join(os.tmpdir(), '.z-ai-config');
      fs.writeFileSync(tmpConfigPath, JSON.stringify({
        baseUrl: ENV_CONFIG.baseUrl,
        apiKey: ENV_CONFIG.apiKey,
        chatId: ENV_CONFIG.chatId || '',
        token: ENV_CONFIG.token,
        userId: ENV_CONFIG.userId || '',
      }, null, 2));

      zaiInstance = await ZAI.create();
      console.log('✅ SDK z-ai initialisé (env vars)');
      isInitialized = true;
      return;
    }

    // Essayer le fichier de config (développement local)
    const fileConfig = loadConfigFile();
    if (fileConfig) {
      console.log('🔧 Initialisation z-ai depuis fichier config...');
      zaiInstance = await ZAI.create();
      console.log('✅ SDK z-ai initialisé (fichier config)');
      isInitialized = true;
      return;
    }

    // Aucune configuration trouvée
    initError = 'Configuration z-ai non trouvée. Configurez les variables d\'environnement ou le fichier .z-ai-config';
    console.warn(`⚠️ ${initError}`);
    isInitialized = true;

  } catch (error) {
    initError = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('❌ Erreur initialisation z-ai:', initError);
    isInitialized = true;
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
 */
export function isZaiAvailable(): boolean {
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

    return {
      success: true,
      results,
    };
  } catch (error) {
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : 'Erreur recherche web',
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
    
    return {
      success: true,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : 'Erreur lecture page',
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
