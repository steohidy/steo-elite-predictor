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
 * 
 * IMPORTANT: Le fichier de config DOIT exister AVANT d'appeler ZAI.create()
 */

import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';
import { tmpdir, homedir } from 'os';

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

// Configuration par défaut (fallback si pas de variables d'environnement)
const DEFAULT_CONFIG: ZAIConfig = {
  baseUrl: 'http://172.25.136.193:8080/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-67ccc72c-b06c-4cdc-b880-f7e9f177527b',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNzczN2ZhODEtMGE4Zi00MmYzLThkNzUtNGNjYWQ4MjZhMDVkIiwiY2hhdF9pZCI6ImNoYXQtNjdjY2M3MmMtYjA2Yy00Y2RjLWI4ODAtZjdlOWYxNzc1MjdiIn0.4r8e_eVfwA4rB87EcxpCkh4JvOEbaUT5wrjoZqnqjs4',
  userId: '7737fa81-0a8f-42f3-8d75-4ccad826a05d',
};

/**
 * Récupère la configuration depuis les variables d'environnement ou défaut
 */
function getConfig(): ZAIConfig {
  // Priorité 1: Variables d'environnement
  if (
    process.env.ZAI_BASE_URL &&
    process.env.ZAI_API_KEY &&
    process.env.ZAI_CHAT_ID &&
    process.env.ZAI_TOKEN &&
    process.env.ZAI_USER_ID
  ) {
    console.log('📡 z-ai: Configuration depuis variables d\'environnement');
    return {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      chatId: process.env.ZAI_CHAT_ID,
      token: process.env.ZAI_TOKEN,
      userId: process.env.ZAI_USER_ID,
    };
  }
  
  // Priorité 2: Configuration par défaut
  console.log('📡 z-ai: Configuration par défaut');
  return DEFAULT_CONFIG;
}

/**
 * Crée le fichier de config dans TOUS les emplacements possibles
 * Le SDK cherche dans: process.cwd(), homedir, /etc
 */
function createConfigFiles(config: ZAIConfig): void {
  const configContent = JSON.stringify(config, null, 2);
  
  const locations = [
    path.join(process.cwd(), '.z-ai-config'),    // process.cwd()
    path.join(homedir(), '.z-ai-config'),        // home directory
    path.join(tmpdir(), '.z-ai-config'),         // tmp directory
    '/tmp/.z-ai-config',                         // /tmp (Vercel)
  ];
  
  for (const location of locations) {
    try {
      fs.writeFileSync(location, configContent);
      console.log(`✅ z-ai: Config créé: ${location}`);
    } catch (err: any) {
      console.log(`⚠️ z-ai: Impossible de créer ${location}: ${err.message}`);
    }
  }
}

/**
 * Vérifie si un fichier de config existe déjà
 */
function configExists(): boolean {
  const locations = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ];
  
  for (const location of locations) {
    if (fs.existsSync(location)) {
      console.log(`📦 z-ai: Config existant trouvé: ${location}`);
      return true;
    }
  }
  return false;
}

/**
 * Initialise le SDK z-ai
 * CRÉE le fichier de config AVANT d'appeler ZAI.create()
 * 
 * NOTE: En production Vercel, le SDK est désactivé car le filesystem
 * est éphémère et le SDK ne peut pas créer/lire le fichier de config.
 */
async function initZAI(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true; // Marquer immédiatement pour éviter les appels multiples

  // En production Vercel, désactiver le SDK
  if (process.env.VERCEL || process.env.VERCEL_URL) {
    console.log('⚠️ z-ai: Production Vercel détectée - SDK désactivé (filesystem éphémère)');
    initError = 'SDK désactivé en production Vercel - utilisez les données de fallback';
    zaiInstance = null;
    return;
  }

  console.log('🔧 Initialisation z-ai SDK (local)...');
  
  try {
    // 1. Vérifier si un fichier de config existe déjà
    const existingConfig = configExists();
    
    // 2. Si pas de config existante, créer les fichiers
    if (!existingConfig) {
      const config = getConfig();
      createConfigFiles(config);
    }
    
    // 3. Maintenant on peut appeler ZAI.create()
    zaiInstance = await ZAI.create();
    console.log('✅ SDK z-ai initialisé avec succès');
    initError = null;
    
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('❌ Erreur initialisation z-ai:', initError);
    zaiInstance = null;
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
