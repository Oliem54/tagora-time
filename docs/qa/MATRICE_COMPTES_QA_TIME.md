# TAGORA Time — Matrice des comptes QA

STATUT=LOCAL_DRAFT_PENDING_TOS_REVIEW

## Objectif

Documenter les **comptes QA logiques** nécessaires aux futures validations TQF.

Aucun compte réel. Aucun mot de passe. Aucune adresse personnelle. Aucun secret.

## En-tête

| Champ | Valeur |
|---|---|
| **Module** | TAGORA Time |
| **Environnement** | local / QA documentaire — jamais production avec secrets |
| **Propriétaire matrice** | À confirmer |
| **Date** | 2026-08-10 |
| **Statut document** | LOCAL_DRAFT_PENDING_TOS_REVIEW |

## Rôles applicatifs confirmés

Source Time : `src/app/lib/auth/roles.ts`

| Rôle | Constante |
|---|---|
| employe | `employe` |
| direction | `direction` |
| admin | `admin` |

## Matrice

| Rôle | Type de compte | Identifiant logique | Usage prévu | Permissions attendues | Données associées | Statut | Notes |
|---|---|---|---|---|---|---|---|
| employe | qa-employe | qa-time-employe@example.test | Punch / horodateur / feuille de temps selon scénario futur | À confirmer par scénario QA | QA-TIME-DATA-001 | PLANNED | Identifiant fictif `example.test` uniquement |
| direction | qa-direction | qa-time-direction@example.test | Validation / supervision selon scénario futur | À confirmer par scénario QA | QA-TIME-DATA-002 | PLANNED | Identifiant fictif `example.test` uniquement |
| admin | qa-admin | qa-time-admin@example.test | Administration QA selon permissions applicatives confirmées | À confirmer par scénario QA | Non défini dans ce lot | PLANNED | Identifiant fictif `example.test` uniquement |

### Détail logique

#### employe

```text
TYPE=qa-employe
IDENTIFIANT_LOGIQUE=qa-time-employe@example.test
USAGE=Punch / horodateur / feuille de temps selon scénario futur
STATUT=PLANNED
```

#### direction

```text
TYPE=qa-direction
IDENTIFIANT_LOGIQUE=qa-time-direction@example.test
USAGE=Validation / supervision selon scénario futur
STATUT=PLANNED
```

#### admin

```text
TYPE=qa-admin
IDENTIFIANT_LOGIQUE=qa-time-admin@example.test
USAGE=Administration QA selon permissions applicatives confirmées
STATUT=PLANNED
```

## Interdictions

| Interdit | Raison |
|---|---|
| Vrai mot de passe | Interdit dans le dépôt |
| Secret / token / credential | Interdit |
| Création réelle de compte | Non autorisée dans ce lot |
| Vérification Supabase Auth | Non autorisée dans ce lot |
| Donnée client réelle inutile | PII non requise pour QA documentaire |

Les adresses `@example.test` sont **fictives et documentaires uniquement**.

## Références TOS

Source TOS : `Oliem54/tagora-operating-system`

- Template : `docs/04_adoption_modules/templates_pilotes/TEMPLATE_PILOTE_MATRICE_COMPTES_QA.md`
- VALD-087 / VALD-088

## Statut

```text
STATUT=LOCAL_DRAFT_PENDING_TOS_REVIEW
LOT_2_AUTHORIZED=NO
```
