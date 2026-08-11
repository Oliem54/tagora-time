# QA-TIME-L2-003 — GPS refusé ou absent

```text
DOCUMENT_STATUS=DRAFT_TOS_CONTENT_REVIEW_PASS
EXECUTION_STATUS=NOT_EXECUTED
HUMAN_VALIDATION=NOT_YET_PERFORMED
REAL_ACCOUNT_REQUIRED_NOW=NO
REAL_DATA_REQUIRED_NOW=NO
PLAYWRIGHT_AUTHORIZED=NO
DO_NOT_ASSUME_BLOCK_OR_FALLBACK=YES
NO_SILENT_SUCCESS_EXPECTATION=YES
EXPECTED_POLICY=A_CONFIRMER
```

## Métadonnées

| Champ | Valeur |
|---|---|
| **ID scénario** | QA-TIME-L2-003 |
| **Module** | TAGORA Time |
| **Pilier TOS lié** | TQF |
| **Titre** | GPS refusé ou absent |
| **Priorité** | A_CONFIRMER |
| **Rôle logique** | employe |
| **Compte logique** | qa-time-employe@example.test |
| **Données QA** | QA-TIME-DATA-001, QA-TIME-DATA-003, QA-TIME-DATA-004 |
| **Statut document** | DRAFT_TOS_CONTENT_REVIEW_PASS |

## Objectif

Documenter les futurs cas où le GPS n'est **pas** disponible pour le punch, sans présumer du comportement métier exact.

## Cas futurs minimaux

### CASE_A — GPS_PERMISSION_DENIED

```text
CASE_A=GPS_PERMISSION_DENIED
CLIENT_CODE_OBSERVED=permission_denied
```

Permission de localisation refusée par l'utilisateur / le navigateur.

### CASE_B — GPS_UNAVAILABLE

```text
CASE_B=GPS_UNAVAILABLE
CLIENT_CODES_OBSERVED=position_unavailable | timeout | unsupported | insecure_context
```

Position indisponible ou non obtenue dans le délai / contexte.

## Règles d'écriture (obligatoires)

```text
EXPECTED_POLICY=A_CONFIRMER
DO_NOT_ASSUME_BLOCK_OR_FALLBACK=YES
NO_SILENT_SUCCESS_EXPECTATION=YES
```

Ne PAS supposer automatiquement que Time doit :

- bloquer le punch ;
- autoriser le punch ;
- appliquer un fallback.

## Préconditions (futures)

- Compte logique employé
- Capacité à simuler refus / indisponibilité GPS dans l'environnement de test
- Politique Time confirmée avant exécution réelle

## Étapes futures (documentaires)

| # | Action | Résultat attendu |
|:---:|---|---|
| 1 | Préparer CASE_A (permission refusée) | État GPS client = permission_denied |
| 2 | Tenter un punch Entrée/Sortie | Comportement conforme à la politique Time confirmée — A_CONFIRMER |
| 3 | Observer message / blocage / autre résultat | Observabilité claire ; pas de succès silencieux inventé |
| 4 | Préparer CASE_B (GPS indisponible) | État GPS client = unavailable / timeout / équivalent |
| 5 | Tenter un punch | Comportement conforme à la politique Time confirmée — A_CONFIRMER |
| 6 | Vérifier qu'aucun faux GPS n'est inventé | Aucune coordonnée factice présentée comme réelle |

## Résultats attendus

- Comportement conforme à la politique Time confirmée
- Aucun faux GPS inventé
- Comportement observable / documentable
- Aucune donnée réelle affectée
- Aucune attente de succès silencieux

## Critères d'acceptation (futurs)

- [ ] CASE_A exécuté selon politique confirmée
- [ ] CASE_B exécuté selon politique confirmée
- [ ] Résultats documentés sans invention
- [ ] Aucune coordonnée réelle
- [ ] Validation humaine effectuée

## Risques

- Inventer un blocage ou un fallback non confirmé
- Documenter un succès alors que le GPS a échoué
- Copier une vraie position pour « débloquer » un test

## Points à confirmer

| Sujet | Statut |
|---|---|
| Politique exacte si GPS refusé | A_CONFIRMER |
| Politique exacte si GPS absent / timeout | A_CONFIRMER |
| Interaction avec codes serveur (`GPS_REQUIRED`, etc.) | A_CONFIRMER |
| Priorité | A_CONFIRMER |

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
```

## Validation humaine future

| Champ | Valeur |
|---|---|
| **Validation humaine** | NOT_YET_PERFORMED |
| **Statut** | DRAFT_TOS_CONTENT_REVIEW_PASS |

## Références

- Matrice données Lot 1 : `docs/qa/MATRICE_DONNEES_QA_TIME.md`
- Source TOS : VALD-090 / VALD-091
