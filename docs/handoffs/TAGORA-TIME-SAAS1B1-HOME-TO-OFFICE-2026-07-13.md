# Handoff maison â†’ bureau â€” SaaS 1B.1 Tenant Foundation

**Date :** 2026-07-13
**Projet :** TAGORA Time uniquement (`C:\dev\tagora-time`)

---

## AVERTISSEMENT â€” LIRE EN PREMIER

# SAAS 1B.1 NON VALIDÃ‰ EN BASE LOCALE

# NE PAS MERGER DANS FEATURE AVANT VALIDATION SUPABASE LOCALE

Ce checkpoint sauvegarde du SQL + tests + scripts **non appliquÃ©s** sur une base locale saine.
Ce nâ€™est **pas** une livraison validÃ©e.

---

## Identifiants Git

| Ã‰lÃ©ment | Valeur |
|---------|--------|
| Branche de dÃ©part | `feature/sales-book-grants` |
| HEAD de dÃ©part | `6fd6ca09078eedbd133e59aca160f606fa33040b` |
| Branche WIP | `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13` |
| Ã‰tat au checkpoint | Travail SaaS 1B.1 committÃ© **uniquement** sur la WIP |

`feature/sales-book-grants` reste Ã  `6fd6ca0` (SaaS 0 + SaaS 1A fermÃ©s). **Aucun merge** ce soir.

---

## Contexte produit

| Ã‰lÃ©ment | Ã‰tat |
|---------|------|
| SaaS 0 Architecture Freeze | FermÃ© |
| SaaS 1A Technical Design Freeze | FermÃ© |
| SaaS 1B.1 schema (SQL + tests) | En cours â€” checkpoint WIP |
| Migrations appliquÃ©es localement | **Non** |
| Validation DB rÃ©elle | **Aucune** |
| Staging | Non touchÃ© |
| Production | Non touchÃ©e |
| Backfill Groupe Oliem | Non |
| DonnÃ©es Groupe Oliem | Aucune |
| Tables mÃ©tier historiques modifiÃ©es | Non |

---

## Fichiers sauvegardÃ©s (liste exacte)

1. `supabase/migrations/20260712220000_saas1_organizations.sql`
2. `supabase/migrations/20260712220100_saas1_organization_companies.sql`
3. `supabase/migrations/20260712220200_saas1_organization_settings.sql`
4. `supabase/migrations/20260712220300_saas1_organization_memberships.sql`
5. `supabase/migrations/20260712220400_saas1_organization_invitations.sql`
6. `supabase/migrations/20260712220500_saas1_platform_access.sql`
7. `src/app/lib/saas/tenant-foundation.shared.ts`
8. `src/app/lib/saas/tenant-foundation.shared.test.ts`
9. `src/app/lib/saas/tenant-foundation.migrations.test.ts`
10. `scripts/saas1b1-local-verify.sql`
11. `docs/handoffs/TAGORA-TIME-SAAS1B1-HOME-TO-OFFICE-2026-07-13.md` (ce fichier)

---

## Six migrations / sept tables

**Migrations :** versions `20260712220000` â€¦ `20260712220500` (`YYYYMMDDHHMMSS`).

**Tables prÃ©vues :**

1. `organizations`
2. `organization_companies`
3. `organization_settings`
4. `organization_memberships`
5. `organization_invitations`
6. `platform_access`
7. `platform_access_audit`

CaractÃ©ristiques SQL (dans les fichiers, non prouvÃ©es en DB) :

- RLS ENABLE + FORCE
- fail-closed (`REVOKE` anon/authenticated, pas de `USING (true)`)
- pas de seed Oliem/Titan
- garde-fou dernier `organization_owner`
- `token_hash` invitations
- support plateforme : motif + expiration

---

## QualitÃ© dÃ©jÃ  mesurÃ©e (hors DB)

| ContrÃ´le | RÃ©sultat |
|----------|----------|
| Tests SaaS 1B.1 | **19/19 PASS** |
| Lint | **0 erreur** (37 warnings prÃ©existants hors chantier) |
| Build | **PASS** |

---

## Blocage environnement maison

| Composant | Ã‰tat |
|-----------|------|
| WSL2 | InstallÃ© |
| Ubuntu WSL2 | InstallÃ©e, premier dÃ©marrage / OOBE **figÃ©** (Ã©cran noir) |
| Commandes `wsl` | Souvent **bloquÃ©es** |
| Docker Server | **Indisponible** (pipe engine absent / erreur 500) |
| Supabase local | **Non dÃ©marrÃ©** |
| Apply migrations | **Non effectuÃ©** |

---

## Interdictions (jusquâ€™Ã  validation locale)

- Ne pas merger cette WIP dans `feature/sales-book-grants`
- Aucun `db push`, `db reset`, `migration repair`, `--include-all`, `supabase link`
- Aucun SQL staging/production
- Aucun backfill / seed Groupe Oliem
- Aucun `organization_id` sur tables mÃ©tier dans ce lot

---

## ProcÃ©dure exacte de reprise au bureau

1. Sur le PC bureau :
   ```powershell
   cd C:\dev\tagora-time
   git fetch origin
   git switch wip/saas1b1-tenant-foundation-checkpoint-2026-07-13
   git pull
   git status -sb
   git rev-parse HEAD
   ```
2. Lire ce handoff et les docs `docs/saas/saas-1/`.
3. Confirmer Docker Desktop **Server** OK (`docker version` avec Client + Server).
4. `npx supabase start` (local uniquement ; URL `127.0.0.1` / `localhost`).
5. `npx supabase migration up --local`
   - Si lâ€™historique legacy bloque : **STOP**, documenter, **pas** de `repair` / `--include-all` sans GO Martin.
6. ExÃ©cuter `scripts/saas1b1-local-verify.sql` contre Postgres local.
7. Prouver : 7 tables, RLS ENABLE+FORCE, fail-closed, tables vides, pas de Groupe Oliem, pas dâ€™ALTER mÃ©tier.
8. Relancer tests SaaS 1B.1 + lint + build.
9. Seulement aprÃ¨s validation DB + GO Martin : cherry-pick / merge contrÃ´lÃ© vers `feature/sales-book-grants`.

---

## Rappel final

**SAAS 1B.1 NON VALIDÃ‰ EN BASE LOCALE**
**NE PAS MERGER DANS FEATURE AVANT VALIDATION SUPABASE LOCALE**
