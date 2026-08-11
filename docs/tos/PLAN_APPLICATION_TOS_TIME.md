# TAGORA Time — Plan d'application progressive TOS

STATUT=LOT_1_COMPLETE

## Objectif

Structurer l'application progressive de TOS sur TAGORA Time **sans modifier le comportement fonctionnel**.

Ce plan enregistre la Phase 4D documentaire : Lot 1 clos ; Lot 2 documentaire terminé (5 scénarios) ; Lot 3 futur et non autorisé.

## Module

| Champ | Valeur |
|---|---|
| **Module** | TAGORA Time |
| **Gouvernant** | TAGORA Operating System (TOS) |
| **Cible** | Dépôt `Oliem54/tagora-time` (séparé) |
| **Statut document** | LOT_1_COMPLETE |

## Baseline

```text
MAIN_SHA=815ac4d49302ae597bbdcd4a15b76163063d4b56
DOCUMENTATION_BRANCH=docs/tos-phase-4d-time
COMMISSIONS_FEATURE=EXCLUDED_UNTOUCHED
FEATURE_BRANCH_EXCLUDED=feature/admin-commissions-premium-header-kpi
```

## Ordre d'application

1. TQF — fondation QA documentaire
2. TQF — scénarios QA (Lot 2 documentaire terminé ; exécution non effectuée)
3. TDS — revue UX/UI écrans P1 (lot futur)
4. TES — validation avant code (lot futur)
5. Revue humaine

## Lots

### LOT_1 — FOUNDATION_AND_QA_MATRICES

```text
LOT_1_SCOPE=FOUNDATION_AND_QA_MATRICES
LOT_1_FILE_COUNT=4
STATUS=COMPLETE
AUTHORIZED=YES_LOCAL_CREATE_ONLY
LOT_1_STATUS=COMPLETE
LOT_1_CONTENT_REVIEW=PASS
LOT_1_FORMAL_CLOSURE=AUTHORIZED_BY_MARTIN
LOT_1_INITIAL_CHECKPOINT_SHA=f2bce3e896f5f7bdb981c39bcd27afc76fb8c9c1
LOT_2_STATUS=COMPLETE
LOT_3_AUTHORIZED=NO
```

Contenu Lot 1 :

1. `docs/tos/APPLICATION_TOS_README.md`
2. `docs/tos/PLAN_APPLICATION_TOS_TIME.md`
3. `docs/qa/MATRICE_COMPTES_QA_TIME.md`
4. `docs/qa/MATRICE_DONNEES_QA_TIME.md`

### LOT_2 — QA_SCENARIOS

```text
LOT_2=QA_SCENARIOS
LOT_2_FILE_COUNT=5
STATUS=COMPLETE
LOT_2_STATUS=COMPLETE
```

`COMPLETE` = documentation Lot 2 terminée uniquement. Exécution QA des scénarios : non effectuée. Playwright : non autorisé.

### LOT_3 — TDS_AND_TES

```text
LOT_3=TDS_AND_TES
AUTHORIZED=NO
LOT_3_AUTHORIZED=NO
```

## Gates

| Gate | Règle |
|---|---|
| Création locale Lot 1 | Autorisée sous GO Martin (exécutée) |
| Inspection TOS | **PASS** — revue contenu Lot 1 |
| Commit / push Lot 1 | Autorisés pour clôture formelle sous GO Martin |
| Lot 2 documentaire | Terminé (5 scénarios) — exécution QA non autorisée ici |
| Lot 3 | Nécessite GO séparé — NON autorisé |
| Changement fonctionnel | Gate distinct — hors portée |
| Prérequis branche | Inclusible dans le gate parent si préconditions passées (VALD-088) |

## Hors portée

- code fonctionnel ;
- migration ;
- refonte UI ;
- CRUD ;
- Supabase ;
- déploiement ;
- outil de test automatisé réel ;
- staging / production ;
- secrets.

## Critères de sortie Lot 1

| # | Critère | ☐ |
|:---:|---|:---:|
| 1 | Exactement 4 fichiers Markdown | PASS |
| 2 | Aucun secret | PASS |
| 3 | Aucun PII réel inutile | PASS |
| 4 | Aucun code | PASS |
| 5 | Aucun fichier applicatif modifié | PASS |
| 6 | Revue humaine TOS avant clôture | PASS |

```text
LOT_1_EXIT_CRITERIA=PASS
LOT_1_FORMAL_STATUS=COMPLETE
```

## Références TOS

Source TOS : `Oliem54/tagora-operating-system`

- VALD-085 / VALD-086 / VALD-087 / VALD-088
- Plan : `docs/04_adoption_modules/plans_instanciation/PLAN_PHASE_4K_INSTANCIATION_DOCUMENTAIRE_CIBLEE.md`

## Statut

```text
STATUT=LOT_1_COMPLETE
LOT_1_EXECUTION=COMPLETE
LOT_1_STATUS=COMPLETE
LOT_1_CONTENT_REVIEW=PASS
LOT_1_FORMAL_CLOSURE=AUTHORIZED_BY_MARTIN
LOT_1_INITIAL_CHECKPOINT_SHA=f2bce3e896f5f7bdb981c39bcd27afc76fb8c9c1
LOT_2_STATUS=COMPLETE
LOT_3_AUTHORIZED=NO
```
