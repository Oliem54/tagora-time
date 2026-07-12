# SAAS-1 — Database schema proposal

**Statut :** PROPOSÉ / NON IMPLÉMENTÉ  
**Aucune table créée dans cette passe.**

Légende : **EXISTANT** = déjà en prod/staging | **PROPOSÉ** = cible SaaS 1

---

## A. `organizations` — PROPOSÉ

| Champ | Type proposé | Notes |
|-------|--------------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `slug` | `text` NOT NULL | unique global ; ex. `groupe-oliem` |
| `legal_name` | `text` NOT NULL | |
| `display_name` | `text` NOT NULL | |
| `status` | `text` NOT NULL | `active` \| `suspended` \| `pending` |
| `default_locale` | `text` NOT NULL | défaut `fr-CA` |
| `default_currency` | `text` NOT NULL | défaut `CAD` |
| `default_timezone` | `text` NOT NULL | configurable ; seed `America/Toronto` pour legacy |
| `created_at` / `updated_at` | `timestamptz` | |
| `suspended_at` | `timestamptz` NULL | |
| `deleted_at` | `timestamptz` NULL | soft-delete org (pas hard-delete) |
| `metadata` | `jsonb` NULL | extensibilité non sensible |

- **Rôle :** tenant SaaS  
- **Unicité :** `slug` WHERE `deleted_at IS NULL`  
- **Index :** `(status)`, `(slug)`  
- **Soft-delete :** oui (`deleted_at`)  
- **Sensible :** identité légale — accès owner/admin + plateforme  
- **RLS future :** lecture membres org ; écriture owner/admin ; platform_access audité  
- **Propriétaire fonctionnel :** organization_owner / TAGORA ops  

---

## B. `organization_companies` — PROPOSÉ

Compagnies **internes** (pas des tenants). Seed Groupe Oliem :

| company_code legacy | display_name |
|---------------------|--------------|
| `oliem_solutions` | Oliem Solutions |
| `titan_produits_industriels` | Produits Industriels Titan |

| Champ | Type proposé | Notes |
|-------|--------------|-------|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` NOT NULL FK → organizations | ON DELETE RESTRICT |
| `legal_name` | `text` NOT NULL | |
| `display_name` | `text` NOT NULL | |
| `company_code` | `text` NOT NULL | code stable intra-org ; map legacy |
| `legal_number` | `text` NULL | NEQ / etc. |
| `status` | `text` NOT NULL | `active` \| `inactive` |
| `is_default` | `boolean` NOT NULL DEFAULT false | une seule default par org |
| `created_at` / `updated_at` | `timestamptz` | |

- **Unicité :** `(organization_id, company_code)` ; partial unique `(organization_id)` WHERE `is_default`  
- **Index :** `(organization_id)`, `(organization_id, status)`  
- **Soft-delete :** status `inactive` préféré (pas hard-delete)  
- **RLS future :** même org que membership  
- **Propriétaire :** organization_admin  

**EXISTANT à mapper plus tard :** colonnes `company_context` / `primary_company` / `company_key` / `billing_company_context` (enum texte, pas FK).

---

## C. `organization_memberships` — PROPOSÉ

| Champ | Type proposé | Notes |
|-------|--------------|-------|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` NOT NULL FK | |
| `user_id` | `uuid` NOT NULL FK → `auth.users` | |
| `role` | `text` NOT NULL | `organization_owner` \| `organization_admin` \| `direction` \| `employe` |
| `status` | `text` NOT NULL | `active` \| `suspended` \| `invited` |
| `is_default` | `boolean` NOT NULL DEFAULT false | org active préférée |
| `joined_at` | `timestamptz` NULL | |
| `suspended_at` | `timestamptz` NULL | |
| `created_at` / `updated_at` | `timestamptz` | |

