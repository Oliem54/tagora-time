# QA-TIME-L2-001 — Punch in / punch out employé

```text
DOCUMENT_STATUS=DRAFT_TOS_CONTENT_REVIEW_PASS
EXECUTION_STATUS=NOT_EXECUTED
HUMAN_VALIDATION=NOT_YET_PERFORMED
REAL_ACCOUNT_REQUIRED_NOW=NO
REAL_DATA_REQUIRED_NOW=NO
PLAYWRIGHT_AUTHORIZED=NO
```

## Métadonnées

| Champ | Valeur |
|---|---|
| **ID scénario** | QA-TIME-L2-001 |
| **Module** | TAGORA Time |
| **Pilier TOS lié** | TQF |
| **Titre** | Punch in / punch out employé |
| **Priorité** | CRITICAL |
| **Rôle logique** | employe |
| **Compte logique** | qa-time-employe@example.test |
| **Données QA** | QA-TIME-DATA-001 (Employé QA Alpha), QA-TIME-DATA-003 (Quart QA fictif) |
| **Statut document** | DRAFT_TOS_CONTENT_REVIEW_PASS |

## Objectif

Documenter le futur test du cycle complet de pointage employé :

`punch in` → état pointé/actif → `punch out` → état clôturé

Sans exécuter ce cycle dans ce gate.

## Préconditions (futures)

- Environnement QA Time disponible — A_CONFIRMER
- Compte logique employé prêt (création réelle NON autorisée dans ce lot)
- Données fictives QA-TIME-DATA-001 / QA-TIME-DATA-003 préparées
- Aucun punch ouvert au début — A_CONFIRMER selon règles horodateur
- Aucune donnée production utilisée

## Étapes futures (documentaires)

| # | Action | Résultat attendu |
|:---:|---|---|
| 1 | Accéder au parcours horodateur employé | Accès au pointage disponible — libellés exacts d'écran A_CONFIRMER |
| 2 | Se connecter avec le compte logique employé (futur) | Session employé établie — aucun mot de passe documenté |
| 3 | Effectuer un punch in (action UI confirmée côté produit : « Entree maintenant » / `punch_in`) | Punch d'entrée enregistré ; état opérationnel observable |
| 4 | Constater le changement d'état après punch in | Indicateur d'état pointé/actif ou équivalent — détail exact A_CONFIRMER |
| 5 | Effectuer un punch out (action UI confirmée : « Sortie » / `punch_out`) | Punch de sortie enregistré |
| 6 | Constater la clôture cohérente | État clôturé / plus de quart ouvert opérationnel selon politique Time — A_CONFIRMER |
| 7 | Vérifier l'absence d'impact sur données réelles | Uniquement données QA fictives affectées |

## Résultats attendus

- Cycle punch in → punch out complétable sans erreur bloquante (lors d'une future exécution)
- Changement d'état observable après punch in et après punch out
- Aucun impact sur données réelles / production
- Aucune exécution réelle dans ce gate

## Critères d'acceptation (futurs)

- [ ] Accès parcours pointage confirmé
- [ ] Punch in enregistré
- [ ] État après punch in cohérent
- [ ] Punch out enregistré
- [ ] État après punch out cohérent
- [ ] Aucune donnée réelle affectée
- [ ] Validation humaine TOS / Time effectuée

## Risques

- Régression du parcours de pointage cœur métier
- État UI incohérent entre punch in et punch out
- Confusion entre libellés UI et codes événement (`punch_in` / `punch_out`)
- Tentative d'utiliser un vrai compte ou une vraie donnée

## Points à confirmer

| Sujet | Statut |
|---|---|
| Libellés d'écran / navigation exacts | A_CONFIRMER |
| Indicateurs d'état exacts après punch in/out | A_CONFIRMER |
| Environnement QA cible | A_CONFIRMER |
| Procédure de reset QA | NON_DEFINI_DANS_CE_LOT |

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
```

## Validation humaine future

| Champ | Valeur |
|---|---|
| **Validation humaine** | NOT_YET_PERFORMED |
| **Validé par** | À confirmer |
| **Date** | À confirmer |
| **Statut** | DRAFT_TOS_CONTENT_REVIEW_PASS |

## Références

- Matrice comptes Lot 1 : `docs/qa/MATRICE_COMPTES_QA_TIME.md`
- Matrice données Lot 1 : `docs/qa/MATRICE_DONNEES_QA_TIME.md`
- Source TOS préparation : `Oliem54/tagora-operating-system` — PREPARATION_PHASE_4D_LOT2_QA_SCENARIOS_TIME.md (VALD-090 / VALD-091)
