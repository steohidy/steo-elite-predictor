/**
 * Poisson Engine - Prédiction de scores et probabilités
 * 
 * La loi de Poisson est le "Saint Graal" des modélisateurs de football.
 * Elle calcule la probabilité qu'un événement (but) se produise un certain 
 * nombre de fois dans un intervalle donné.
 * 
 * P(k;λ) = (λ^k * e^-λ) / k!
 * 
 * k : Nombre de buts (0, 1, 2, 3...)
 * λ : Expected Goals (moyenne de buts attendus)
 * 
 * Avantages:
 * - Mathématiquement légère (< 1ms par prédiction)
 * - Pas de bibliothèques lourdes
 * - Prédiction de scores exacts
 */

// ===== TYPES =====

export interface PoissonPrediction {
  // Probabilités 1N2
  homeWin: number;
  draw: number;
  awayWin: number;
  
  // Scores les plus probables
  mostLikelyScores: { score: string; prob: number }[];
  
  // Expected Goals (λ)
  lambdaHome: number;
  lambdaAway: number;
  
  // Over/Under 2.5
  over25: number;
  under25: number;
  
  // BTTS (Both Teams To Score)
  bttsYes: number;
  bttsNo: number;
  
  // Matrice complète des probabilités
  scoreMatrix: number[][];
}

export interface TeamStrength {
  attackStrength: number;   // Force d'attaque (ratio vs moyenne ligue)
  defenseStrength: number;  // Force défensive (ratio vs moyenne ligue)
  avgGoalsScored: number;   // Moyenne buts marqués
  avgGoalsConceded: number; // Moyenne buts encaissés
}

// ===== POISSON ENGINE =====

export class PoissonEngine {
  /**
   * Calcule la factorielle (nécessaire pour Poisson)
   */
  private static factorial(n: number): number {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  /**
   * Probabilité de Poisson: P(k buts | λ expected)
   * P(k;λ) = (λ^k * e^-λ) / k!
   */
  static probability(k: number, lambda: number): number {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
  }

  /**
   * Calcule les λ (expected goals) pour un match
   * 
   * La formule combine:
   * - Force d'attaque de l'équipe
   * - Faiblesse défensive de l'adversaire
   * - Avantage domicile
   */
  static calculateLambdas(
    homeTeam: TeamStrength,
    awayTeam: TeamStrength,
    leagueAvgHomeGoals: number = 1.5,
    leagueAvgAwayGoals: number = 1.2
  ): { lambdaHome: number; lambdaAway: number } {
    // λ Home = Attaque Home * Défense Away * Moyenne Buts Home Ligue
    const lambdaHome = homeTeam.attackStrength * 
                       awayTeam.defenseStrength * 
                       leagueAvgHomeGoals;

    // λ Away = Attaque Away * Défense Home * Moyenne Buts Away Ligue
    const lambdaAway = awayTeam.attackStrength * 
                       homeTeam.defenseStrength * 
                       leagueAvgAwayGoals;

    return { 
      lambdaHome: Math.max(0.1, Math.min(4.0, lambdaHome)),
      lambdaAway: Math.max(0.1, Math.min(4.0, lambdaAway))
    };
  }

  /**
   * Prédiction complète d'un match via Poisson
   * Génère une matrice de probabilités pour tous les scores possibles
   */
  static predictMatch(lambdaHome: number, lambdaAway: number): PoissonPrediction {
    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let over25 = 0;
    let under25 = 0;
    let bttsYes = 0;
    let bttsNo = 0;
    
    const maxGoals = 7; // On calcule jusqu'à 7-7 (suffisant pour 99.9% des matchs)
    const scoreMatrix: number[][] = [];
    const allScores: { score: string; prob: number }[] = [];

    for (let h = 0; h <= maxGoals; h++) {
      scoreMatrix[h] = [];
      
      for (let a = 0; a <= maxGoals; a++) {
        // Probabilités indépendantes: P(home=h) * P(away=a)
        const pHome = this.probability(h, lambdaHome);
        const pAway = this.probability(a, lambdaAway);
        const prob = pHome * pAway;
        
        scoreMatrix[h][a] = prob;

        // Issue du match
        if (h > a) homeWin += prob;
        else if (h === a) draw += prob;
        else awayWin += prob;

        // Over/Under 2.5
        if (h + a > 2.5) over25 += prob;
        else under25 += prob;

        // BTTS
        if (h > 0 && a > 0) bttsYes += prob;
        else bttsNo += prob;

        // Stocker pour classement
        allScores.push({ score: `${h}-${a}`, prob });
      }
    }

    // Trier les scores par probabilité
    const mostLikelyScores = allScores
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 6);

    return {
      homeWin: Math.round(homeWin * 1000) / 1000,
      draw: Math.round(draw * 1000) / 1000,
      awayWin: Math.round(awayWin * 1000) / 1000,
      mostLikelyScores: mostLikelyScores.map(s => ({
        score: s.score,
        prob: Math.round(s.prob * 1000) / 1000
      })),
      lambdaHome: Math.round(lambdaHome * 100) / 100,
      lambdaAway: Math.round(lambdaAway * 100) / 100,
      over25: Math.round(over25 * 1000) / 1000,
      under25: Math.round(under25 * 1000) / 1000,
      bttsYes: Math.round(bttsYes * 1000) / 1000,
      bttsNo: Math.round(bttsNo * 1000) / 1000,
      scoreMatrix
    };
  }

