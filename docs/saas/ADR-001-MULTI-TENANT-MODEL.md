# ADR-001 — Multi-tenant model

**Statut :** accepté (SaaS 0)  
**Date :** 2026-07-12  
**Décideurs :** Martin (validation produit) / Agent TAGORA Time (documentation)

---

## Contexte

TAGORA Time tourne aujourd’hui sur **une** base Supabase avec un schéma métier riche (horodateur, livraisons, GPS, effectifs, commissions, compensation, etc.) et une isolation par **rôles JWT** (`admin` / `direction` / `employe`), pas par organisation.

Objectif : commercialiser le produit en multi-entreprises sans réécrire tout le métier.

---

## Options comparées

### Option A — Shared DB + shared schema + RLS *(retenue)*

| Avantages | Inconvénients |
|-----------|----------------|
| Un déploiement, un pipeline migrations | Discipline RLS + tests anti-fuite obligatoires |
| Compatible avec le code Next.js / Supabase actuel | Bugs de filtre = risque cross-tenant |
| Coût ops plus bas | Indexes tenant sur toutes les tables chaudes |
| Onboarding client plus simple | |

### Option B — Schema par tenant (`tenant_xxx.table`)

| Avantages | Inconvénients |
|-----------|----------------|
| Isolation DDL plus forte | Migrations × N tenants |
| | Outillage Supabase / ORM peu naturel |
| | Complexité ops élevée pour le stade actuel |

### Option C — Base (projet) par tenant

| Avantages | Inconvénients |
|-----------|----------------|
| Isolation maximale | Provisionnement lourd ; coût ; drift de schéma |
| | Incompatible avec un SaaS self-serve à court terme |
| | Duplique Auth, storage, crons |

---

## Décision

**Retenir Option A : shared database + shared schema + RLS stricte**, complétée par :

1. `organization_id` sur toutes les tables métier ;
2. filtres API obligatoires ;
3. règles service role documentées (ADR-004) ;
4. tests cross-tenant automatisés (SaaS 2+).

---

## Conséquences

- SaaS 1 introduit le modèle org / membership **avant** le billing.
- Les compagnies Oliem/Titan restent des **lignes de configuration** dans le tenant legacy, pas des schémas séparés.
- Les vues finance actuelles (`intercompany_billing_summary`, `temps_titan`, etc.) devront être **scopées org** puis éventuellement renommées en SaaS 6.

---

## Références dépôt

- Client admin (service role) : `src/app/lib/supabase/admin.ts`
- Client serveur public : `src/app/lib/supabase/server.ts`
- RLS rôle-aware existante : `supabase/migrations/20260418_141000_horodateur_phase1_rls.sql`, `supabase/permissions_and_rls.sql`
- Aucune occurrence actuelle de `organization_id` / `tenant_id` dans le dépôt
