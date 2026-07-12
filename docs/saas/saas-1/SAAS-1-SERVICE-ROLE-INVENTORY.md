# SAAS-1 — Service role inventory

**Statut :** inventaire EXISTANT + règles PROPOSÉES  
**Factory :** `src/app/lib/supabase/admin.ts` → `createAdminSupabaseClient()`  
**Ordre de grandeur :** **~103 fichiers** `src/` importent ce client (hors définition).

TAGORA Time n’est pas multi-tenant : aujourd’hui le service role + rôle JWT global = modèle de sécurité principal.

---

## 1. Règle future (PROPOSÉ)

> Toute route service role qui touche une donnée **tenant** doit recevoir et **valider** un `organization_id` explicite, sauf job **global plateforme** documenté, secret-gated et **audité**.

Interdit : « admin connecté ⇒ scan toute la base ».

---

## 2. Classification des usages

Légende :

| Classe | Signification |
|--------|----------------|
| **P** | Requis plateforme / Auth Admin API |
| **C** | Cron / webhook / token public |
| **R** | Remplaçable à terme par user client + RLS |
| **D** | Dangereux en SaaS si non scopé org |
| **O** | Nécessitera `organization_id` obligatoire |
| **A** | Nécessite journalisation / audit |

### Comptes / Auth — P, D, O, A

| Exemples | Notes |
|----------|--------|
| `api/account-requests/**` | Invite/createUser — Auth Admin requis |
| `employee-portal-invite.server.ts`, `employee-portal-dissociate.server.ts` | Lien chauffeur ↔ auth |
| `employee-accounts-registry.server.ts`, `account-reconcile.server.ts` | Registre écarts |
| `api/admin/employes/.../portal-account` | Rôles portal + last-admin |
| `api/auth/password/complete`, `api/security/mfa-*` | Sécurité compte |

### Horodateur — R/D/O (mixte)

| Exemples | Notes |
|----------|--------|
| `lib/horodateur-v1/repository.ts` (dense), `service.ts` | Gros volume service role |
| `api/horodateur/**`, `horodateur-gps-punch.server.ts` | Employé self pourrait être RLS plus tard |
| Direction live/registre/exceptions | Aujourd’hui bypass RLS |

### Livraisons / ramassages — C + R/D/O

| Exemples | Notes |
|----------|--------|
| `api/livraisons/**` | Ops |
| `direction/ramassages/_lib.ts` | |
| `api/internal/ramassages/check-overdue` | Cron — C, O (boucle orgs), A |
| `api/suivi/[token]` | Token public — C |

### Commissions / Compensation / paie — D, O, A

| Exemples | Notes |
|----------|--------|
| `compensation-events.repository.server.ts`, `accruals.repository.server.ts` | $ critique |
| `sales-book-grants.server.ts`, `direction/commissions/_lib.ts` | |
| `api/payroll/rebuild-intercompany` | Interco |

### GPS / effectifs / flotte / disponibilités — R/D/O

| Exemples | Notes |
|----------|--------|
| `api/gps/positions` | PII localisation |
| `api/direction/effectifs/**`, leave periods | RH |
| `api/disponibilites/**`, `ressources/fleet/**` | |

### Alertes / communications / améliorations — R/D/O

| Exemples | Notes |
|----------|--------|
| alert-center, communication templates | |
| `api/ameliorations/**`, `internal-mentions/**` | |

### Internes / tokens — C, P, A

| Exemples | Notes |
|----------|--------|
| `api/internal/horodateur/**`, `api/sms/inbound` | Secrets |
| `api/internal/resend/test` | Support — dangereux en prod client |
| `app-action-tokens.server.ts`, `app-action-handlers.server.ts` | |
| `terrain-sheet/confirm` | |

---

## 3. Compteurs pour le rapport

| Métrique | Valeur |
|----------|--------|
| Fichiers important `createAdminSupabaseClient` | **~103** |
| Catégories inventoriées ci-dessus | **8** domaines |
| Jobs typiquement « plateforme globale » | internal crons, sms inbound, token suivi |

---

## 4. Plan de réduction (post-1B, surtout SaaS 2)

1. Introduire `createTenantScopedClient(orgId)` qui refuse les queries sans filtre  
2. Migrer routes employé self-service vers session user + RLS  
3. Garder service role pour Auth Admin, crons, webhooks  
4. Revue PR : checklist tenant-safe (`../TENANT-SAFE-DEVELOPMENT-CHECKLIST.md`)
