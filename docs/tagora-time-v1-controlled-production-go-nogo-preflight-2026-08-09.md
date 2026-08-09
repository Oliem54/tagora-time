# TAGORA Time — V1 — Prévol contrôlé de production GO/NO-GO

## Identification

- Projet : TAGORA Time uniquement
- Date : 2026-08-09
- Agent donneur : Martin
- Agent exécutant : Agent Cursor TAGORA Time uniquement
- Branche : main
- Commit de départ : 56e9260f9725939600743b9d263a159fb44a383f
- Production : non touchée

## État officiel V1

```text
V1_GLOBAL_CLOSURE_STATUS=CLOSED
V1_FUNCTIONAL_PROGRESS=100%
FUNCTIONAL_DEVELOPMENT=100%
TECHNICAL_STABILIZATION=100%
REAL_V1_BLOCKER_COUNT=0
```

## Confirmation documentaire de la cible

| Élément | Preuve locale | État |
|---|---|---|
| Organisation / projet Supabase prod | `TAGORA Time - Production DB` (docs procédures) | Documenté |
| Ref production | `qcgvzdlfsxybrmloijpt` (`next.config.ts` + docs) | Documenté |
| Ref staging (à exclure) | `qokyobcvplzufshydhih` | Documenté |
| Application | TAGORA Time (repo `tagora-time`) | Documenté |
| Branche déploiement | `main` @ SHA du futur GO | Documenté |
| Hébergeur | Vercel Production | Documenté |
| Domaine production canonique | Non fixé en clair dans le dépôt (`NEXT_PUBLIC_APP_URL`) | **Manquant** |
| Confirmation humaine Martin | Absente dans ce prévol | **Manquante** |

`PRODUCTION_TARGET_STATUS=PARTIAL`

## Matrice du prévol

| Contrôle | État | Preuves | Éléments manquants | Risque | Action future | GO Martin |
|---|---|---|---|---|---|---|
| Cible production | PARTIAL | Refs prod/staging + projet documentés | Domaine canonique; confirmation humaine Martin | Mauvaise cible | Checklist cible + GO Martin | Oui |
| H4B | READY | H4B1/B2/B3 fichiers + ordre documentés; staging proven_applied | Inventaire production réel | Apply aveugle | Inventaire READ-ONLY prod | Oui |
| Migrations | READY | Ordre H4B1→B2→B3→seed documenté; anti-`db push` global si dérive | Décision apply selon inventaire | Dérive historique | Apply ciblé uniquement | Oui |
| Seed tenant/company | READY | Staging x1 + postcheck; besoin prod conditionnel documenté | État réel production inconnu | Doublon / omission | Inventaire puis seed si absent | Oui |
| Seed memberships | READY | Script dry-run/`--write`+owner documenté | Exécution non faite | Accès rôles incomplets | Dry-run puis write séparé | Oui |
| Backup | HOLD | Procédure BACKUP_OK/FAILED + SHA256 documentée; `npx` disponible | `pg_dump`/`supabase` CLI absents du PATH; aucun backup réel validé | Pas de filet restore | Exécuter backup hors dépôt + valider | Oui |
| Rollback applicatif | READY | Plan redeploy SHA / Vercel documenté | Exécution non testée | Régression persistante | Appliquer si déclencheur | Oui |
| Rollback DB | READY | Restore depuis backup `BACKUP_OK` documenté; reverse migration non promis | Backup réel absent | Perte données post-backup | Restore seulement si backup OK | Oui |
| Smoke tests | READY | Checklist 11 points documentée | Non exécutés (attendu post-deploy) | Régression non détectée | Exécuter après deploy | Oui |
| GO production | PENDING_SEPARATE_GO | Aucun GO implicite | Autorisation Martin | Action non autorisée | Attendre GO distinct | Oui |

## Détail des statuts

### H4B / migrations / seeds

- Portée H4B1/B2/B3 et ordre futurs documentés.
- Seed tenant/company staging exécuté **une** fois; ne pas réexécuter automatiquement.
- Seed memberships = action séparée.
- Ne pas inventer l’état production.

```text
H4B_PREFLIGHT_STATUS=READY
TENANT_COMPANY_SEED_STATUS=READY
MEMBERSHIP_SEED_STATUS=READY
```

### Capacité backup

- Procédure documentée (cible, format, nommage, SHA256, BACKUP_OK/FAILED, arrêt obligatoire).
- Outils locaux : `npx` présent; `pg_dump` / `supabase` CLI absents du PATH.
- Alternative documentée : export Dashboard Supabase production.
- Aucun backup réel exécuté → statut backup ne peut pas être PASS.

```text
BACKUP_TOOL_READINESS_STATUS=PARTIAL
PRODUCTION_BACKUP_STATUS=HOLD
```

### Capacité rollback

```text
APPLICATION_ROLLBACK_STATUS=READY
DATABASE_ROLLBACK_STATUS=READY
ROLLBACK_DECISION_STATUS=READY
```

Décisionnaire : Martin. Migrations forward-only non garanties réversibles.

### Smoke tests

Checklist minimale présente (health, login, auth, rôles, tenant/company,
horodateur, employés, opérations, erreurs critiques, logs sans secret,
critères rollback).

```text
POST_DEPLOY_SMOKE_TEST_STATUS=READY
```

## Preuves restantes

1. Confirmation humaine Martin de la cible (projet, ref, environnement, domaine).
2. Domaine production canonique consigné sans secret.
3. Inventaire H4B production.
4. État seed Oliem production.
5. Backup production réel + `BACKUP_OK` + SHA256.
6. Acceptation formelle du plan rollback par Martin (si pas encore explicite).

`REMAINING_EVIDENCE_COUNT=6`

## Séquence future contrôlée

1. Prévol Git.
2. Confirmation humaine de la cible.
3. Confirmation non secrète de l’environnement.
4. Backup production réel et validation.
5. Décision migrations et seeds.
6. Confirmation du rollback.
7. Nouveau GO Martin.
8. Exécution contrôlée.
9. Smoke tests.
10. Décision GO final ou rollback.
11. Rapport et checkpoint.

## Limites

Confirmé pour ce bloc :

- aucune commande Supabase;
- aucune requête SQL;
- aucun seed lu ou exécuté;
- aucune migration;
- aucun backup exécuté;
- aucun rollback exécuté;
- aucun déploiement;
- aucun changement Vercel ou DNS;
- aucun secret lu ou affiché;
- aucune production modifiée;
- trois stashes intacts.

## Verdict

```text
PREFLIGHT_DECISION=HOLD
PRODUCTION_RELEASE_STATUS=CONDITIONAL_GO_PENDING_PRODUCTION_GATE
PRODUCTION_EXECUTION_AUTHORIZED=false
SEPARATE_MARTIN_GO_REQUIRED=true
REMAINING_EVIDENCE_COUNT=6
```

Raison principale du HOLD : cible production encore PARTIAL (domaine + confirmation
humaine) et backup production non exécuté/validé (`HOLD`). Les procédures H4B,
seeds, rollback et smoke tests sont READY, mais insuffisantes seules pour un
READY d’exécution.

## Prochaine étape

```text
NEXT_TAGORA_TIME_BLOCK=TAGORA-TIME-V1-CONTROLLED-PREFLIGHT-EVIDENCE-CLOSURE-2026-08-09
```

Un nouveau GO Martin est obligatoire. Aucune production n’est autorisée.
