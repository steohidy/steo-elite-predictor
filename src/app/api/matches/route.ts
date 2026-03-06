import { NextResponse } from 'next/server';
import PredictionStore from '@/lib/store';

// Type local pour éviter les imports problématiques
interface MatchData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  date: string;
  oddsHome: number;
  oddsDraw: number | null;
  oddsAway: number;
  status: string;
  timeSlot?: 'day' | 'night';
  insight: {
    riskPercentage: number;
    valueBetDetected: boolean;
    valueBetType: string | null;
    confidence: string;
    crossValidation?: {
      sourcesCount: number;
      oddsConsensus: boolean;
      dataQuality: 'high' | 'medium' | 'low';
    };
  };
  goalsPrediction?: {
    total: number;
    over25: number;
    under25: number;
    over15: number;
    bothTeamsScore: number;
    prediction: string;
  };
  cardsPrediction?: {
    total: number;
    over45: number;
    under45: number;
    redCardRisk: number;
    prediction: string;
  };
}

interface TimingInfo {
  currentHour: number;
  canRefresh: boolean;
  nextRefreshTime: string;
  currentPhase: 'morning' | 'afternoon' | 'evening';
  message: string;
}

// Cache partagé
let cachedData: { matches: MatchData[]; timing: TimingInfo } | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Vérifie automatiquement les résultats des matchs terminés
 * Appelé avant de retourner les matchs
 */
async function autoVerifyResults(): Promise<void> {
  try {
    const pendingPredictions = PredictionStore.getPending();
    
    if (pendingPredictions.length === 0) {
      return;
    }
    
    // Appeler l'API de vérification des résultats en interne
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    // Vérifier les résultats de manière asynchrone sans bloquer
    fetch(`${baseUrl}/api/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_results' })
    }).catch(err => {
      console.log('⚠️ Auto-vérification des résultats échouée:', err.message);
    });
    
  } catch (error) {
    console.error('⚠️ Erreur auto-vérification:', error);
  }
}

/**
 * GET - Récupérer les matchs avec croisement multi-sources
 * DONNÉES RÉELLES UNIQUEMENT
 * GESTION INTELLIGENTE DU TIMING
 */
export async function GET() {
  try {
    const now = Date.now();
    
    // Vérifier le cache
    if (cachedData && (now - lastFetchTime) < CACHE_TTL) {
      console.log('📦 Utilisation du cache');
      // Mais mettre à jour le timing (car l'heure change)
      const { getTimingInfo } = await import('@/lib/crossValidation');
      const currentTiming = getTimingInfo();
      
      // Lancer la vérification des résultats en arrière-plan
      autoVerifyResults();
      
      return NextResponse.json({
        ...cachedData,
        timing: currentTiming
      });
    }

    // Import dynamique pour éviter les erreurs de build
    const { getCrossValidatedMatches } = await import('@/lib/crossValidation');
    
    const result = await getCrossValidatedMatches();
    
    if (result.matches && result.matches.length > 0) {
      cachedData = result;
      lastFetchTime = now;
      
      // 🆕 Sauvegarder automatiquement les pronostics à faible risque
      const safeMatches = result.matches.filter(
        (m: MatchData) => m.insight && m.insight.riskPercentage <= 40 && m.status === 'upcoming'
      );
      
      if (safeMatches.length > 0) {
        console.log(`💾 Sauvegarde automatique de ${safeMatches.length} pronostics sûrs...`);
        
        for (const match of safeMatches) {
          try {
            PredictionStore.add({
              matchId: match.id,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              league: match.league || 'Unknown',
              sport: match.sport || 'Foot',
              matchDate: match.date,
              oddsHome: match.oddsHome,
              oddsDraw: match.oddsDraw,
              oddsAway: match.oddsAway,
              predictedResult: match.oddsHome < match.oddsAway ? 'home' : 'away',
              predictedGoals: match.goalsPrediction?.prediction,
              confidence: match.insight?.confidence || 'medium',
              riskPercentage: match.insight?.riskPercentage || 50,
              sources: match.sources || ['API']
            });
          } catch (err) {
            // Ignorer si déjà existant
            console.log(`⚠️ Pronostic ${match.id} déjà existant ou erreur`);
          }
        }
        console.log(`✅ ${safeMatches.length} pronostics sauvegardés automatiquement`);
      }
      
      // Lancer la vérification des résultats en arrière-plan
      autoVerifyResults();
      
      return NextResponse.json(result);
    }
    
    // Aucun match - retourner un message d'erreur clair
    console.error('❌ Aucune donnée réelle disponible');
    return NextResponse.json({ 
      error: 'Aucun match disponible actuellement',
      message: 'Veuillez réessayer dans quelques minutes',
      matches: [],
      timing: result.timing
    });

  } catch (error) {
    console.error('Erreur API matches:', error);
    return NextResponse.json({ 
      error: 'Erreur de connexion aux APIs',
      message: 'Vérifiez votre connexion et réessayez',
      matches: [],
      timing: {
        currentHour: new Date().getHours(),
        canRefresh: false,
        nextRefreshTime: '14h00',
        currentPhase: 'morning',
        message: 'Erreur de connexion'
      }
    }, { status: 500 });
  }
}
