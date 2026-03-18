/**
 * API STATUS MODULE - Vérification de l'état des APIs
 * 
 * Vérifie toutes les connexions API:
 * - Supabase (base de données)
 * - TheOddsAPI (cotes bookmakers)
 * - Football-data.org (données football)
 * - ESPN (données NBA)
 * - TheSportsDB (stats équipes)
 */

import { supabase, testSupabaseConnection, getSupabaseAdmin } from './supabase';
import { getOddsAPIStatus } from './realOddsService';

// ===== TYPES =====

export interface APIStatus {
  name: string;
  status: 'online' | 'offline' | 'degraded' | 'not_configured';
  latency?: number;
  message: string;
  lastCheck: string;
  details?: Record<string, any>;
}

export interface SystemStatus {
  overall: 'healthy' | 'degraded' | 'down';
  apis: APIStatus[];
  database: {
    footballMatches: number;
    basketballMatches: number;
    mlMetrics: number;
  };
  ml: {
    lastTraining: string | null;
    accuracy: number | null;
  };
  recommendations: string[];
}

// ===== FONCTIONS DE VÉRIFICATION =====

/**
 * Vérifie la connexion Supabase
 */
async function checkSupabase(): Promise<APIStatus> {
  const startTime = Date.now();
  
  try {
    const adminClient = getSupabaseAdmin();
    
    if (!adminClient) {
      return {
        name: 'Supabase',
        status: 'not_configured',
        message: 'Clé service_role non configurée',
        lastCheck: new Date().toISOString()
      };
    }
    
    // Test simple: compter les matchs
    const { count: footballCount, error: footballError } = await adminClient
      .from('football_matches')
      .select('id', { count: 'exact', head: true });
    
    if (footballError) {
      return {
        name: 'Supabase',
        status: 'offline',
        latency: Date.now() - startTime,
        message: `Erreur: ${footballError.message}`,
        lastCheck: new Date().toISOString()
      };
    }
    
    return {
      name: 'Supabase',
      status: 'online',
      latency: Date.now() - startTime,
      message: `${footballCount || 0} matchs football en base`,
      lastCheck: new Date().toISOString(),
      details: { footballMatches: footballCount }
    };
    
  } catch (error: any) {
    return {
      name: 'Supabase',
      status: 'offline',
      latency: Date.now() - startTime,
      message: error.message,
      lastCheck: new Date().toISOString()
    };
  }
}

/**
 * Vérifie TheOddsAPI
 */
async function checkTheOddsAPI(): Promise<APIStatus> {
  const startTime = Date.now();
  const status = getOddsAPIStatus();
  
  if (!status.configured) {
    return {
      name: 'TheOddsAPI',
      status: 'not_configured',
      message: 'Clé API non configurée (THE_ODDS_API_KEY)',
      lastCheck: new Date().toISOString()
    };
  }
  
  try {
    // Test rapide: récupérer un sport
    const apiKey = process.env.THE_ODDS_API_KEY;
    const response = await fetch(
      `https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}`,
      { next: { revalidate: 3600 } }
    );
    
    if (!response.ok) {
      return {
        name: 'TheOddsAPI',
        status: 'offline',
        latency: Date.now() - startTime,
        message: `HTTP ${response.status}`,
        lastCheck: new Date().toISOString()
      };
    }
    
    return {
      name: 'TheOddsAPI',
      status: 'online',
      latency: Date.now() - startTime,
      message: `${status.requestsRemaining} requêtes restantes`,
      lastCheck: new Date().toISOString(),
      details: status
    };
    
  } catch (error: any) {
    return {
      name: 'TheOddsAPI',
      status: 'offline',
      latency: Date.now() - startTime,
      message: error.message,
      lastCheck: new Date().toISOString()
    };
  }
}

/**
 * Vérifie Football-data.org
 */
