# QA-TIME-L2-004 — Feuille de temps soumise

```text
DOCUMENT_STATUS=DRAFT_TOS_CONTENT_REVIEW_PASS
EXECUTION_STATUS=NOT_EXECUTED
HUMAN_VALIDATION=NOT_YET_PERFORMED
REAL_ACCOUNT_REQUIRED_NOW=NO
REAL_DATA_REQUIRED_NOW=NO
PLAYWRIGHT_AUTHORIZED=NO
WORKFLOW_STATUS_NAMES=A_CONFIRMER
```

## Métadonnées

| Champ | Valeur |
|---|---|
| **ID scénario** | QA-TIME-L2-004 |
| **Module** | TAGORA Time |
| **Pilier TOS lié** | TQF |
| **Titre** | Feuille de temps soumise |
| **Priorité** | A_CONFIRMER |
| **Rôle logique** | employe |
| **Compte logique** | qa-time-employe@example.test |
| **Données QA** | QA-TIME-DATA-001 (Employé QA Alpha), QA-TIME-DATA-003 (Quart QA fictif) |
| **Statut document** | DRAFT_TOS_CONTENT_REVIEW_PASS |

## Objectif

Documenter le futur parcours où un employé QA soumet une **feuille / entrée horaire fictive**.

Aucune vraie soumission n'est effectuée dans ce gate. Aucune écriture DB.

## Préconditions (futures)

- Compte logique employé
- Entrée horaire / quart fictif (QA-TIME-DATA-003) disponible pour le scénario
- Noms de statuts de workflow confirmés avant exécution
- Aucune donnée production

## Étapes futures (documentaires)

| # | Action | Résultat attendu |
|:---:|---|---|
| 1 | Disposer d'une feuille / entrée horaire fictive consultable | Donnée QA uniquement |
| 2 | Consulter la feuille en tant qu'employé | Contenu fictif visible — écran exact A_CONFIRMER |
| 3 | Déclencher l'action de soumission | Demande de soumission initiée — libellé exact A_CONFIRMER |
| 4 | Observer le changement de statut | Nouveau statut workflow conforme à Time — WORKFLOW_STATUS_NAMES = A_CONFIRMER |
| 5 | Vérifier qu'aucune soumission réelle / production n'a lieu | Impact limité aux données QA |

## Résultats attendus

- Soumission fictive documentable lors d'une future exécution
- Changement de statut observable selon workflow réel confirmé
- Impossibilité d'interpréter ce gate comme une soumission réelle déjà réalisée
- Aucune DB / aucune vraie feuille production

## Critères d'acceptation (futurs)

- [ ] Feuille/entrée fictive disponible
- [ ] Consultation employé OK
- [ ] Action de soumission exécutable en QA
- [ ] Statut post-soumission conforme (noms confirmés)
- [ ] Aucune donnée réelle affectée
- [ ] Validation humaine effectuée

## Risques

- Inventer des noms de statut (`soumis`, `en_attente`, etc.) non confirmés pour « feuille de temps »
- Confondre soumission de correction / sortie horodateur et feuille de temps formelle
- Exécuter une vraie soumission hors QA

## Points à confirmer

| Sujet | Statut |
|---|---|
| WORKFLOW_STATUS_NAMES exacts | A_CONFIRMER |
| Écran / parcours UI exact | A_CONFIRMER |
| Lien exact avec événements horodateur (`en_attente`, validation direction) | A_CONFIRMER |
| Priorité | A_CONFIRMER |

## Note produit (lecture seule, non conclusive)

Des flux horodateur Time montrent des sorties pouvant être « soumises » à validation direction et des statuts d'événements tels que `en_attente` / `approuve`. L'équivalence exacte avec une « feuille de temps » formelle reste **A_CONFIRMER** et n'est pas affirmée ici.

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

- Matrice comptes / données Lot 1
- Dépendance future pour L2-005
- Source TOS : VALD-090 / VALD-091
