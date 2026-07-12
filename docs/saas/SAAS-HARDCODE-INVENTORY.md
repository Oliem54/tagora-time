# SAAS-HARDCODE-INVENTORY

**Statut :** inventaire SaaS 0  
**Date :** 2026-07-12  
**Méthode :** recherche dépôt `src/`, `supabase/`, `scripts/` (Oliem, Titan, CAD, fr-CA, fuseaux, emails, routes)

Classes :

| Classe | Signification |
|--------|----------------|
| **legacy-ok** | Acceptable comme donnée / config du tenant Groupe Oliem |
| **move-config** | À déplacer en configuration tenant / compagnie interne |
| **rename** | À renommer génériquement (UI, routes, tables) avant ou pendant pilote |
| **block-pilot** | Bloquant avant pilote client externe si encore logique plateforme |

---

## 1. Entités Oliem / Titan

| Élément | Preuves (exemples) | Classe | Notes |
|---------|-------------------|--------|-------|
| Enum compagnies `oliem_solutions` / `titan_produits_industriels` | `src/app/lib/account-requests.shared.ts` ; CHECKs `20260410_120000_*.sql`, `20260412_103000_*.sql`, GPS, effectifs | **block-pilot** si reste enum global ; **legacy-ok** une fois lignes `internal_companies` | Cœur du couplage |
| Flags `can_work_for_oliem_*` / `can_work_for_titan_*` | account-requests, chauffeurs migrations | **move-config** | Capacités multi-compagnies intra-tenant |
| Labels UI « Oliem Solutions », « Titan » | nombreux clients Direction/Admin | **move-config** / **rename** | Afficher libellés config |
| Départements `showroom_titan`, etc. | `effectifs-departments.shared.ts`, migration departments | **legacy-ok** → **move-config** | Seed tenant legacy |
| Templates `titan_billing_*` | `20260509120000_app_communication_templates.sql`, `scripts/_comm_seed.sql` | **rename** / **move-config** | Pas de Titan dans catalogue plateforme |
| Table / vues `temps_titan` | migrations finance, pages Direction/Admin | **rename** | Concept « temps travaillé / paie » |
| Routes `/admin/facturation-titan`, `/direction/facturation-titan`, `/direction/temps-titan`, `/admin/temps-titan-finance` | `src/app/admin/*`, `src/app/direction/*` | **rename** (**block-pilot** si visibles client externe) | Navigation SaaS générique |
| Default ramassage « Oliem Solutions » | `src/app/lib/livraisons/ramassage-defaults.server.ts` | **move-config** | |
| Email footers « TAGORA Time — Oliem Solutions » | `supabase/email-templates/*.html` | **move-config** | Branding org |
| Volume approx. | **~120+ fichiers `src`** + **~30 fichiers `supabase`** touchés par motifs Oliem/Titan | — | Dette élevée |

**X-Plod / Emoby / Skyline :** aucune occurrence significative trouvée.

---

## 2. Domaines et courriels

| Élément | Preuves | Classe |
|---------|---------|--------|
| `mstgelais@oliem.ca` | `scripts/bootstrap-founder-admin.mjs` | **block-pilot** en tant que logique produit ; **legacy-ok** comme user réel du tenant |
| `@oliem.ca` fixtures tests | tests commissions / accounts | **legacy-ok** en tests ; éviter en prod seed générique |
| Hostname prod `tagora.ca` (garde MFA / QA) | `mfa.shared.ts`, `compensation-qa.shared.ts` | **legacy-ok** / plateforme | Garde-fous techniques OK |

---

## 3. Locale, devise, fuseau

| Élément | Preuves | Classe |
|---------|---------|--------|
| `CAD` hardcodé | paie, PaymentClientUi, commissions `formatCad` | **move-config** (défaut Canada OK) |
| `fr-CA` / `fr` | tris, `Intl.NumberFormat` | **move-config** (défaut fr-CA OK) |
| `America/Toronto` | `api/direction/horodateur/notifications/config/route.ts` | **move-config** | Fuseau org configurable |
| Textes FR figés | UI globale | **move-config** progressif (i18n SaaS 6+) |

---

## 4. Lieux et IDs

| Élément | Classe |
|---------|--------|
| Bases GPS en DB | **legacy-ok** (données) ; enum `company_context` **move-config** |
| Zones punch `zone_key` unique global | **move-config** → unique `(organization_id, zone_key)` |
| Chauffeur QA id `1` / libellés QA | **legacy-ok** staging ; interdit comme défaut prod client |
| Refs Supabase staging/prod dans code QA | **legacy-ok** pour gates sécurité |

---

## 5. Routes et modules nommés

| Route / module | Classe avant pilote |
|----------------|---------------------|
| `facturation-titan` | **rename** / **block-pilot** si exposé |
| `temps-titan` | **rename** / **block-pilot** si exposé |
| `paie-compagnies` | **move-config** (OK si libellés génériques) |
| Livre de commissions (`/admin/compensation`) | OK générique (S9) |
| Marketing « SaaS terrain » (`logiciel/page.tsx`) | Cosmétique — ne pas présenter comme preuve technique |

---

## 6. Modèles de messages

| Élément | Classe |
|---------|--------|
| Templates système avec catégorie « Refacturation Titan » | **rename** |
| SMS / email copy mentionnant Oliem | **move-config** |
| Notes QA « DONNÉE QA STAGING » | **legacy-ok** staging-only |

---

## 7. Compteurs pour le rapport SaaS 0

| Métrique | Valeur approximative |
|----------|----------------------|
| Fichiers `src` avec motif Oliem/Titan/CAD/fr-CA/fuseau (grep cumulatif) | **120+** |
| Fichiers `supabase` avec motif Oliem/Titan | **~30** |
| Entrées classées dans ce document (lignes d’inventaire) | **35+** thèmes |
| Entités tierces X-Plod/Emoby/Skyline | **0** |

*Le « nombre de hardcodes inventoriés » du rapport final utilise **~150 fichiers touchés** + **35+ thèmes classés**.*

---

## 8. Règle freeze

À partir de SaaS 0 : **aucun nouveau** hardcode Oliem/Titan, email `@oliem.ca`, ou CHECK SQL à deux compagnies figées, sauf seed explicitement marqué « legacy Groupe Oliem » et isolé.
