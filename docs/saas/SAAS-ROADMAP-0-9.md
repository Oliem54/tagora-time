# SAAS-ROADMAP-0-9

**Statut :** feuille de route officielle post-freeze  
**Date :** 2026-07-12

## Indicateurs (ne pas confondre)

| Indicateur | Description |
|------------|-------------|
| Avancement **V1 fonctionnelle** | Livraison modules métier pour usage interne (feuille de route produit) |
| Maturité **SaaS** | Multi-tenant, isolation, entitlements, onboarding, billing |

L’estimé audit (~18 % SaaS) ne remplace pas l’indicateur V1.

---

## SaaS 0 — Architecture Freeze

| | |
|--|--|
| **Objectif** | Figer le modèle (docs ADR + inventaires) |
| **Dépendances** | Audit SaaS lecture seule |
| **Portée** | `docs/saas/**` uniquement |
| **Tables** | aucune modification |
| **Fichiers** | documentation listée dans README |
| **Risques** | freeze ignoré → nouveaux hardcodes |
| **Effort** | faible |
| **Sortie** | docs validés Martin ; checklist PR active |
| **Validation Martin** | **oui — obligatoire avant SaaS 1** |

---

## SaaS 1 — Tenant Foundation

| | |
|--|--|
| **Objectif** | `organizations`, members, settings ; `organization_id` nullable + backfill Groupe Oliem |
| **Dépendances** | SaaS 0 validé |
| **Portée** | schéma + context session/API ; pas Stripe |
| **Tables** | `organizations`, `organization_members`, `internal_companies` ; ALTER tables P0 inventaire |
| **Fichiers** | `supabase/migrations/*` (nouvelle convention), `src/app/lib/auth/*`, `supabase/admin.ts` callers |
| **Risques** | backfill incomplet ; double écriture |
| **Effort** | élevé |
| **Sortie** | app lit `current_organization_id` ; données legacy rattachées |
| **Validation Martin** | oui (schéma + org legacy) |

---

## SaaS 2 — RLS et isolation

| | |
|--|--|
| **Objectif** | Policies tenant-aware ; service role filtré ; tests anti-fuite |
| **Dépendances** | SaaS 1 |
| **Portée** | RLS + durcissement API |
| **Tables** | toutes P0/P1 inventaire |
| **Fichiers** | migrations policies ; routes API ; tests vitest/integration |
| **Risques** | régression accès Direction/Admin |
| **Effort** | élevé |
| **Sortie** | user org A ≠ données org B (tests CI verts) |
| **Validation Martin** | oui (sécurité) |

---

## SaaS 3 — Plans, modules et quotas

| | |
|--|--|
| **Objectif** | Catalogue modules + entitlements (+ quotas de base) |
| **Dépendances** | SaaS 1 (idéal 2) |
| **Portée** | tables entitlements ; gates API/UI |
| **Tables** | `plans`, `organization_entitlements`, compteurs usage |
| **Fichiers** | `permissions.ts` évolution ; middleware modules ; UI nav |
| **Risques** | faux négatifs (module masqué mais API ouverte) |
| **Effort** | moyen |
| **Sortie** | Premium commission_book / payroll activables par org ; **avant pilote** |
| **Validation Martin** | oui (catalogue commercial) |

---

## SaaS 4 — Onboarding

| | |
|--|--|
| **Objectif** | Création org + premier owner/admin + invites + import employés |
| **Dépendances** | SaaS 1–3 |
| **Portée** | wizard ; plus de bootstrap email hardcodé comme chemin normal |
| **Tables** | invitations org |
| **Fichiers** | nouvelles routes onboarding ; évolution `demande-compte` |
| **Risques** | comptes orphelins |
| **Effort** | élevé |
| **Sortie** | nouveau client sans SQL manuel |
| **Validation Martin** | oui |

---

## SaaS 5 — Billing

| | |
|--|--|
| **Objectif** | Stripe (Checkout, Portal, webhooks, Tax CAD) |
| **Dépendances** | SaaS 3 ; SaaS 4 recommandé |
| **Portée** | abonnements ; essais ; suspension |
| **Tables** | `subscriptions` mirror |
| **Fichiers** | API webhooks Stripe ; page abonnement |
| **Risques** | désync entitlements |
| **Effort** | moyen/élevé |
| **Sortie** | paiement automatisé **ou** pilote encore manuel mais entitlements branchés |
| **Validation Martin** | oui (prix / Stripe account) |

---

## SaaS 6 — Branding et configuration

| | |
|--|--|
| **Objectif** | Logo, couleurs, TZ, locale, devise ; génériiser Oliem/Titan UI/routes |
| **Dépendances** | SaaS 1 ; parallèle possible avec 3–5 |
| **Portée** | settings org ; renommages |
| **Tables** | `organization_branding` / settings |
| **Fichiers** | pages Titan→générique ; email templates ; hardcode inventory |
| **Risques** | liens cassés ; dette large |
| **Effort** | élevé |
| **Sortie** | client externe sans voir « Titan/Oliem » plateforme |
| **Validation Martin** | oui (identité produit) |

---

## SaaS 7 — Support et opérations plateforme

| | |
|--|--|
| **Objectif** | Console support, audit accès, catalogue outils QA, runbooks |
| **Dépendances** | SaaS 2+ |
| **Portée** | `platform_super_admin` ; pas d’impersonation non journalisée |
| **Tables** | `support_access_audit` |
| **Fichiers** | internal APIs ; doc ops ; simulateur QA reste staging-only |
| **Risques** | backdoor support |
| **Effort** | moyen |
| **Sortie** | procédure support auditable |
| **Validation Martin** | oui |

---

## SaaS 8 — Pilote client

| | |
|--|--|
| **Objectif** | Un client externe réel, entitlements actifs, facturation manuelle OK |
| **Dépendances** | SaaS 2 + 3 minimum ; 4 et 6 partiels acceptables si white-glove |
| **Portée** | ops + contrat |
| **Tables** | — |
| **Fichiers** | — |
| **Risques** | fuite ; support insuffisant |
| **Effort** | moyen (ops) |
| **Sortie** | 30–60 j sans incident isolation |
| **Validation Martin** | oui (GO pilote) |

---

## SaaS 9 — Commercialisation

| | |
|--|--|
| **Objectif** | Self-serve, pricing, scale |
| **Dépendances** | SaaS 4–8 |
| **Portée** | GTM + produit |
| **Effort** | élevé |
| **Sortie** | acquisition sans provisionnement Martin |
| **Validation Martin** | oui |

---

## Première phase d’implémentation recommandée

Après validation Martin de SaaS 0 → **SaaS 1 — Tenant Foundation** (pas Stripe d’abord).
