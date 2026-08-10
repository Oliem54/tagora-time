# TAGORA Time — Plan d'application progressive TOS

STATUT=LOCAL_DRAFT_PENDING_TOS_REVIEW

## Objectif

Structurer l'application progressive de TOS sur TAGORA Time **sans modifier le comportement fonctionnel**.

Ce plan est un brouillon local non validé. Aucun commit / push n'est autorisé dans le gate d'instanciation Lot 1.

## Module

| Champ | Valeur |
|---|---|
| **Module** | TAGORA Time |
| **Gouvernant** | TAGORA Operating System (TOS) |
| **Cible** | Dépôt `Oliem54/tagora-time` (séparé) |
| **Statut document** | LOCAL_DRAFT_PENDING_TOS_REVIEW |

## Baseline

```text
MAIN_SHA=815ac4d49302ae597bbdcd4a15b76163063d4b56
DOCUMENTATION_BRANCH=docs/tos-phase-4d-time
COMMISSIONS_FEATURE=EXCLUDED_UNTOUCHED
FEATURE_BRANCH_EXCLUDED=feature/admin-commissions-premium-header-kpi
```

## Ordre d'application

1. TQF — fondation QA documentaire
2. TQF — scénarios QA (lot futur)
3. TDS — revue UX/UI écrans P1 (lot futur)
4. TES — validation avant code (lot futur)
5. Revue humaine

## Lots

### LOT_1 — FOUNDATION_AND_QA_MATRICES

```text
LOT_1_SCOPE=FOUNDATION_AND_QA_MATRICES
LOT_1_FILE_COUNT=4
STATUS=INSTANTIATED_LOCAL_UNCOMMITTED
AUTHORIZED=YES_LOCAL_CREATE_ONLY
```

Contenu Lot 1 :

1. `docs/tos/APPLICATION_TOS_README.md`
2. `docs/tos/PLAN_APPLICATION_TOS_TIME.md`
3. `docs/qa/MATRICE_COMPTES_QA_TIME.md`
4. `docs/qa/MATRICE_DONNEES_QA_TIME.md`

### LOT_2 — QA_SCENARIOS

```text
LOT_2=QA_SCENARIOS
AUTHORIZED=NO
```

### LOT_3 — TDS_AND_TES

```text
LOT_3=TDS_AND_TES
AUTHORIZED=NO
```

## Gates

| Gate | Règle |
|---|---|
| Création locale Lot 1 | Autorisée sous GO Martin (ce gate) |
| Inspection TOS | **Obligatoire** avant tout commit |
| Commit / push | **Non autorisés** dans ce gate |
| Lots 2 / 3 | Nécessitent GO séparés |
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
| 1 | Exactement 4 fichiers Markdown | ☐ |
| 2 | Aucun secret | ☐ |
| 3 | Aucun PII réel inutile | ☐ |
| 4 | Aucun code | ☐ |
| 5 | Aucun fichier applicatif modifié | ☐ |
| 6 | Revue humaine TOS avant commit | ☐ |

## Références TOS

Source TOS : `Oliem54/tagora-operating-system`

- VALD-085 / VALD-086 / VALD-087 / VALD-088
- Plan : `docs/04_adoption_modules/plans_instanciation/PLAN_PHASE_4K_INSTANCIATION_DOCUMENTAIRE_CIBLEE.md`

## Statut

```text
STATUT=LOCAL_DRAFT_PENDING_TOS_REVIEW
LOT_1_EXECUTION=LOCAL_FILES_CREATED_UNCOMMITTED
LOT_2_AUTHORIZED=NO
LOT_3_AUTHORIZED=NO
```
