# ADR-003 — Roles and platform access

**Statut :** accepté (SaaS 0)  
**Date :** 2026-07-12

---

## Contexte actuel

Rôles **globaux** JWT (`app_metadata.role`) :

- `admin` | `direction` | `employe` (+ legacy `manager`)

Fichiers :

- `src/app/lib/auth/roles.ts`
- `src/app/lib/auth/permissions.ts` (modules : documents, dossiers, terrain, livraisons, ressources, commissions, admin_finance)
- RLS : `current_app_role()`, `is_admin_user()`, etc.

**Problème :** un rôle JWT global n’isole pas les données entre clients. Un `admin` voit (via API service role) l’ensemble de la base.

---

## Rôles retenus (cible)

### Plateforme TAGORA

| Rôle | Portée | Usage |
|------|--------|--------|
| `platform_super_admin` | Toute la plateforme | Ops TAGORA, support, provisioning d’urgence |

Accès support : **toujours audité** (table d’audit dédiée en SaaS 7). Pas d’impersonation silencieuse.

### Par organisation (tenant)

| Rôle | Portée | Équivalent actuel approximatif |
|------|--------|--------------------------------|
| `organization_owner` | Propriétaire du tenant | n/a (à créer) |
| `organization_admin` | Admin org (config, users, finance selon entitlements) | `admin` |
| `direction` | Ops / supervision | `direction` |
| `employé` | Terrain / self-service | `employe` |
| Rôles personnalisés | Futur | n/a |

Les permissions modules actuelles (`hasUserPermission`) deviennent **org-scoped** + **entitlement-aware**.

---

## Règles non négociables

1. **Interdiction** d’utiliser un rôle JWT global comme **seule** frontière tenant.
2. Toute requête métier exige : identité utilisateur + `organization_id` actif + membership valide.
3. `platform_super_admin` ne lit des données client que via un mode support journalisé.
4. Confidentialité renforcée :
   - salaires / rémunération → rôles finance org + module Rémunération
   - commissions / Livre de commissions → module Premium + grants (évolution de `commission_book_access_grants`)
   - GPS → module GPS + rôles autorisés
5. Garde-fou futur : empêcher la révocation du **dernier** `organization_owner` / admin actif.

---

## MFA

Conserver l’obligation MFA pour `organization_admin`, `organization_owner`, `direction` (et `platform_super_admin`).

Référence : `src/app/lib/auth/mfa.shared.ts`, `src/middleware.ts`.  
Bypass staging : reste **staging-only**.

---

## Mapping de migration (SaaS 1+)

| Aujourd’hui | Cible (tenant Groupe Oliem) |
|-------------|-----------------------------|
| `admin` | `organization_admin` (+ éventuel `organization_owner` pour le compte fondateur) |
| `direction` | `direction` |
| `employe` | `employé` |
| Bootstrap `scripts/bootstrap-founder-admin.mjs` | Remplacé par onboarding / outils plateforme (plus d’email hardcodé `mstgelais@oliem.ca` comme logique produit) |

---

## Conséquences

- Les helpers RLS actuels basés uniquement sur `current_app_role()` sont insuffisants pour le SaaS.
- SaaS 2 introduit `current_organization_id()` (ou équivalent claim/session) dans les policies.