- **Unicité :** `(organization_id, user_id)`  
- **Index :** `(user_id)`, `(organization_id, role)`, `(user_id) WHERE is_default`  
- **Contrainte :** `platform_super_admin` **interdit** dans cette table  
- **Garde-fou (app + évent. trigger) :** ≥ 1 `organization_owner` actif par org  
- **RLS future :** membre voit sa ligne ; admin org gère les membres  
- **Propriétaire :** organization_owner / organization_admin  

**EXISTANT :** rôle global JWT — pas de membership table.

---

## D. `platform_access` — PROPOSÉ (rôle plateforme séparé)

| Champ | Type proposé | Notes |
|-------|--------------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL FK → auth.users | |
| `access_level` | `text` NOT NULL | `platform_super_admin` \| `platform_support` |
| `status` | `text` NOT NULL | `active` \| `revoked` \| `expired` |
| `reason` | `text` NOT NULL | motif obligatoire pour support |
| `granted_by` | `uuid` NULL | |
| `expires_at` | `timestamptz` NULL | **obligatoire** pour `platform_support` |
| `revoked_at` | `timestamptz` NULL | |
| `created_at` / `updated_at` | `timestamptz` | |

### `platform_access_audit` — PROPOSÉ

Journal append-only : qui a ouvert quel org, motif, début/fin, IP/user-agent hash.

- **Règle :** aucun accès client silencieux  
- **RLS :** table non lisible par clients ; service role + super_admin seulement  

---

## E. `organization_invitations` — PROPOSÉ

| Champ | Type proposé | Notes |
|-------|--------------|-------|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` NOT NULL FK | |
| `email` | `citext` ou `text` NOT NULL | |
| `proposed_role` | `text` NOT NULL | rôles org seulement |
| `token_hash` | `text` NOT NULL | jamais stocker token clair |
| `status` | `text` NOT NULL | `pending` \| `accepted` \| `revoked` \| `expired` |
| `invited_by` | `uuid` NULL | |
| `expires_at` | `timestamptz` NOT NULL | |
| `accepted_at` / `revoked_at` | `timestamptz` NULL | |
| `created_at` / `updated_at` | `timestamptz` | |

- **Unicité :** une invitation `pending` active par `(organization_id, email)`  
- **EXISTANT parallèle :** invites Auth via `account_requests` et `chauffeurs.account_invitation_*` — à réconcilier progressivement, pas supprimer en 1B  

---

## F. `organization_settings` — PROPOSÉ

**Recommandation :** combinaison

1. **Colonnes normalisées** pour champs interrogés souvent / contraintes : locale, currency, timezone, date_format, week_start  
2. **JSONB `preferences`** pour notifications, politiques non critiques  
3. **Tables spécialisées plus tard** pour branding assets (SaaS 6) et configs ops déjà tables (`horodateur_direction_alert_config`, etc.)

| Champ | Type proposé |
|-------|--------------|
| `organization_id` | `uuid` PK/FK 1:1 |
| `locale` / `currency` / `timezone` | text |
| `date_format` / `time_format` | text NULL |
| `branding` | jsonb NULL (logo_url, primary_color…) — branding **tenant** |
| `notification_defaults` | jsonb NULL |
| `operational_policies` | jsonb NULL |
| `updated_at` | timestamptz |

**Compagnies internes (décidé Martin) :** paramètres **opérationnels** configurables par `organization_company` ; **branding principal au tenant** (`organization_settings.branding`).

---

## Tables EXISTANTES hors 1B (rappel)

Ne pas créer/modifier en 1B : `chauffeurs`, `account_requests`, `horodateur_*`, `compensation_*`, `temps_titan`, etc.  
Inventaire : `../SAAS-TABLE-INVENTORY.md`.

---

## Entitlements (hors scope création complète 1B)

Stub optionnel documenté pour SaaS 3 : `organization_entitlements`. **Non requis** pour valider 1B fondation. Stripe **interdit** avant fondation + RLS + entitlements (décision Martin).
