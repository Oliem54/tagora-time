# SAAS-1 — Tenant Foundation Design

**Statut :** PROPOSÉ / NON IMPLÉMENTÉ  
**Date :** 2026-07-12  
**HEAD référence :** `660ac5c`

---

## 1. Objectif SaaS 1

Introduire la **fondation multi-tenant** (organisations, compagnies internes, memberships, invitations, settings, accès plateforme) **sans** encore activer l’isolation RLS complète (SaaS 2) ni le billing (SaaS 5).

### Ce que SaaS 1 fait

- Créer le modèle de données tenant
- Définir le contexte d’organisation active
- Préparer le mapping de rôles et le backfill Groupe Oliem
- Poser les règles service role pour la suite

### Ce que SaaS 1 ne fait pas

- Stripe / entitlements complets (SaaS 3–5)
- RLS tenant-aware production (SaaS 2)
- Renommage UI Titan (SaaS 6)
- Modification des 52 tables métier en une seule passe

---

## 2. État EXISTANT (honnête)

| Élément | État |
|---------|------|
| `organizations` / memberships | **Absent** |
| `organization_id` sur tables métier | **Absent** |
| Source de vérité rôle | JWT `app_metadata.role` (`admin` \| `direction` \| `employe`) — `src/app/lib/auth/roles.ts` |
| Employé | Table `chauffeurs` + `auth_user_id` |
| Onboarding | `account_requests` + invites portal |
| Isolation | Rôle global + ~100+ routes `createAdminSupabaseClient` |
| Multi-tenant | **Non** |

---

## 3. Architecture cible (rappel)

```
platform_access (TAGORA)
organizations (tenant)
  ├── organization_companies (Oliem Solutions, Titan, …)
  ├── organization_memberships (user ↔ role org)
  ├── organization_invitations
  ├── organization_settings
  └── [métier + organization_id]  ← lots ultérieurs, pas 1B
```

---

## 4. Découpage — DÉCIDÉ Martin

### SaaS 1B — Premier lot (confirmé)

**Fondation uniquement** (aucune table métier + `organization_id`) :

- `organizations`
- `organization_companies`
- `organization_memberships`
- `organization_invitations`
- `organization_settings`
- `platform_access` (+ audit access)

**Pourquoi pas fondation + Core métier d’emblée :**

- Réduit le rayon de blast
- Permet de valider helpers / seed Groupe Oliem / memberships avant de toucher `chauffeurs` et la finance
- Les tables Compensation / rémunération restent hors premier lot (risque $ + volume + RLS admin actuelle)
- Décision Martin : lot 1B = fondation seule

### Ordre métier ultérieur (après 1B validé)

1. Comptes / `account_requests` / lien Auth  
2. `chauffeurs`  
3. Paramètres / configs singleton → org-scoped  
4. Audit logs  
5. Pointage (`horodateur_*`)  
6. Opérations (livraisons, terrain)  
7. GPS  
8. Commissions / Compensation / rémunération (**dernier parmi les lots chauds**)

---

## 5. Principes non négociables

1. Fail closed sans org active valide  
2. Aucune confiance dans un `organization_id` client non validé contre membership  
3. `platform_super_admin` **hors** `organization_memberships`  
4. Pas de hard-delete legacy  
5. IDs métier conservés  
6. Aucun nouveau hardcode Oliem/Titan  
7. Entitlements modules = SaaS 3 (stubs possibles, pas Stripe)

---

## 6. Livrables liés

Voir les fichiers du même dossier pour schéma, auth context, rôles, backfill, service role, migrations, tests, décisions Martin.