async function checkFootballDataAPI(): Promise<APIStatus> {
  const startTime = Date.now();
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    return {
      name: 'Football-data.org',
      status: 'not_configured',
      message: 'Clé API non configurée (FOOTBALL_DATA_API_KEY)',
      lastCheck: new Date().toISOString()
    };
  }
  
  try {
    const response = await fetch(
      'https://api.football-data.org/v4/competitions?limit=1',
      {
        headers: { 'X-Auth-Token': apiKey },
        next: { revalidate: 3600 }
      }
    );
    
    if (!response.ok) {
      if (response.status === 403) {
        return {
          name: 'Football-data.org',
          status: 'degraded',
          latency: Date.now() - startTime,
          message: 'Limite de requêtes atteinte',
          lastCheck: new Date().toISOString()
        };
      }
      return {
        name: 'Football-data.org',
        status: 'offline',
        latency: Date.now() - startTime,
        message: `HTTP ${response.status}`,
        lastCheck: new Date().toISOString()
      };
    }
    
    return {
      name: 'Football-data.org',
      status: 'online',
      latency: Date.now() - startTime,
      message: 'API fonctionnelle',
      lastCheck: new Date().toISOString()
    };
    
  } catch (error: any) {
    return {
      name: 'Football-data.org',
      status: 'offline',
      latency: Date.now() - startTime,
      message: error.message,
      lastCheck: new Date().toISOString()
    };
  }
}

/**
 * Vérifie ESPN API
 */
async function checkESPNAPI(): Promise<APIStatus> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',
      { next: { revalidate: 600 } }
    );
    
    if (!response.ok) {
      return {
        name: 'ESPN API',
        status: 'offline',
        latency: Date.now() - startTime,
        message: `HTTP ${response.status}`,
        lastCheck: new Date().toISOString()
      };
    }
    
    return {
      name: 'ESPN API',
      status: 'online',
      latency: Date.now() - startTime,
      message: 'API fonctionnelle (gratuite)',
      lastCheck: new Date().toISOString()
    };
    
  } catch (error: any) {
    return {
      name: 'ESPN API',
      status: 'offline',
      latency: Date.now() - startTime,
      message: error.message,
      lastCheck: new Date().toISOString()
    };
  }
}

/**
 * Vérifie TheSportsDB
 */
async function checkTheSportsDB(): Promise<APIStatus> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(
      'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Arsenal',
      { next: { revalidate: 3600 } }
    );
    
    if (!response.ok) {
      return {
        name: 'TheSportsDB',
        status: 'offline',
        latency: Date.now() - startTime,
        message: `HTTP ${response.status}`,
        lastCheck: new Date().toISOString()
      };
    }
    
    return {
      name: 'TheSportsDB',
      status: 'online',
      latency: Date.now() - startTime,
      message: 'API fonctionnelle (gratuite)',
      lastCheck: new Date().toISOString()
    };
    
  } catch (error: any) {
    return {
      name: 'TheSportsDB',
      status: 'offline',
      latency: Date.now() - startTime,
      message: error.message,
      lastCheck: new Date().toISOString()
    };
  }
}

// ===== FONCTION PRINCIPALE =====

