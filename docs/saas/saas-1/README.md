# SaaS 1 — Tenant Foundation (design freeze 1A)

**Statut :** conception technique — **NON IMPLÉMENTÉ** ; décisions Martin **confirmées** (`SAAS-1-OPEN-DECISIONS.md`)  
**Date :** 2026-07-12  
**Branche :** `feature/sales-book-grants`  
**HEAD design :** `660ac5c`  
**Parent :** [SaaS 0 Architecture Freeze](../00-SAAS-ARCHITECTURE-FREEZE.md)

TAGORA Time **n’est pas** multi-tenant. Cette passe documente la fondation avant toute migration.

## Index

| Document | Contenu |
|----------|---------|
| [SAAS-1-TENANT-FOUNDATION-DESIGN.md](./SAAS-1-TENANT-FOUNDATION-DESIGN.md) | Vue d’ensemble SaaS 1 |
| [SAAS-1-DATABASE-SCHEMA-PROPOSAL.md](./SAAS-1-DATABASE-SCHEMA-PROPOSAL.md) | Schéma tables fondation |
| [SAAS-1-AUTH-AND-ACTIVE-ORGANIZATION-CONTEXT.md](./SAAS-1-AUTH-AND-ACTIVE-ORGANIZATION-CONTEXT.md) | Auth actuelle + contexte org actif |
| [SAAS-1-ROLE-MAPPING.md](./SAAS-1-ROLE-MAPPING.md) | Mapping rôles EXISTANT → PROPOSÉ |
| [SAAS-1-LEGACY-BACKFILL-PLAN.md](./SAAS-1-LEGACY-BACKFILL-PLAN.md) | Backfill Groupe Oliem |
| [SAAS-1-SERVICE-ROLE-INVENTORY.md](./SAAS-1-SERVICE-ROLE-INVENTORY.md) | Inventaire service role |
| [SAAS-1-MIGRATION-SEQUENCE.md](./SAAS-1-MIGRATION-SEQUENCE.md) | Séquence migrations 1B (noms seulement) |
| [SAAS-1-TEST-PLAN.md](./SAAS-1-TEST-PLAN.md) | Plan de tests |
| [SAAS-1-OPEN-DECISIONS.md](./SAAS-1-OPEN-DECISIONS.md) | Décisions Martin |

## Découpage d’implémentation (futur)

| Sous-phase | Contenu | Statut |
|------------|---------|--------|
| **1A** | Design freeze (ce dossier) | **EN COURS (docs)** |
| **1B** | Migrations fondation uniquement (pas de tables métier) | NON IMPLÉMENTÉ |
| **1C+** | Core métier `organization_id` nullable + backfill | NON IMPLÉMENTÉ — après validation 1B |

## Compatibilité SaaS 0

Ce design respecte ADR-001 à ADR-007 : shared DB + RLS, tenant ≠ compagnie, `platform_super_admin` séparé, Premium commissions/rémunération, pas de Stripe ici.
