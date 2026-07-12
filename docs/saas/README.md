# TAGORA Time — Documentation SaaS 0

**Freeze d’architecture** — documentation uniquement.  
Référence Git : branche `feature/sales-book-grants`, HEAD `f383d32`.

Le système **n’est pas** multi-tenant aujourd’hui. Ces documents figent la cible.

## Index

| Fichier | Rôle |
|---------|------|
| [00-SAAS-ARCHITECTURE-FREEZE.md](./00-SAAS-ARCHITECTURE-FREEZE.md) | Vision, principes, hors scope, indicateurs V1 vs SaaS |
| [ADR-001-MULTI-TENANT-MODEL.md](./ADR-001-MULTI-TENANT-MODEL.md) | Shared DB + RLS retenu |
| [ADR-002-ORGANIZATION-AND-COMPANY-MODEL.md](./ADR-002-ORGANIZATION-AND-COMPANY-MODEL.md) | Tenant vs compagnies internes (Oliem/Titan) |
| [ADR-003-ROLES-AND-PLATFORM-ACCESS.md](./ADR-003-ROLES-AND-PLATFORM-ACCESS.md) | Rôles plateforme et org |
| [ADR-004-TENANT-DATA-BOUNDARY.md](./ADR-004-TENANT-DATA-BOUNDARY.md) | `organization_id`, RLS, service role |
| [ADR-005-MODULES-AND-ENTITLEMENTS.md](./ADR-005-MODULES-AND-ENTITLEMENTS.md) | Catalogue modules / Premium |
| [ADR-006-LEGACY-DATA-MIGRATION.md](./ADR-006-LEGACY-DATA-MIGRATION.md) | Backfill Groupe Oliem |
| [ADR-007-MIGRATION-STRATEGY.md](./ADR-007-MIGRATION-STRATEGY.md) | Migrations industrialisées |
| [SAAS-TABLE-INVENTORY.md](./SAAS-TABLE-INVENTORY.md) | Inventaire tables métier |
| [SAAS-HARDCODE-INVENTORY.md](./SAAS-HARDCODE-INVENTORY.md) | Inventaire hardcodes |
| [SAAS-ROADMAP-0-9.md](./SAAS-ROADMAP-0-9.md) | Phases 0–9 |
| [TENANT-SAFE-DEVELOPMENT-CHECKLIST.md](./TENANT-SAFE-DEVELOPMENT-CHECKLIST.md) | Checklist PR |

## Prochaine étape

Validation Martin de ce freeze → **SaaS 1 — Tenant Foundation** (voir roadmap).
