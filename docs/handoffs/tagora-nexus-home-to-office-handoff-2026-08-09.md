# TAGORA Nexus — Handoff maison vers bureau

## Identification

| Champ | Valeur |
|---|---|
| Date | 2026-08-09 |
| Agent donneur | Martin |
| Agent exécutant (sauvegarde) | Agent Cursor TAGORA Time uniquement |
| Dépôt utilisé pour la sauvegarde | TAGORA Time (`Oliem54/tagora-time`) |
| Branche | `main` |
| SHA initial | `c248b3de2eb7f319be6c06ee6c733b2f692ae676` |
| SHA final après commit | Commit message exact : `Document TAGORA Nexus project handoff` — vérifier avec `git rev-parse HEAD` après `git pull --ff-only` au bureau |
| Nature | Sauvegarde documentaire uniquement — **aucune** implémentation Nexus |

## Fichiers créés

1. `docs/architecture/tagora-nexus-prompt-maitre-2026-08-09.md`
2. `docs/handoffs/tagora-nexus-home-to-office-handoff-2026-08-09.md`

Document d’architecture préexistant (référence) :

- `docs/architecture/tagora-time-v1-tagora-unified-module-portal-architecture-plan-2026-08-09.md`

## Décisions confirmées (6 / 14 — 43 %)

1. **Domaine central cible** : `app.tagora.ca` (cible architecturale seulement ; aucun DNS).
2. **Nom public du portail** : Mon espace TAGORA.
3. **Identité centrale** : Supabase Auth central (validation staging obligatoire avant intégration).
4. **Dépôts** : portail en dépôt séparé ; modules conservent dépôts / données / déploiements.
5. **Session** : centrale + transfert sécurisé court / usage unique ; revalidation serveur par module ; pas de cookie multi-domaines aveugle.
6. **Organisation plateforme** : TAGORA Cloud ; Oliem, X-Plod et clients = orgs isolées.

Identité projet consignés :

```text
PROJECT_PUBLIC_NAME=TAGORA Nexus
PUBLIC_PORTAL_NAME=Mon espace TAGORA
TECHNICAL_REPOSITORY_NAME=tagora-cloud-portal
PRIMARY_AGENT_NAME=AGENT TAGORA NEXUS
TARGET_DOMAIN=app.tagora.ca
PLATFORM_ORGANIZATION=TAGORA Cloud
PROJECT_REPOSITORY_CREATED=false
IMPLEMENTATION_STARTED=false
```

## Décisions restantes (non confirmées)

7. Premier module pilote  
8. Règle d’accès multi-organisations  
9. Modèle de forfaits  
10. Identité visuelle commune détaillée  
11. Ordre d’intégration des modules  
12. Stratégie de facturation  
13. Conditions du pilote  
14. Conditions de production  

TAGORA Time pourra être étudié comme pilote plus tard — **pas encore confirmé définitivement**.

## Garde-fous

- Aucun code modifié dans ce bloc.
- Dépôt `tagora-cloud-portal` **non créé**.
- Production / DNS / Vercel / Supabase **non touchés**.
- Aucun secret lu ou affiché.
- Trois stashes TAGORA Time **intacts** (ne pas apply / drop).
- Ne pas démarrer le développement Nexus dans TAGORA Time.
- TAGORA Flow (n8n) planifié mais à **0 %** ; n8n ≠ IdP ≠ base métier.
- UI/UX bilingue exigée pour les pages communes Nexus ; pas de refonte forcée de tous les modules.

## État de TAGORA Time

```text
TAGORA_TIME_V1_PROGRESS=100%
TAGORA_TIME_FUNCTIONAL_PROGRESS=100%
TAGORA_TIME_TECHNICAL_STABILIZATION=100%
TAGORA_TIME_V1_BLOCKER_COUNT=0
```

## État de TAGORA Nexus

```text
UNIFIED_PORTAL_ARCHITECTURE_PROGRESS=100%
TAGORA_NEXUS_DECISION_PROGRESS=43%
TAGORA_NEXUS_IMPLEMENTATION_PROGRESS=0%
TAGORA_NEXUS_PRODUCTION_PROGRESS=0%
TAGORA_NEXUS_PRODUCTION_AUTHORIZED=false
TAGORA_NEXUS_REPOSITORY_CREATED=false
TAGORA_NEXUS_IMPLEMENTATION_STARTED=false
```

## État de TAGORA Flow

```text
N8N_ORCHESTRATION_NAME=TAGORA Flow
N8N_INTERMODULE_ORCHESTRATION_PLANNED=true
TAGORA_FLOW_ARCHITECTURE_PROGRESS=0%
TAGORA_FLOW_IMPLEMENTATION_PROGRESS=0%
N8N_IMPLEMENTATION_PROGRESS=0%
N8N_IS_IDENTITY_PROVIDER=false
N8N_IS_PRIMARY_BUSINESS_DATABASE=false
DIRECT_DATABASE_SHARING_BETWEEN_MODULES=false
```

## Procédure exacte de synchronisation demain au bureau

Dans le dépôt TAGORA Time :

```bat
cd C:\dev\tagora-time
git branch --show-current
git status -sb
git status --short -uall
git stash list
git fetch origin --prune
git rev-list --left-right --count main...origin/main
```

Si le working tree n’est pas propre :

```text
STOP
```

Ne pas faire `pull`, `reset`, `stash apply` ou nettoyage automatique.

Si la branche est `main`, le working tree est propre et les **trois stashes** sont intacts :

```bat
git pull --ff-only origin main
```

Puis vérifier :

```bat
git status -sb
git status --short -uall
git rev-parse HEAD
git rev-parse origin/main
git rev-list --left-right --count main...origin/main
git stash list
```

Exiger :

- `HEAD` = `origin/main`
- divergence `0/0`
- working tree propre
- aucun fichier non suivi
- trois stashes intacts
- présence des deux documents :

  - `docs/architecture/tagora-nexus-prompt-maitre-2026-08-09.md`
  - `docs/handoffs/tagora-nexus-home-to-office-handoff-2026-08-09.md`

## Contrôles à effectuer avant le prochain travail

1. Identité agent conforme au mandat (Time vs Nexus selon le GO).
2. Working tree propre ; stashes = 3 ; pas de WIP non volontaire.
3. Lire le prompt maître Nexus.
4. Confirmer : `IMPLEMENTATION_STARTED=false`, dépôt Nexus non créé.
5. Ne pas toucher DNS / production / Auth.
6. Enchaîner uniquement le prochain bloc de décisions Martin (7–14).

## Prochain bloc recommandé

```text
NEXT_BLOCK=TAGORA-NEXUS-MARTIN-ARCHITECTURE-DECISIONS-CLOSURE-GO-NOGO
```

Ce bloc devra uniquement permettre à Martin de valider ou modifier les décisions
d’architecture restantes **avant toute implémentation**.
