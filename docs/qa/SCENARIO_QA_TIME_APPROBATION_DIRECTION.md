# QA-TIME-L2-005 — Approbation direction

```text
DOCUMENT_STATUS=DRAFT_TOS_CONTENT_REVIEW_PASS
EXECUTION_STATUS=NOT_EXECUTED
HUMAN_VALIDATION=NOT_YET_PERFORMED
REAL_ACCOUNT_REQUIRED_NOW=NO
REAL_DATA_REQUIRED_NOW=NO
PLAYWRIGHT_AUTHORIZED=NO
SCENARIO_DEPENDENCY=QA-TIME-L2-004
EXACT_DIRECTION_PERMISSION=A_CONFIRMER
WORKFLOW_STATUS_NAMES=A_CONFIRMER
```

## Métadonnées

| Champ | Valeur |
|---|---|
| **ID scénario** | QA-TIME-L2-005 |
| **Module** | TAGORA Time |
| **Pilier TOS lié** | TQF |
| **Titre** | Approbation direction |
| **Priorité** | A_CONFIRMER |
| **Rôle logique** | direction |
| **Compte logique** | qa-time-direction@example.test |
| **Données QA** | QA-TIME-DATA-002 (Direction QA Alpha), QA-TIME-DATA-003 (Quart QA fictif) |
| **Dépendance** | QA-TIME-L2-004 (feuille fictive préalablement soumise) |
| **Statut document** | DRAFT_TOS_CONTENT_REVIEW_PASS |

## Objectif

Documenter le futur parcours où le rôle **direction** traite une feuille / entrée fictive préalablement soumise.

Ne pas utiliser `qa-superviseur`.
Ne pas remplacer `direction` par `admin`.

## Préconditions (futures)

- QA-TIME-L2-004 préparé / exécutable en amont (feuille fictive soumise)
- Compte logique direction
- Permissions direction confirmées pour l'action d'approbation
- Aucune donnée production

## Étapes futures (documentaires)

| # | Action | Résultat attendu |
|:---:|---|---|
| 1 | Se connecter / accéder en rôle direction (futur) | Accès espace direction — écran exact A_CONFIRMER |
| 2 | Localiser la feuille / entrée fictive soumise | Élément QA visible selon permissions |
| 3 | Exécuter l'action d'approbation autorisée | Action conforme à EXACT_DIRECTION_PERMISSION (A_CONFIRMER) |
| 4 | Observer l'évolution de statut | WORKFLOW_STATUS_NAMES conformes — A_CONFIRMER |
| 5 | Vérifier une traçabilité observable | Preuve d'approbation visible selon mécanisme Time — mécanisme exact A_CONFIRMER |
| 6 | Vérifier l'absence d'impact réel | Uniquement données QA |

## Résultats attendus

- Direction peut traiter une soumission fictive selon permissions réelles confirmées
- Statut évolue selon workflow réel confirmé
- Traçabilité observable sans inventer son mécanisme
- Aucune approbation réelle de données production dans ce gate

## Critères d'acceptation (futurs)

- [ ] Accès direction confirmé
- [ ] Visibilité de la soumission fictive
- [ ] Action d'approbation exécutable en QA
- [ ] Statut post-approbation conforme
- [ ] Traçabilité observable
- [ ] Aucune donnée réelle affectée
- [ ] Validation humaine effectuée

## Risques

- Utiliser un rôle non confirmé (`qa-superviseur`)
- Confondre permissions admin et direction
- Inventer un mécanisme d'audit / statut
- Approuver une vraie feuille production

## Points à confirmer

| Sujet | Statut |
|---|---|
| EXACT_DIRECTION_PERMISSION | A_CONFIRMER |
| WORKFLOW_STATUS_NAMES | A_CONFIRMER |
| Libellés UI direction | A_CONFIRMER |
| Mécanisme exact de traçabilité | A_CONFIRMER |
| Priorité | A_CONFIRMER |

## Note produit (lecture seule, non conclusive)

Des parcours direction Time incluent des actions d'approbation (ex. exceptions horodateur / validations). Le mapping exact vers « approbation de feuille de temps » du Lot 2 reste **A_CONFIRMER**.

## Garde-fous

```text
NO_REAL_PASSWORD=YES
NO_SECRET=YES
NO_TOKEN=YES
NO_ENV_READ=YES
NO_REAL_PII=YES
NO_REAL_GPS_COORDINATE=YES
NO_PRODUCTION_DATA=YES
NO_REAL_ACCOUNT_CREATION=YES
NO_SUPABASE_AUTH_WRITE=YES
NO_DATABASE_WRITE=YES
NO_DATABASE_RESET=YES
NO_PLAYWRIGHT=YES
NO_SPEC_TS=YES
NO_APPLICATION_CODE=YES
NO_DEPLOYMENT=YES
qa-superviseur=NOT_USED
ROLE_MUST_REMAIN=direction
```

## Validation humaine future

| Champ | Valeur |
|---|---|
| **Validation humaine** | NOT_YET_PERFORMED |
| **Statut** | DRAFT_TOS_CONTENT_REVIEW_PASS |

## Références

- Dépendance : `docs/qa/SCENARIO_QA_TIME_FEUILLE_TEMPS_SOUMISE.md` (QA-TIME-L2-004)
- Matrice comptes Lot 1 : `docs/qa/MATRICE_COMPTES_QA_TIME.md`
- Source TOS : VALD-090 / VALD-091
