# 🚀 Guide de Déploiement - Pronostics App

## ✅ Code poussé sur GitHub
**Repository**: https://github.com/steohidy/steo-elite-predictor

---

## 📋 Étapes de Déploiement Vercel

### 1. Connecter le repository à Vercel

1. Allez sur [vercel.com](https://vercel.com)
2. Cliquez sur **"Add New Project"**
3. Importez le repository `steohidy/steo-elite-predictor`
4. Configurez le **Root Directory** sur `/` (défaut)

### 2. Configurer les Variables d'Environnement

Dans **Settings > Environment Variables**, ajoutez :

```
SUPABASE_URL=https://aumsrakioetvvqopthbs.supabase.co

SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTUwMjYsImV4cCI6MjA4OTMzMTAyNn0.FxO7c64Rr7v3KpQFdo6ffB6LzWZ7Am3NkHLiXFhZbU0

SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14

NEXT_PUBLIC_SUPABASE_URL=https://aumsrakioetvvqopthbs.supabase.co

NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTUwMjYsImV4cCI6MjA4OTMzMTAyNn0.FxO7c64Rr7v3KpQFdo6ffB6LzWZ7Am3NkHLiXFhZbU0

CRON_SECRET=steo-elite-cron-2026
```

### 3. (Optionnel) Pour des données réelles

Inscrivez-vous sur [football-data.org](https://www.football-data.org/client/register) (gratuit) et ajoutez :

```
FOOTBALL_DATA_API_KEY=votre_cle_api
```

### 4. Déployer

Cliquez sur **"Deploy"** et attendez le build.

---

## 🔗 URLs après déploiement

- **Production**: `https://steo-elite-predictor.vercel.app`
- **Cron ML**: `https://steo-elite-predictor.vercel.app/api/cron-ml?action=progress`

---

## 📊 État actuel des données

| Sport | Matchs | Target | Progression |
|-------|--------|--------|-------------|
| ⚽ Football | 2,741 | 2,000 | ✅ 100% |
| 🏀 Basketball | 408 | 500 | ✅ 82% |
| 🤖 ML Training | Terminé | - | 43% accuracy |

---

## ⏰ Cron Jobs configurés

Les tâches automatiques tournent à :
- **6h UTC**: Pré-calcul des stats
- **7h UTC**: Vérification des résultats
- **8h UTC**: Entraînement ML automatique

---

## 🧪 Tests après déploiement

```bash
# Vérifier le statut
curl https://steo-elite-predictor.vercel.app/api/cron-ml?action=progress

# Lancer le chargement des données (avec autorisation)
curl -X POST "https://steo-elite-predictor.vercel.app/api/cron-ml?action=all&secret=steo-elite-cron-2026"

# Entraîner le modèle
curl -X POST "https://steo-elite-predictor.vercel.app/api/batch-ml?action=train_supabase"
```

---

## ✨ Fonctionnalités

- ✅ Modèle Dixon-Coles pour prédictions football
- ✅ Entraînement ML automatique
- ✅ Backtesting sur données historiques
- ✅ Métriques de performance (accuracy, ROI, Brier score)
- ✅ Progression en temps réel
- ✅ Support NBA/ Basketball
- ✅ Sources de données réelles (football-data.org, ESPN)

---

*Dernière mise à jour: 18 mars 2026*
