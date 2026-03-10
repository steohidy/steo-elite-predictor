/**
 * Module d'initialisation pour z-ai-web-dev-sdk
 * 
 * Le SDK cherche automatiquement .z-ai-config dans:
 * - process.cwd()/.z-ai-config
 * - os.homedir()/.z-ai-config
 * - /etc/.z-ai-config
 */

import ZAI from 'z-ai-web-dev-sdk';

// Instance unique du SDK
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
let isInitialized = false;
let initError: string | null = null;

/**
 * Initialise le SDK z-ai
 */
async function initZAI(): Promise<void> {
  if (isInitialized) return;

  try {
    console.log('🔧 Initialisation z-ai SDK...');
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
