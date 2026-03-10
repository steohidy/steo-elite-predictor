/**
 * Module d'initialisation pour z-ai-web-dev-sdk
 * 
 * IMPORTANT: Ce module écrit le fichier de config SYNCHRONEment
 * au chargement du module, AVANT que le SDK ne soit importé.
 * 
 * Sur Vercel, process.cwd() peut être read-only, mais /tmp est writable.
 * On écrit donc dans les deux emplacements.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuration
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

// ÉCRIRE LE FICHIER SYNCHRONEMENT AU CHARGEMENT DU MODULE
// C'est la clé - le faire AVANT d'importer le SDK
const configContent = JSON.stringify(CONFIG, null, 2);
const configLocations = [
  path.join(process.cwd(), '.z-ai-config'),
  path.join(os.homedir(), '.z-ai-config'),
  '/tmp/.z-ai-config',
];

for (const location of configLocations) {
  try {
    fs.writeFileSync(location, configContent, 'utf8');
    console.log(`✅ z-ai: Config écrit: ${location}`);
  } catch (err: any) {
    // Certaines locations peuvent être read-only, c'est normal
    console.log(`⚠️ z-ai: Impossible d'écrire ${location}: ${err.code || err.message}`);
  }
}

// MAINTENANT on peut importer le SDK
import ZAI from 'z-ai-web-dev-sdk';

// Instance unique
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
let isInitialized = false;
let initError: string | null = null;

/**
 * Initialise le SDK
 */
async function initZAI(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  console.log('🔧 Initialisation z-ai SDK...');

  try {
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
 * Récupère l'instance du SDK
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

export default { getZAI, isZaiAvailable, getZaiError, zaiWebSearch, zaiPageReader };
