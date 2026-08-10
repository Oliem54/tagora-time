# TAGORA Time — Application TAGORA Operating System

STATUT=LOCAL_DRAFT_PENDING_TOS_REVIEW

## Objectif

TAGORA Time est le **module pilote** pour l'application progressive, documentée et contrôlée des standards TAGORA Operating System (TOS).

Ce document est un brouillon local non validé. Il n'autorise aucun commit, push, code, migration ni déploiement.

## Identité du module

| Champ | Valeur |
|---|---|
| **Nom** | TAGORA Time |
| **Rôle haut niveau** | Application de gestion du temps, des livraisons, du terrain et de l'horodateur |
| **Nature** | Module métier indépendant — dépôt séparé |
| **Rôle dans TOS** | Pilote d'adoption progressive (cible), jamais projet gouvernant |

## Objectif TOS

Appliquer progressivement les piliers :

**TQF → TDS → TES**

selon des lots documentés, sous gouvernance TOS et GO Martin.

## Gouvernance

| Champ | Valeur |
|---|---|
| **ACTIVE_PROJECT** | TAGORA_OPERATING_SYSTEM |
| **GOVERNING_PROJECT** | TAGORA_OPERATING_SYSTEM |
| **PILOT_TARGET** | TAGORA_TIME |
| **Règle** | TOS gouverne ; les modules appliquent |
| **Modèle d'action** | TOS_GOVERNED_BOUNDED_EXTERNAL_ACTION |
| **Retour TOS** | MANDATORY après toute action cible |

## Périmètre autorisé (documentaire)

- documentation QA ;
- matrices comptes / données QA ;
- scénarios QA futurs sous GO séparé ;
- checklist TDS future sous GO séparé ;
- validation TES future sous GO séparé.

## Hors portée

- code fonctionnel ;
- migrations ;
- base de données ;
- Supabase ;
- refonte UI ;
- déploiement ;
- staging / production ;
- secrets / `.env`.

## Baseline gouvernée

```text
SOURCE_BRANCH=main
BASELINE_SHA=815ac4d49302ae597bbdcd4a15b76163063d4b56
DOCUMENTATION_BRANCH=docs/tos-phase-4d-time
COMMISSIONS_FEATURE=EXCLUDED_UNTOUCHED
```

## État actuel

```text
PHASE_4D=IN_PROGRESS
LOT_1=INSTANTIATED_LOCAL_UNCOMMITTED
LOT_2=NOT_AUTHORIZED
LOT_3=NOT_AUTHORIZED
STATUT=LOCAL_DRAFT_PENDING_TOS_REVIEW
```

## Références TOS

Source TOS : `Oliem54/tagora-operating-system`

- VALD-085 — nom de branche documentaire
- VALD-086 — validation état branche locale
- VALD-087 — périmètre Lot 1
- VALD-088 — recadrage gouvernance (TOS gouvernant ; actions cibles bornées)
- Plan : `docs/04_adoption_modules/plans_instanciation/PLAN_PHASE_4K_INSTANCIATION_DOCUMENTAIRE_CIBLEE.md`

## Sécurité

- Aucun secret.
- Aucun mot de passe.
- Aucune donnée production copiée.
- Aucun credential réel.

## Notes

- Toute information non confirmée dans ce lot : **À confirmer** ou **Non défini dans ce lot**.
- Ne pas présenter ce document comme final ou validé tant que la revue TOS n'est pas faite.
