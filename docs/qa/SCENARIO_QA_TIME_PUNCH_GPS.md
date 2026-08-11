# QA-TIME-L2-002 — Punch avec GPS

```text
DOCUMENT_STATUS=DRAFT_TOS_CONTENT_REVIEW_PASS
EXECUTION_STATUS=NOT_EXECUTED
HUMAN_VALIDATION=NOT_YET_PERFORMED
REAL_ACCOUNT_REQUIRED_NOW=NO
REAL_DATA_REQUIRED_NOW=NO
PLAYWRIGHT_AUTHORIZED=NO
GPS_TEST_FIXTURE=QA-GPS-SYNTH-001
GPS_NUMERIC_COORDINATE_STORED_IN_DOCUMENT=NO
```

## Métadonnées

| Champ | Valeur |
|---|---|
| **ID scénario** | QA-TIME-L2-002 |
| **Module** | TAGORA Time |
| **Pilier TOS lié** | TQF |
| **Titre** | Punch avec GPS |
| **Priorité** | A_CONFIRMER |
| **Rôle logique** | employe |
| **Compte logique** | qa-time-employe@example.test |
| **Données QA** | QA-TIME-DATA-001, QA-TIME-DATA-003, QA-TIME-DATA-004 |
| **Statut document** | DRAFT_TOS_CONTENT_REVIEW_PASS |

## Objectif

Documenter le futur parcours de punch lorsqu'une information GPS de **test synthétique** est disponible.

Aucune coordonnée géographique réelle n'est documentée ni requise dans ce lot.

## Fixture GPS

```text
GPS_TEST_FIXTURE=QA-GPS-SYNTH-001
GPS_NUMERIC_COORDINATE_STORED_IN_DOCUMENT=NO
VALEUR_PRECISE=NON_DEFINI_DANS_CE_LOT
```

Référence Lot 1 : QA-TIME-DATA-004 = « Coordonnée de test non associée à une personne réelle ».

## Préconditions (futures)

- Compte logique employé
- Localisation / permission navigateur disponible pour le test
- Fixture GPS synthétique définie lors de l'exécution future
- Politique GPS Time appliquée — EXACT_GPS_POLICY = A_CONFIRMER pour les détails de zone / configuration

## Étapes futures (documentaires)

| # | Action | Résultat attendu |
|:---:|---|---|
| 1 | Accéder à l'horodateur employé | Parcours punch disponible |
| 2 | Vérifier que la localisation est disponible (outil UI confirmé : « Tester ma localisation ») | Préflight GPS OK — sans stocker de coordonnée réelle dans ce document |
| 3 | Tenter un punch (Entrée/Sortie) avec GPS disponible | Position prise en compte selon politique Time |
| 4 | Observer le résultat | Punch accepté ou message métier conforme à la politique — A_CONFIRMER pour cas limites (ex. hors zone) |
| 5 | Contrôler l'absence de coordonnée personnelle/réelle dans la doc QA | Aucune lat/long réelle dans ce scénario |

## Résultats attendus

- Comportement conforme à la politique GPS Time confirmée lors de l'exécution future
- Aucune coordonnée personnelle/réelle documentée
- Aucun faux succès silencieux inventé ici
- Aucune donnée production affectée

## Critères d'acceptation (futurs)

- [ ] Permission/localisation disponible pour le cas de test
- [ ] Punch tenté avec GPS disponible
- [ ] Résultat observable conforme à la politique Time
- [ ] Aucune coordonnée réelle dans artefacts QA
- [ ] Validation humaine effectuée

## Risques

- Inventer une politique GPS (zone, blocage) non confirmée
- Copier une vraie coordonnée
- Confondre succès GPS navigateur et acceptation métier serveur

## Points à confirmer

| Sujet | Statut |
|---|---|
| EXACT_GPS_POLICY (zones, GPS_OUT_OF_ZONE, GPS_NOT_CONFIGURED) | A_CONFIRMER |
| Priorité du scénario | A_CONFIRMER |
| Valeur précise de fixture d'exécution | NON_DEFINI_DANS_CE_LOT |

## Faits produit déjà observés (lecture seule)

- La géolocalisation est requise pour Entrée et Sortie (horodateur employé).
- Codes d'échec client connus : `permission_denied`, `position_unavailable`, `timeout`, etc.
- Codes serveur observés : `GPS_REQUIRED`, `GPS_OUT_OF_ZONE`, `GPS_NOT_CONFIGURED` — application exacte A_CONFIRMER selon contexte.

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
