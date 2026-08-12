# TAGORA Time — Phase 4D Lot 2 QA tenant proof — end-of-day handoff

Date: 2026-08-11  
Branch: `docs/tos-phase-4d-time`  
Initial HEAD: `4d3ae64484e436079e15ffbcd109c46db02d8ad1`

## 1. Identité

- Agent donneur : Martin
- Projet actif : TAGORA Time uniquement
- Agent exécutant : Agent TAGORA Time — Cursor
- Date : 2026-08-11
- Branche initiale : `docs/tos-phase-4d-time`
- HEAD initial : `4d3ae64484e436079e15ffbcd109c46db02d8ad1`
- Production : strictement `NO-GO`

## 2. État Supabase confirmé

- Organisation Supabase : `TAGORA Cloud`
- Staging : `tagora-time-staging`
- Statut staging : `ACTIVE_HEALTHY`
- Production TAGORA Time identifiée séparément du staging
- Références staging et Production distinctes
- Références masquées uniquement :
  - Staging : `qoky…dhih`
  - Production TAGORA Time : `qcgv…ijpt`
- Aucun JSON brut, hôte DB complet, URL, clé ou secret dans ce handoff
- Inventaire précédent : `PASS`
- Le dépôt présentait un indicateur de lien staging préexistant
- Aucun nouveau `supabase link` n’a été exécuté
- Origine du lien préexistant : non confirmée

## 3. Tenant analysé

- `organizations.slug = oliem-solution`
- `tenantKey = oliem_solution`
- Le slug kebab et le tenantKey underscore sont deux contrats distincts
- L’organisation existe dans le staging (lecture précédente)
- Elle est active et non supprimée selon la lecture précédente
- Deux entreprises seed avaient été observées :
  - `oliem_solutions` (default, active)
  - `titan_produits_industriels` (active)
- Zéro membership avait été observé pour ce tenant
- Les rôles `employe` et `direction` sont prévus par le contrat
- RLS activée et forcée sur les tables vérifiées (`organizations`, `organization_memberships`, `organization_companies`)
- `oliem-solution` représente une organisation seed Oliem ayant la forme d’une entreprise réelle
- Ce n’est **pas** un tenant synthétique exclusivement réservé au QA
- L’absence de mélange avec des données réelles est seulement **partiellement** prouvée
  - Zéro membership ≠ preuve complète `NO_REAL_DATA_MIXING`

## 4. SQL déjà exécutées

Ces quatre requêtes `SELECT` ont déjà été exécutées lors d’un bloc antérieur.
Aucune nouvelle lecture DB n’est autorisée pendant le présent bloc de sauvegarde.

### Q1

```sql
SELECT o.slug, o.display_name, o.legal_name, o.status, (o.deleted_at IS NULL) AS not_deleted
FROM public.organizations o
WHERE o.slug = 'oliem-solution'
LIMIT 5;
```

### Q2

```sql
SELECT oc.company_code, oc.is_default, oc.status
FROM public.organization_companies oc
INNER JOIN public.organizations o ON o.id = oc.organization_id
WHERE o.slug = 'oliem-solution' AND o.deleted_at IS NULL
LIMIT 20;
```

### Q3

```sql
SELECT m.role, m.status, count(*)::int AS membership_count
FROM public.organization_memberships m
INNER JOIN public.organizations o ON o.id = m.organization_id
WHERE o.slug = 'oliem-solution'
GROUP BY m.role, m.status
ORDER BY m.role, m.status
LIMIT 50;
```

### Q4

```sql
SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relname IN ('organizations', 'organization_memberships', 'organization_companies')
ORDER BY c.relname;
```

### Constats d’exécution (honnêtes)

- Ces requêtes étaient uniquement des `SELECT`.
- Elles ont été exécutées précédemment au moyen du CLI temporaire Supabase (`npx --yes supabase@2.113.0 db query --linked`) avec la cible liée préexistante.
- Martin n’a **pas** vu et approuvé les quatre requêtes complètes avant leur exécution.
- L’agent ne devait donc **pas** déclarer une revue humaine préalable confirmée (`MARTIN_PREEXECUTION_REVIEW_CONFIRMED=NO`).
- Aucune nouvelle lecture DB n’est autorisée pendant le présent bloc de sauvegarde.

## 5. Sources du dépôt

Fichiers de référence :

- `src/app/lib/saas/tenant-foundation.shared.ts`
- `src/app/lib/saas/oliem-tenant.shared.ts`
- `supabase/migrations/20260716220000_h4b1_tenant_root_foundation.sql`
- `supabase/migrations/20260716221000_h4b2_organization_identities.sql`
- `supabase/migrations/20260809120000_v1_oliem_tenant_company_seed.sql`
- `docs/tagora-time-v1-tenant-company-phase-b-final-closure-2026-08-09.md`

Ces sources documentent :

- format du slug (kebab);
- format du tenantKey (underscore);
- organisation seed Oliem;
- rôles de membership (`employe`, `direction`, etc.);
- modèle `organization_memberships`;
- RLS (enable + force);
- tables organization-scoped déjà identifiées.

## 6. Portée des preuves

### Tables effectivement interrogées précédemment

- `public.organizations`
- `public.organization_companies`
- `public.organization_memberships`
- `pg_catalog.pg_class`
- `pg_catalog.pg_namespace`

### Tables organization-scoped identifiées dans le dépôt

- `public.organizations`
- `public.organization_companies`
- `public.organization_settings`
- `public.organization_memberships`
- `public.organization_invitations`

Précision : toutes les tables métier historiques de TAGORA Time ne sont **pas** encore prouvées comme correctement isolées par `organization_id`.

Portée du mélange de données réelles : **PARTIELLE**.

## 7. Décision officielle de fin de soirée

Verdict :

`HOLD_TAGORA_TIME_PHASE4D_LOT2_QA_TENANT_PROOF_EVIDENCE_INSUFFICIENT`

Statuts obligatoires :

- préparation des comptes QA : `HOLD`
- compte créé : `NO`
- membership créé : `NO`
- donnée QA créée : `NO`
- scénario QA exécuté : `NO`
- Lot 2 exécuté : `NO`
- Playwright autorisé : `NO`
- Lot 3 autorisé : `NO`
- R2 commencé : `NO`
- Production : `NO-GO`
- avancement estimé vraie V1 : `99 %`

## 8. Prochaine étape minimale

Bloc recommandé :

`TAGORA_TIME_PHASE4D_LOT2_QA_TENANT_MIXING_AND_MARTIN_SQL_REVIEW_READONLY_GO_NOGO`

Cette prochaine étape devra :

- préparer une requête SELECT minimale;
- présenter la requête complète à Martin;
- attendre son approbation explicite avant exécution;
- prouver la portée du mélange éventuel de données;
- ne créer aucun compte, membership, tenant ou donnée QA;
- conserver Production `NO-GO`.

### Requête seulement proposée et non exécutée

```sql
SELECT o.slug, o.status, count(m.id)::int AS membership_count
FROM public.organizations o
LEFT JOIN public.organization_memberships m ON m.organization_id = o.id
WHERE o.deleted_at IS NULL
GROUP BY o.slug, o.status
ORDER BY o.slug
LIMIT 50;
```

`PROPOSED_SQL_EXECUTED=NO`

## 9. Reprise demain au bureau

```bash
cd C:\dev\tagora-time
git fetch origin
git switch docs/tos-phase-4d-time
git pull --ff-only origin docs/tos-phase-4d-time
git status -sb
git status --short -uall
git log --oneline -5
```

Les trois stashes restent locaux sur le poste actuel et ne sont **pas** transférés par `git push`.
