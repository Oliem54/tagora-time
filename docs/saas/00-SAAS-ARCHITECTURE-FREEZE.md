# SaaS 0 — Architecture Freeze TAGORA Time

**Statut :** officiel — gel d’architecture  
**Date de gel :** 2026-07-12  
**Branche de référence :** `feature/sales-book-grants`  
**HEAD de référence :** `f383d32`  
**Périmètre :** documentation uniquement (aucune migration, aucun code applicatif)

---

## 1. Vision SaaS

TAGORA Time doit devenir un **produit SaaS payant, générique, multi-entreprises et revendable**.

Cela concerne **tous** les modules existants et futurs : comptes, employés, pointage, GPS, opérations, livraisons/ramassages, alertes, documents, commissions, Livre de commissions, rémunération, rapports, paramètres.

**État actuel (honnête) :** TAGORA Time est une **application interne mono-déploiement** (Groupe Oliem / compagnies Oliem Solutions et Produits Industriels Titan). Elle n’est **pas** multi-tenant. L’audit SaaS estime la maturité SaaS à environ **18 %**. L’avancement **V1 fonctionnelle** (feuille de route produit interne) est un indicateur **distinct** et n’est pas remplacé par ce pourcentage.

---

## 2. Modèle retenu — shared database

| Choix | Décision |
|-------|----------|
| Base | PostgreSQL / Supabase **partagée** |
| Schéma | **shared schema** |
| Isolation | **RLS multi-tenant stricte** + filtres API |
| Alternative rejetée | schéma-par-tenant, base-par-tenant (voir ADR-001) |

Un seul déploiement applicatif sert N organisations clientes. Chaque ligne métier appartient à une organisation via `organization_id`.

---

## 3. Définition d’un tenant

Un **tenant** = une **organization** cliente de TAGORA Time.

Exemples :

- Organisation cliente externe (futur acheteur SaaS)
- Organisation legacy **« Groupe Oliem »** (données actuelles backfillées)

Le tenant est la **frontière de facturation, d’entitlements, de branding et d’isolation des données**.

---

## 4. Tenant vs compagnie interne

| Concept | Définition | Est un tenant ? |
|---------|------------|-----------------|
| **Organization (tenant)** | Client de la plateforme | Oui |
| **Compagnie interne** | Entité légale / opérationnelle **à l’intérieur** d’un tenant | Non |
| **Département** | Structure organisationnelle sous une compagnie ou un tenant | Non |
| **Lieu / base GPS** | Point physique configurable | Non |
| **Utilisateur** | Identité Auth rattachée via membership | Non |
| **Rôle** | Droit dans une organisation (ou plateforme) | Non |
| **Module** | Capacité produit activable | Non |
| **Abonnement** | Contrat commercial / entitlements | Non |

**Décision Oliem/Titan :**

- **Un seul tenant legacy** : « Groupe Oliem »
- **Deux compagnies internes configurables** (pas des tenants) :
  - Oliem Solutions (`oliem_solutions` aujourd’hui)
  - Produits Industriels Titan (`titan_produits_industriels` aujourd’hui)
- Les règles intercompagnies (travail croisé, refacturation) restent **intra-tenant**.

Oliem/Titan ne doivent **jamais** être la logique de plateforme. Ce sont des **données / configuration legacy** du tenant Groupe Oliem.

---

## 5. Frontières de données

1. Toute table métier importante doit porter `organization_id` (stratégie progressive : nullable → backfill → NOT NULL — ADR-004, ADR-006).
2. Aucune requête métier « globale » sans filtre tenant, sauf jobs plateforme explicitement scopés et audités.
3. Les données **salariales**, **commissions** et **GPS** restent confidentielles **en plus** de l’isolation tenant (rôles + grants + entitlements).
4. Le **service role** ne contourne pas la responsabilité d’isolation : tout accès service role doit appliquer un filtre `organization_id` (ou être un job plateforme journalisé).

---

## 6. Principes de sécurité

- **Fail closed** : absence de contexte org → refus.
- JWT seul **n’est pas** une frontière tenant (rôles globaux actuels à faire évoluer — ADR-003).
- RLS tenant-aware obligatoire sur les tables métier.
- MFA conservée pour les rôles direction/admin (et équivalents org).
- Accès support plateforme **audité**.
- Simulateur QA Livre de commissions : **staging-only** (déjà gated) — interdit en production client.

---

## 7. Ordre des phases SaaS

| Phase | Nom |
|-------|-----|
| SaaS 0 | Architecture Freeze *(cette passe)* |
| SaaS 1 | Tenant Foundation |
| SaaS 2 | RLS et isolation |
| SaaS 3 | Plans, modules et quotas |
| SaaS 4 | Onboarding |
| SaaS 5 | Billing (Stripe pour commercialisation ; pilote peut être manuel) |
| SaaS 6 | Branding et configuration |
| SaaS 7 | Support et opérations plateforme |
| SaaS 8 | Pilote client |
| SaaS 9 | Commercialisation |

Détail : `SAAS-ROADMAP-0-9.md`.

**Règle :** les **entitlements** (SaaS 3) doivent exister **avant** le pilote (SaaS 8), même si la facturation Stripe complète peut venir après un pilote facturé manuellement.

---

## 8. Marché initial

| Élément | Décision |
|---------|----------|
| Marché | Canada |
| Devise par défaut | CAD |
| Locale par défaut | fr-CA |
| Fuseau | configurable par organisation |
| Extensibilité | architecture prête pour autres langues et devises |

---

## 9. Modules (catalogue gelé)

- **Core** (obligatoire)
- Pointage
- Opérations
- GPS
- Documents
- Alertes
- **Livre de commissions** (Premium)
- **Rémunération** (Premium)
- Rapports

Détail : `ADR-005-MODULES-AND-ENTITLEMENTS.md`.

---

## 10. Rôles (catalogue gelé)

- `platform_super_admin` (TAGORA)
- `organization_owner`
- `organization_admin`
- `direction`
- `employé`
- rôles personnalisés (futur)

Détail : `ADR-003-ROLES-AND-PLATFORM-ACCESS.md`.

---

## 11. Hors scope explicite de SaaS 0

- Toute migration SQL / ALTER TABLE
- Tout refactor applicatif multi-tenant
- Stripe / onboarding / branding runtime
- Renommage code Oliem/Titan
- Commit / push / Vercel / production
- Remplacement de l’indicateur V1 produit par l’estimé SaaS

---

## 12. Règle anti-régression

**Aucun nouveau hardcode Oliem/Titan** ne doit être introduit dans le code, les migrations ou l’UI.  
Checklist obligatoire : `TENANT-SAFE-DEVELOPMENT-CHECKLIST.md`.

---

## 13. Indicateurs (ne pas confondre)

| Indicateur | Signification | Usage |
|------------|---------------|--------|
| **Avancement V1 fonctionnelle** | Feuille de route produit (modules métier livrés pour usage interne) | Pilotage produit interne |
| **Maturité SaaS** | Fondations multi-tenant, isolation, entitlements, billing, onboarding | Pilotage commercialisation |

L’audit technique (≈ 18 % SaaS) **ne remplace pas** l’indicateur V1 officiel.

---

## Documents de ce freeze

Voir la liste dans `README.md` du dossier `docs/saas/`.
