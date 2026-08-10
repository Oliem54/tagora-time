# TAGORA Time — Matrice des données QA

STATUT=LOCAL_DRAFT_PENDING_TOS_REVIEW

## Objectif

Documenter uniquement les **jeux de données fictifs** qui pourront servir aux futurs scénarios QA.

Aucune donnée réelle. Aucune coordonnée GPS réelle. Aucune copie production.

## En-tête

| Champ | Valeur |
|---|---|
| **Module** | TAGORA Time |
| **Date** | 2026-08-10 |
| **Statut document** | LOCAL_DRAFT_PENDING_TOS_REVIEW |

## Matrice

| Scénario lié | Type de donnée | Valeur fictive / anonymisée | Usage | Obligatoire | Sensible | Règle de protection | Statut | Notes |
|---|---|---|---|:---:|:---:|---|---|---|
| Scénario futur — Lot 2 non autorisé | Employé fictif | Employé QA Alpha | Punch / horodateur | Non défini dans ce lot | NON | Donnée entièrement fictive | PLANNED | QA-TIME-DATA-001 |
| Scénario futur — Lot 2 non autorisé | Compte direction fictif | Direction QA Alpha | Validation / supervision future | Non défini dans ce lot | NON | Donnée entièrement fictive | PLANNED | QA-TIME-DATA-002 |
| Scénario futur — Lot 2 non autorisé | Entrée horaire fictive | Quart QA fictif | Feuille de temps | Non défini dans ce lot | NON | Donnée synthétique | PLANNED | QA-TIME-DATA-003 |
| Scénario futur — Lot 2 non autorisé | Coordonnée GPS fictive | Coordonnée de test non associée à une personne réelle | Scénario GPS futur | Non défini dans ce lot | NON | Donnée synthétique | PLANNED | QA-TIME-DATA-004 — valeur précise non définie dans ce lot |

### Détail

#### QA-TIME-DATA-001

```text
TYPE=Employé fictif
VALEUR=Employé QA Alpha
USAGE=Punch / horodateur
SENSIBLE=NON
PROTECTION=Donnée entièrement fictive
STATUT=PLANNED
```

#### QA-TIME-DATA-002

```text
TYPE=Compte direction fictif
VALEUR=Direction QA Alpha
USAGE=Parcours direction futur
SENSIBLE=NON
PROTECTION=Donnée entièrement fictive
STATUT=PLANNED
```

#### QA-TIME-DATA-003

```text
TYPE=Entrée horaire fictive
VALEUR=Quart QA fictif
USAGE=Feuille de temps
SENSIBLE=NON
PROTECTION=Donnée synthétique
STATUT=PLANNED
```

#### QA-TIME-DATA-004

```text
TYPE=Coordonnée GPS fictive
VALEUR=Coordonnée de test non associée à une personne réelle
USAGE=Scénario GPS futur
SENSIBLE=NON
PROTECTION=Donnée synthétique
STATUT=PLANNED
```

La coordonnée GPS réelle n'est **pas** requise dans ce lot. La valeur précise pourra être définie dans le gate du scénario QA GPS (Lot 2, non autorisé).

## Règles

1. Interdiction de documenter des données sensibles réelles.
2. Interdiction de copier une adresse client réelle.
3. Les scénarios détaillés restent hors Lot 1.

## Références TOS

Source TOS : `Oliem54/tagora-operating-system`

- Template : `docs/04_adoption_modules/templates_pilotes/TEMPLATE_PILOTE_MATRICE_DONNEES_QA.md`
- VALD-087 / VALD-088

## Statut

```text
STATUT=LOCAL_DRAFT_PENDING_TOS_REVIEW
LOT_2_AUTHORIZED=NO
```
