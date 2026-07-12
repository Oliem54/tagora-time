# ADR-002 — Organization and company model

**Statut :** accepté (SaaS 0)  
**Date :** 2026-07-12

---

## Contexte

Aujourd’hui, « compagnie » signifie un **enum à deux valeurs** hardcodé :

- `oliem_solutions`
- `titan_produits_industriels`

Références principales :

- `src/app/lib/account-requests.shared.ts` (`ACCOUNT_REQUEST_COMPANIES`)
- Contraintes CHECK dans `supabase/migrations/20260410_120000_company_activation_and_payroll.sql`
- Intercompagnie : `billing_company_context` (`20260412_103000_timeclock_terrain_intercompany.sql`)
- Effectifs : `effectifs_departments.company_key`, etc.

Ce n’est **pas** un modèle multi-tenant.

---

## Modèle cible

```
platform (TAGORA)
 └── organization (tenant)
      ├── organization_members (user ↔ role)
      ├── organization_settings (locale, devise, fuseau, branding…)
      ├── internal_companies (compagnies légales / ops)
      │     ├── departments
      │     └── locations / gps_bases
      ├── entitlements / subscription mirror
      └── business data (chauffeurs, events, …) via organization_id
```

### organizations

Client SaaS. Champs cibles (non implémentés en SaaS 0) :

- identité légale, statut `active` | `suspended`
- `default_locale` (fr-CA), `default_currency` (CAD), `timezone` (configurable)
- branding (logo, couleurs) — SaaS 6

### organization_members

Lien `auth.users` ↔ `organizations` avec rôle org-scoped (ADR-003).

### Compagnies légales internes (`internal_companies`)

Entités **dans** le tenant. Remplacent l’enum global Oliem/Titan.

Pour le tenant legacy **Groupe Oliem** :

| Code legacy | Libellé cible |
|-------------|----------------|
| `oliem_solutions` | Oliem Solutions |
| `titan_produits_industriels` | Produits Industriels Titan |

### Départements

Conservent le rôle actuel (`effectifs_departments`, clés type `showroom_titan`, etc.) mais rattachés à `organization_id` (+ éventuellement `internal_company_id`).

### Lieux

Bases GPS, zones de pointage, adresses de ramassage : données tenant, plus de défaut plateforme « Oliem Solutions » (`ramassage-defaults.server.ts`).

---

## Oliem/Titan dans le modèle cible

| Aujourd’hui | Cible |
|-------------|--------|
| Enum plateforme | Lignes `internal_companies` du tenant Groupe Oliem |
| Routes `/facturation-titan`, table `temps_titan` | Concepts génériques « temps travaillé / refacturation intercompagnie » (renommage SaaS 6) |
| Flags `can_work_for_oliem_*` / `can_work_for_titan_*` | Capacités sur compagnies internes du même tenant |

---

## Règles intercompagnies

1. Intercompagnie **uniquement** entre `internal_companies` du **même** `organization_id`.
2. Impossible de facturer / assigner une compagnie d’un autre tenant.
3. Les vues type `intercompany_billing_summary` doivent filtrer `organization_id`.
4. Un employé peut travailler pour plusieurs compagnies internes **du même tenant** (équivalent des flags actuels).

---

## Séparation des concepts (obligatoire)

| Concept | Portée |
|---------|--------|
| Tenant | Isolation + billing |
| Compagnie interne | Ops / légal / interco |
| Département | Effectifs / couverture |
| Utilisateur | Auth |
| Rôle | Autorisation |
| Module | Entitlement produit |
| Abonnement | Plan commercial |

---

## Conséquences

- Aucun nouveau CHECK SQL limité à `oliem_solutions` / `titan_produits_industriels` (freeze).
- SaaS 1 crée les tables org ; SaaS 6 génériise les noms Titan dans l’UI.
