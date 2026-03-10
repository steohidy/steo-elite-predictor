# Steo Élite Predictor - Historique du Projet

## 📋 Résumé du Projet

**Application:** Steo Élite Predictor - PWA de pronostics sportifs  
**Stack:** Next.js 16 + TypeScript + Vercel  
**Dépôt:** https://github.com/steohidy/my-project

---

## 🔧 Configuration API

### The Odds API
- **Quota:** 500 crédits gratuits/mois (reset mensuel)
- **Consommation actuelle:** ~5 crédits/jour
- **Stratégie:** 3 ligues Football + 1 NBA par jour

### Ligues Football (10 configurées, 3 sélectionnées/jour)
- Premier League, Ligue 1, La Liga, Bundesliga
- Liga Portugal, Jupiler Pro League
- Champions League, Europa League
- Coupe du Monde, Euro

### NBA
- Basketball NBA uniquement (matchs de nuit 20h-00h GMT)

---

## 👥 Système Utilisateurs

### Comptes Configurés

| Login | Mot de passe | Rôle | Validité |
|-------|--------------|------|----------|
| admin | admin123 | admin | Permanent |
| demo | demo123 | demo | Permanent |
| DD | 112233 | user | 3 mois après 1ère connexion |
| Lyno | 223345 | user | 3 mois après 1ère connexion |
| Elcapo | 234673 | user | 3 mois après 1ère connexion |
| PJ | 775553 | user | 3 mois après 1ère connexion |
| Hans | 547633 | user | 3 mois après 1ère connexion |

### Règles de Sécurité
- **Session unique:** 1 compte = 1 session active (pas de multi-appareils)
- **Durée session:** 20 minutes
- **Expiration:** Comptes user expirent après 3 mois

---

## 💾 Persistance JSON

### Configuration requise
Variable d'environnement dans Vercel:
```
GITHUB_TOKEN=ghp_votre_token_ici
```

### Fichier de données
- `data/users.json` - Utilisateurs + sessions actives + logs d'activité

---

## 🏦 Bankroll