  /**
   * Calcule les forces d'une équipe basées sur ses stats
   * Comparé à la moyenne de la ligue
   */
  static calculateTeamStrength(
    avgGoalsScored: number,
    avgGoalsConceded: number,
    leagueAvgGoals: number = 2.6
  ): TeamStrength {
    const attackStrength = avgGoalsScored / (leagueAvgGoals / 2);
    const defenseStrength = avgGoalsConceded / (leagueAvgGoals / 2);
    
    // Inverser pour la défense: moins on encaisse = meilleure défense = score < 1
    const defenseScore = 2 - defenseStrength; 

    return {
      attackStrength: Math.max(0.3, Math.min(2.0, attackStrength)),
      defenseStrength: Math.max(0.3, Math.min(2.0, defenseScore)),
      avgGoalsScored,
      avgGoalsConceded
    };
  }

  /**
   * Prédiction rapide depuis les cotes implicites
   * Utilise les cotes comme proxy pour les expected goals
   */
  static predictFromOdds(
    oddsHome: number,
    oddsDraw: number,
    oddsAway: number
  ): PoissonPrediction {
    // Convertir les cotes en probabilités
    const total = 1/oddsHome + 1/oddsDraw + 1/oddsAway;
    const pHome = (1/oddsHome) / total;
    const pDraw = (1/oddsDraw) / total;
    const pAway = (1/oddsAway) / total;

    // Estimer les lambdas depuis les probabilités
    // Formule empirique: λ ≈ -ln(1 - pWin) * 1.5
    const lambdaHome = -Math.log(1 - pHome - pDraw * 0.5) * 1.3 + 0.3;
    const lambdaAway = -Math.log(1 - pAway - pDraw * 0.5) * 1.3 + 0.3;

    // Utiliser la prédiction Poisson complète
    return this.predictMatch(
      Math.max(0.5, Math.min(3.5, lambdaHome)),
      Math.max(0.5, Math.min(3.5, lambdaAway))
    );
  }

  /**
   * Détecte les value bets en comparant Poisson aux cotes
   */
  static detectValueBet(
    poissonResult: PoissonPrediction,
    oddsHome: number,
    oddsDraw: number,
    oddsAway: number
  ): { detected: boolean; type: 'home' | 'draw' | 'away' | null; edge: number } {
    const impliedHome = 1 / oddsHome;
    const impliedDraw = 1 / oddsDraw;
    const impliedAway = 1 / oddsAway;

    const edgeHome = poissonResult.homeWin - impliedHome;
    const edgeDraw = poissonResult.draw - impliedDraw;
    const edgeAway = poissonResult.awayWin - impliedAway;

    const threshold = 0.05; // 5% de marge minimum

    if (edgeHome > threshold && edgeHome > edgeDraw && edgeHome > edgeAway) {
      return { detected: true, type: 'home', edge: edgeHome };
    }
    if (edgeDraw > threshold && edgeDraw > edgeHome && edgeDraw > edgeAway) {
      return { detected: true, type: 'draw', edge: edgeDraw };
    }
    if (edgeAway > threshold && edgeAway > edgeHome && edgeAway > edgeDraw) {
      return { detected: true, type: 'away', edge: edgeAway };
    }

    return { detected: false, type: null, edge: 0 };
  }
}

// ===== FEATURE ENGINE (Rolling Average) =====

export interface PreparedFeatures {
  avgGoalsScored: number;
  avgGoalsConceded: number;
  winRate: number;
  form: number; // 0-1
  homeAdvantage: number;
  last5Results: ('W' | 'D' | 'L')[];
}

export interface HistoricalMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  status: 'FT' | 'NS' | 'LIVE';
}

