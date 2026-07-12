# ADR-005 — Modules and entitlements

**Statut :** accepté (SaaS 0)  
**Date :** 2026-07-12

---

## Contexte

Aujourd’hui, l’accès modules est un **RBAC global** (`src/app/lib/auth/permissions.ts`, `admin-finance.ts`), pas un catalogue commercial par organisation. Aucun plan Stripe, quota, essai ou `module_enabled` tenant.

---

## Catalogue modules (gelé)

| Code module | Libellé | Type | Contenu typique (existant) |
|-------------|---------|------|----------------------------|
| `core` | Core | **Obligatoire** | Comptes, memberships, employés de base, paramètres org, audit accès |
| `timeclock` | Pointage | Add-on | `horodateur_*`, zones QR, exceptions |
| `operations` | Opérations | Add-on | livraisons, ramassages, terrain, disponibilités flotte |
| `gps` | GPS | Add-on | `gps_positions`, `gps_bases` |
| `documents` | Documents | Add-on | dossiers, photos, `operation_proofs`, archives |
| `alerts` | Alertes | Add-on | `app_alerts`, SMS, communications templates |
| `commission_book` | Livre de commissions | **Premium** | `compensation_*`, grants livre, objectifs/commissions liés |
| `payroll` | Rémunération | **Premium** | paie, temps travaillé / interco (aujourd’hui `temps_titan`, facturation Titan) |
| `reports` | Rapports | Add-on | synthèses / exports |

**Règle :** Livre de commissions et Rémunération sont **Premium activables par organisation**.

---

## Entitlements

Un entitlement = « l’organisation X a le droit d’utiliser le module Y » (éventuellement jusqu’à une date, avec quota).

Sources possibles :

1. Plan d’abonnement (mirror Stripe) — SaaS 5
2. Attribution manuelle plateforme (pilote facturé manuellement) — **autorisée pour SaaS 8**, mais la **table entitlements doit exister avant le pilote** (SaaS 3)

Feature flags tenant : overrides temporaires (beta), distincts des entitlements contractuels.

---

## Quotas (cible)

| Métrique | Usage |
|----------|--------|
| Sièges utilisateurs actifs | Plan |
| Stockage fichiers | Documents |
| SMS / notifications | Alertes |
| Événements commission / mois | Premium commission_book |

Dépassement : soft-warn puis blocage écriture selon politique plan.

---

## Suspension

Si org `suspended` ou entitlement révoqué :

- **API** : HTTP 402/403 métier explicite sur routes du module
- **UI** : module masqué ou écran « non inclus dans votre forfait »
- **Core** : reste accessible pour régularisation / export (politique à valider Martin)

---

## Comportement module non inclus

| Couche | Comportement |
|--------|----------------|
| Navigation | Entrée absente ou badge « non inclus » |
| Page directe | Écran d’upsell / contact, **pas** de data leak |
| API | Refus serveur **avant** query (entitlement check) — ne pas se fier au seul masquage UI |
| Jobs | Skip org sans entitlement |

Alignement avec permissions actuelles : entitlement **ET** permission rôle.

---

## Simulateur QA

Le simulateur Livre de commissions (`compensation-qa.shared.ts`, route `qa-simulate-event`) reste **staging-only**, hors entitlements clients, interdit production client.

---

## Conséquences

- SaaS 3 crée le catalogue + entitlements avant Stripe complet.
- Renommage UI Titan n’est pas un entitlement : c’est du branding / dette (SaaS 6).