/**
 * Vérifie l'état complet du système
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  console.log('🔍 Vérification de l\'état du système...');
  
  // Vérifier tous les APIs en parallèle
  const [
    supabaseStatus,
    oddsAPIStatus,
    footballDataStatus,
    espnStatus,
    sportsDBStatus
  ] = await Promise.all([
    checkSupabase(),
    checkTheOddsAPI(),
    checkFootballDataAPI(),
    checkESPNAPI(),
    checkTheSportsDB()
  ]);
  
  const apis = [
    supabaseStatus,
    oddsAPIStatus,
    footballDataStatus,
    espnStatus,
    sportsDBStatus
  ];
  
  // Récupérer les stats de la base
  const adminClient = getSupabaseAdmin();
  let database = {
    footballMatches: 0,
    basketballMatches: 0,
    mlMetrics: 0
  };
  
  let ml = {
    lastTraining: null as string | null,
    accuracy: null as number | null
  };
  
  if (adminClient) {
    try {
      const [football, basketball, metrics] = await Promise.all([
        adminClient.from('football_matches').select('id', { count: 'exact', head: true }),
        adminClient.from('basketball_matches').select('id', { count: 'exact', head: true }),
        adminClient.from('ml_model_metrics').select('accuracy, training_date').order('training_date', { ascending: false }).limit(1)
      ]);
      
      database = {
        footballMatches: football.count || 0,
        basketballMatches: basketball.count || 0,
        mlMetrics: metrics.data?.length || 0
      };
      
      if (metrics.data && metrics.data.length > 0) {
        ml.lastTraining = metrics.data[0].training_date;
        ml.accuracy = metrics.data[0].accuracy;
      }
    } catch (e) {
      console.error('Erreur récupération stats DB:', e);
    }
  }
  
  // Déterminer l'état global
  const onlineApis = apis.filter(a => a.status === 'online').length;
  const totalConfigured = apis.filter(a => a.status !== 'not_configured').length;
  
  let overall: 'healthy' | 'degraded' | 'down' = 'healthy';
  if (supabaseStatus.status !== 'online') {
    overall = 'down';
  } else if (onlineApis < totalConfigured * 0.5) {
    overall = 'degraded';
  }
  
  // Recommandations
  const recommendations: string[] = [];
  
  if (oddsAPIStatus.status === 'not_configured') {
    recommendations.push('💡 Configurez THE_ODDS_API_KEY pour des cotes réelles de bookmakers');
  }
  if (footballDataStatus.status === 'not_configured') {
    recommendations.push('💡 Configurez FOOTBALL_DATA_API_KEY pour des données football réelles');
  }
  if (database.footballMatches < 2000) {
    recommendations.push('📊 Chargez plus de données football (actuel: ' + database.footballMatches + ')');
  }
  if (database.basketballMatches < 500) {
    recommendations.push('🏀 Chargez plus de données NBA (actuel: ' + database.basketballMatches + ')');
  }
  if (ml.accuracy && ml.accuracy < 55) {
    recommendations.push('🤖 Entraînez le modèle avec plus de données pour améliorer l\'accuracy');
  }
  
  return {
    overall,
    apis,
    database,
    ml,
    recommendations
  };
}

/**
 * Génère un rapport HTML du statut
 */
export function generateStatusHTML(status: SystemStatus): string {
  const statusColors = {
    online: '🟢',
    offline: '🔴',
    degraded: '🟡',
    not_configured: '⚪',
    healthy: '✅',
    down: '❌'
  };
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Pronostics App - Status</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
    .status-card { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 8px; }
    .online { border-left: 4px solid #4caf50; }
    .offline { border-left: 4px solid #f44336; }
    .degraded { border-left: 4px solid #ff9800; }
    .not_configured { border-left: 4px solid #9e9e9e; }
    .recommendation { background: #e3f2fd; padding: 10px; margin: 5px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>🔍 Pronostics App - État du Système</h1>
  <p>Dernière vérification: ${new Date().toLocaleString()}</p>
  
  <h2>${statusColors[status.overall]} État global: ${status.overall.toUpperCase()}</h2>
  
  <h2>📡 APIs</h2>
  ${status.apis.map(api => `
    <div class="status-card ${api.status}">
      <strong>${statusColors[api.status]} ${api.name}</strong>
      <br>Latence: ${api.latency || 'N/A'}ms
      <br>${api.message}
    </div>
  `).join('')}
  
  <h2>📊 Base de données</h2>
  <div class="status-card">
    ⚽ Matchs Football: ${status.database.footballMatches}<br>
    🏀 Matchs Basketball: ${status.database.basketballMatches}<br>
    🤖 Métriques ML: ${status.database.mlMetrics}
  </div>
  
  <h2>🤖 Machine Learning</h2>
  <div class="status-card">
    Dernier entraînement: ${status.ml.lastTraining || 'Jamais'}<br>
    Accuracy: ${status.ml.accuracy ? status.ml.accuracy.toFixed(1) + '%' : 'N/A'}
  </div>
  
  <h2>💡 Recommandations</h2>
  ${status.recommendations.map(r => `<div class="recommendation">${r}</div>`).join('')}
</body>
</html>
  `;
}

export default {
  getSystemStatus,
  generateStatusHTML
};