- **Valeur initiale:** 0€ (l'utilisateur entre son capital)
- **Bouton réinitialisation:** Disponible (icône orange 🔄)
- **Types de transactions:** Dépôt, Pari, Gain, Retrait

---

## 📊 Plan Matchs (15/jour max)

| Période GMT | Sport | Matchs |
|-------------|-------|--------|
| 00h-20h | Football | 10 |
| 20h-00h | NBA | 5 |

---

## 📂 Fichiers Clés

| Fichier | Description |
|---------|-------------|
| `src/lib/users.ts` | Gestion utilisateurs |
| `src/lib/userPersistence.ts` | Persistance JSON + sessions |
| `src/lib/crossValidation.ts` | API Odds + distribution matchs |
| `src/components/MatchCard.tsx` | Affichage matchs |
| `src/components/BankrollManager.tsx` | Gestion bankroll |
| `src/app/api/admin/users/route.ts` | API Admin |
| `data/users.json` | Données persistantes |

---

## 🔄 Dernières Modifications

### 2024-03-07 - Fix z-ai SDK sur Vercel
- ✅ Analyse du SDK z-ai-web-dev-sdk (version 0.0.16)
- ✅ Le constructeur TypeScript est déclaré "private" mais fonctionne en JavaScript
- ✅ Solution: bypass TypeScript avec cast `as any` pour instancier directement
- ✅ Configuration passée directement au constructeur sans fichier de config
- ✅ Variables d'environnement utilisées: ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_USER_ID
- ✅ Fallback gracieux si SDK non disponible

### 2024-03-04 - Analyse de Combinés
- ✅ Nouvelle section "Analyse Combiné" dans le menu
- ✅ Limite de 3 analyses/jour/utilisateur
- ✅ Maximum 3 matchs par combiné analysé
- ✅ Affichage des championnats pris en charge
- ✅ Indicateur de compatibilité bookmakers
- ✅ Saisie assistée (équipes + type de pari)
- ✅ Cross-check avec cache local (0 crédit)
- ✅ API `/api/combi-analysis` créée

### 2024-03-03 (Suite)
- ✅ Ajout prédictions de BUTS (Over/Under 2.5, 1.5, BTTS)
- ✅ Ajout prédictions de CARTONS (Over/Under 4.5, Risque rouge)
- ✅ Ajout prédictions de CORNERS (Over/Under 8.5, 9.5)
- ✅ Ajout prédictions AVANCÉES (Score exact, Résultat MT)
- ✅ Interface MatchCardCompact enrichie avec grille d'options
- ✅ Bouton "Plus d'options avancées" dépliable
- ✅ Indicateurs visuels avec couleurs pour chaque type de pari

### 2024-03-03
- ✅ Blocage connexions simultanées (1 compte = 1 session)
- ✅ Bankroll initial à 0€ + bouton reset
- ✅ Plan 10 Football + 5 NBA (5 crédits/jour)
- ✅ Affichage complet noms équipes

---

## 🚀 Déploiement

- **Plateforme:** Vercel
- **Auto-déploiement:** Oui, à chaque push sur `master`
- **Repo:** https://github.com/steohidy/my-project

---

## 📝 Notes pour le futur

1. **Ajouter utilisateur:** Via panneau admin (connecté en admin)
2. **Prolonger validité:** Panneau admin → bouton "Ajouter temps"
3. **Vérifier sessions:** Fichier `data/users.json` → `activeSessions`
4. **Logs d'activité:** Fichier `data/users.json` → `logs`

---

## 🔧 2024-03-07 - Fix z-ai SDK pour Vercel

### Problème
- `ZAI.create()` nécessite un fichier `.z-ai-config` sur le disque
- Vercel serverless a un filesystem read-only (sauf /tmp)
- Le SDK ne cherchait pas dans /tmp par défaut

### Solution
- **Instanciation directe** de la classe ZAI avec la config:
  ```typescript
  // Au lieu de: await ZAI.create() (nécessite fichier)
  // On utilise: new ZAI(config) (pas de fichier requis)
  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  zaiInstance = new ZAI(config);
  ```

### Fichiers modifiés
- `src/lib/zaiInit.ts` - Instanciation directe sans fichier config

### Variables d'environnement Vercel
```
ZAI_BASE_URL=http://172.25.136.193:8080/v1
ZAI_API_KEY=Z.ai
ZAI_CHAT_ID=chat-67ccc72c-b06c-4cdc-b880-f7e9f177527b
ZAI_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ZAI_USER_ID=7737fa81-0a8f-42f3-8d75-4ccad826a05d
```

---

## 🔧 2024-03-07 - Cron Job 7h UTC

### Fonctionnalités
- Vérification des résultats NBA via ESPN API
- Vérification des résultats Football via Football-Data API
- Mise à jour des statistiques

### Endpoint
- `GET /api/cron?key=CRON_SECRET` - Exécution automatique à 7h UTC
- `GET /api/cron?force=true` - Forcer l'exécution manuellement

### Fichier créé
- `src/app/api/cron/route.ts`

---

## 🔧 2024-03-07 - Distribution Matchs

### Planning
| Période UTC | Sport | Max matchs |
|-------------|-------|------------|
| 01h-20h | Football | 10 |
| 20h-01h | NBA | 5 |

### Conseils Expert V2
- Limité à **4 suggestions** au lieu de 7
- Optimisé pour réduire le temps de chargement

---

## 🔧 2024-03-07 - Système ML Pré-entraîné

### Architecture Recommandée (implémentée)

Le Pipeline d'apprentissage:

1. **Collecte (Scraping/API)** : Stats en temps réel via APIs existantes
2. **Feature Engineering** : Transformation en 34 features normalisées
3. **Entraînement LOCAL** : Script `ml/train.ts` à exécuter hors Vercel
4. **Export JSON** : Modèle sérialisé dans `data/ml/model.json`
5. **Inférence Vercel** : `src/lib/mlInference.ts` charge le modèle

### Variables Complexes Intégrées

| Variable | Description | Impact |
|----------|-------------|--------|
| `homeAdvantage` | Différence perf domicile/extérieur | +0.1 à +0.3 |
| `fatigueDiff` | Jours de repos depuis dernier match | -5% à +5% |
| `motivationDiff` | Enjeu (titre/relegation) | High/Medium/Low |
| `form` | Forme sur 5 derniers matchs | 0-1 normalisé |
| `h2h` | Historique tête-à-tête | % victoires |

### Fichiers ML

```
ml/
├── featureEngineering.ts  # 34 features normalisées
├── model.ts              # Architecture réseau neurones
├── train.ts              # Script entraînement local
└── generateModel.ts      # Génération modèle initial

src/lib/
└── mlInference.ts        # Inférence rapide (Vercel)

data/ml/
└── model.json            # Modèle pré-entraîné
```

### Comment Entraîner Localement

```bash
# Installer les dépendances
bun install

# Générer données synthétiques et entraîner
bun run ml/train.ts

# Le modèle est sauvegardé dans data/ml/model.json
# Il sera automatiquement utilisé par Vercel
```

### Architecture du Modèle

```
Input (34 features)
  ↓
Hidden Layer 1 (64 neurons, ReLU)
  ↓
Hidden Layer 2 (32 neurons, ReLU)
  ↓
Hidden Layer 3 (16 neurons, ReLU)
  ↓
Output (3 neurons, Softmax)
  → [Prob Home, Prob Draw, Prob Away]
```

### Performance

- **Temps d'inférence** : < 50ms par match
- **Taille modèle** : ~100 KB JSON
- **Mémoire** : Minimal (pas de GPU requis)
- **Accuracy cible** : 55-65% (baseline)