export class FeatureEngine {
  /**
   * Calcule les stats d'une équipe sur ses X derniers matchs (Rolling Average)
   * C'est le cœur du Feature Engineering pour le ML
   */
  static getTeamStats(
    teamName: string,
    allMatches: HistoricalMatch[],
    beforeDate: string,
    limit: number = 5
  ): PreparedFeatures {
    // Filtrer les matchs passés de l'équipe
    const pastMatches = allMatches
      .filter(m => 
        (m.homeTeam === teamName || m.awayTeam === teamName) && 
        m.date < beforeDate &&
        m.status === 'FT'
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

    // Pas de données -> valeurs neutres
    if (pastMatches.length === 0) {
      return {
        avgGoalsScored: 1.3,
        avgGoalsConceded: 1.3,
        winRate: 0.33,
        form: 0.5,
        homeAdvantage: 0.15,
        last5Results: []
      };
    }

    let totalScored = 0;
    let totalConceded = 0;
    let wins = 0;
    const results: ('W' | 'D' | 'L')[] = [];

    // Séparer matchs domicile/extérieur pour l'avantage domicile
    let homeMatches = 0;
    let homeWins = 0;
    let awayMatches = 0;
    let awayWins = 0;

    pastMatches.forEach(m => {
      const isHome = m.homeTeam === teamName;
      const scored = isHome ? m.homeGoals : m.awayGoals;
      const conceded = isHome ? m.awayGoals : m.homeGoals;

      totalScored += scored;
      totalConceded += conceded;

      if (scored > conceded) {
        wins++;
        results.push('W');
        if (isHome) homeWins++;
      } else if (scored === conceded) {
        results.push('D');
      } else {
        results.push('L');
      }

      if (isHome) {
        homeMatches++;
      } else {
        awayMatches++;
        if (scored > conceded) awayWins++;
      }
    });

    // Calculer l'avantage domicile
    let homeAdvantage = 0.15; // Valeur par défaut
    if (homeMatches > 0 && awayMatches > 0) {
      const homeWinRate = homeWins / homeMatches;
      const awayWinRate = awayWins / awayMatches;
      homeAdvantage = Math.max(0, homeWinRate - awayWinRate + 0.1);
    }

    // Forme pondérée (matchs récents = plus important)
    const weights = [0.3, 0.25, 0.2, 0.15, 0.1]; // Poids décroissants
    let weightedForm = 0;
    results.forEach((r, i) => {
      const w = weights[i] || 0.1;
      if (r === 'W') weightedForm += w * 3;
      else if (r === 'D') weightedForm += w * 1;
    });

    return {
      avgGoalsScored: totalScored / pastMatches.length,
      avgGoalsConceded: totalConceded / pastMatches.length,
      winRate: wins / pastMatches.length,
      form: weightedForm / 1.5, // Normaliser à 0-1
      homeAdvantage: Math.min(0.4, homeAdvantage),
      last5Results: results
    };
  }

  /**
   * Prépare le tenseur d'entrée pour le modèle ML
   * Normalise toutes les features sur une échelle 0-1
   */
  static prepareTensorInput(
    homeStats: PreparedFeatures,
    awayStats: PreparedFeatures,
    oddsHome: number,
    oddsDraw: number,
    oddsAway: number
  ): number[] {
    // Calcul des probabilités implicites
    const total = 1/oddsHome + 1/oddsDraw + 1/oddsAway;
    const impliedHome = (1/oddsHome) / total;
    const impliedDraw = (1/oddsDraw) / total;
    const impliedAway = (1/oddsAway) / total;

    return [
      // Cotes normalisées
      1 / oddsHome / 3,      // Max ~3
      1 / oddsDraw / 5,      // Max ~5
      1 / oddsAway / 3,
      
      // Probabilités implicites (déjà 0-1)
      impliedHome,
      impliedDraw,
      impliedAway,
      
      // Stats domicile
      homeStats.avgGoalsScored / 4,
      homeStats.avgGoalsConceded / 4,
      homeStats.winRate,
      homeStats.form,
      homeStats.homeAdvantage,
      
      // Stats extérieur
      awayStats.avgGoalsScored / 4,
      awayStats.avgGoalsConceded / 4,
      awayStats.winRate,
      awayStats.form,
      
      // Dérivées
      homeStats.form - awayStats.form,          // Différence de forme
      homeStats.avgGoalsScored - awayStats.avgGoalsScored,
      awayStats.avgGoalsConceded - homeStats.avgGoalsConceded,
      homeStats.homeAdvantage
    ];
  }
}

// ===== EXPORTS =====

const PoissonServices = {
  PoissonEngine,
  FeatureEngine
};

export default PoissonServices;
