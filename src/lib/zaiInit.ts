/**
 * Module d'initialisation pour z-ai-web-dev-sdk
 * 
 * Le SDK cherche le fichier .z-ai-config UNIQUEMENT dans:
 * 1. process.cwd()/.z-ai-config
 * 2. homedir()/.z-ai-config
 * 3. /etc/.z-ai-config
 * 
 * Sur Vercel, on écrit dans process.cwd() qui peut être writable pendant l'exécution.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuration depuis les variables d'environnement
interface ZAIConfig {
  baseUrl: string;
  apiKey: string;
  chatId: string;
  token: string;
  userId: string;
}

const CONFIG: ZAIConfig = {
  baseUrl: process.env.ZAI_BASE_URL || 'http://172.25.136.193:8080/v1',
  apiKey: process.env.ZAI_API_KEY || 'Z.ai',
  chatId: process.env.ZAI_CHAT_ID || 'chat-67ccc72c-b06c-4cdc-b880-f7e9f177527b',
  token: process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNzczN2ZhODEtMGE4Zi00MmYzLThkNzUtNGNjYWQ4MjZhMDVkIiwiY2hhdF9pZCI6ImNoYXQtNjdjY2M3MmMtYjA2Yy00Y2RjLWI4ODAtZjdlOWYxNzc1MjdiIn0.4r8e_eVfwA4rB87EcxpCkh4JvOEbaUT5wrjoZqnqjs4',
  userId: process.env.ZAI_USER_ID || '7737fa81-0a8f-42f3-8d75-4ccad826a05d',
};

// Instance unique
let zaiInstance: any = null;
let isInitialized = false;
let initError: string | null = null;

/**
 * Les 3 emplacements exacts où le SDK cherche le fichier (dans l'ordre)
 */
const SDK_CONFIG_PATHS = [
  path.join(process.cwd(), '.z-ai-config'),
  path.join(os.homedir(), '.z-ai-config'),
  '/etc/.z-ai-config',
];

/**
 * Vérifie si le fichier de config existe déjà
 */
function configExists(): string | null {
  for (const p of SDK_CONFIG_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        const config = JSON.parse(content);
        if (config.baseUrl && config.apiKey) {
          console.log(`📦 z-ai: Config existant: ${p}`);
          return p;
        }
      } catch {
        // Fichier invalide, continuer
      }
    }
  }
  return null;
}

/**
 * Écrit le fichier de config aux emplacements du SDK
 */
function writeConfig(): string | null {
  const content = JSON.stringify(CONFIG, null, 2);
  
  for (const p of SDK_CONFIG_PATHS) {
    try {
      fs.writeFileSync(p, content, 'utf8');
      
      // Vérifier qu'on peut le relire
      const readBack = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(readBack);
      if (parsed.baseUrl && parsed.apiKey) {
        console.log(`✅ z-ai: Config écrit et vérifié: ${p}`);
        return p;
      }
    } catch (err: any) {
      console.log(`⚠️ z-ai: Impossible d'écrire ${p}: ${err.code || err.message}`);
    }
  }
  
  return null;
}

/**
 * Initialise le SDK
 */
async function initZAI(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  console.log('🔧 Initialisation z-ai SDK...');

  try {
    // 1. Vérifier si un fichier existe déjà
    let configPath = configExists();
    
    // 2. Sinon, essayer d'écrire
    if (!configPath) {
      configPath = writeConfig();
    }
    
    if (!configPath) {
      throw new Error('Impossible de créer le fichier de config (filesystem read-only)');
    }
    
    // 3. Importer et créer le SDK
    const ZAI = await import('z-ai-web-dev-sdk');
    zaiInstance = await ZAI.default.create();
    
    console.log('✅ SDK z-ai initialisé avec succès');
    initError = null;
    
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('❌ Erreur initialisation z-ai:', initError);
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
  results: Array<{ url: string; title: string; snippet: string }>;
  error?: string;
}> {
  const zai = await getZAI();

  if (!zai) {
    return { success: false, results: [], error: initError || 'SDK non configuré' };
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
    return { success: false, content: '', error: initError || 'SDK non configuré' };
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

const ZaiInit = { getZAI, isZaiAvailable, getZaiError, zaiWebSearch, zaiPageReader };
export default ZaiInit;
