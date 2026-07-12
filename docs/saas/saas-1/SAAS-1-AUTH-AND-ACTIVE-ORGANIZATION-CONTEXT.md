# SAAS-1 — Auth and active organization context

**Statut :** EXISTANT inventorié + PROPOSÉ pour le contexte org  
**NON IMPLÉMENTÉ**

---

## 1. Modèle EXISTANT

### Identité

| Composant | Réalité |
|-----------|---------|
| Utilisateur | Supabase `auth.users` uniquement |
| Table `profiles` | **Absente** |
| Employé | `public.chauffeurs` + `auth_user_id` → `auth.users` |
| File d’attente comptes | `public.account_requests` (`supabase/account_requests.sql`) |
| Rôle | JWT : préfère `app_metadata.role`, fallback `user_metadata.role` — `src/app/lib/auth/roles.ts` |
| Permissions modules | `app_metadata.permissions` — `src/app/lib/auth/permissions.ts` |
| Finance | `admin` only — `src/app/lib/auth/admin-finance.ts` |
| RLS SQL | `current_app_role()`, `is_admin_user()`, `is_direction_or_admin()` — redefine `20260525120000_phase_2b_2_finance_rls_views.sql` (**app_metadata only**) |
| MFA | Obligatoire `admin` + `direction` — `mfa.shared.ts`, `middleware.ts` |
| Dernier admin | Garde-fou **applicatif** : `portal-account/route.ts`, `employee-portal-dissociate.server.ts` — **pas** de trigger SQL |
| Invitations | (1) account-requests invite Auth (2) portal invite + colonnes `chauffeurs.account_invitation_*` |

### Sources de vérité actuelles

| Question | Source de vérité |
|----------|------------------|
| Qui est l’utilisateur ? | `auth.users` |
| Quel rôle applicatif ? | JWT `app_metadata.role` (global) |
| Quel employé RH ? | `chauffeurs` (lien `auth_user_id` / metadata `chauffeur_id`) |
| Compagnie ? | Enum texte Oliem/Titan sur lignes / flags |

### Doublons / écarts EXISTANTS

Documentés dans `employee-accounts-registry.shared.ts` : auth sans chauffeur, chauffeur sans auth, emails divergents, deux canaux d’invitation, `admin` hors `account_requests.assigned_role`.

### Routes qui supposent un rôle global

- Layouts `AuthGate` : `admin/layout`, `direction/layout`, `employe/layout`
- `getDashboardPathForRole` / login paths — `roles.ts`
- `getAuthenticatedRequestUser` / direction strict — `account-requests.server.ts`
- MFA middleware par rôle JWT
- Quasi toutes les API qui testent `role === "admin" | "direction"`
- RLS SQL basées sur `current_app_role()`

**Risque passage membership :** ces chemins cassent ou mentent tant que JWT global et membership org ne sont pas dual-run / migrés.

---

## 2. Contexte d’organisation active — PROPOSÉ

### Exigences

- Utilisateur **multi-org** possible  
- Org par défaut (`memberships.is_default`)  
- Changement d’org explicite  
- **Fail closed**  
- Aucune confiance dans une valeur client non validée  
- Couvre : middleware, Server Components, API routes, jobs, cron, service role  

### Options comparées

| Option | Avantages | Risques |
|--------|-----------|---------|
| Claim JWT `organization_id` seul | Rapide | Périmé après révocation ; trop de confiance |
| Cookie HttpOnly signé | UX switch org | Doit être revalidé vs DB |
| Session applicative serveur | Contrôle | Infra session |
| Param route / header client | Simple | Spoofing si non validé |
| Lookup membership chaque requête | Toujours frais | Coût ; cache court OK |
| **Combinaison (retenue)** | Sécurité + UX | Un peu plus de code |

### Combinaison — DÉCIDÉE Martin

1. **Préférence** stockée : cookie HttpOnly sécurisé (ex. `tt_active_org`) = `organization_id` (sinon `memberships.is_default`).  
2. **À chaque requête authentifiée métier — revalidation DB obligatoire :**  
   - utilisateur authentifié  
   - membership **actif** pour cette org  
   - organisation **active** (pas suspended/deleted)  
   - rôle autorisé pour l’action  
   - entitlement requis **lorsque pertinent** (SaaS 3+)  
   - sinon → **403 fail closed**  
3. **JWT :** hint de transition **non autoritatif** uniquement ; **jamais** source de vérité tenant ou permissionnelle.  
4. **Permissions / membership :** toujours DB (cache TTL court invalidé à révocation autorisé).  
5. **Jobs / cron / service role :** `organization_id` **explicite** ou boucle multi-org documentée — jamais « org du cookie » magique.

### Ce qui ne doit PAS aller dans le JWT comme vérité longue durée

- Liste complète des permissions  
- Entitlements commerciaux  
- Memberships (sauf hint)  
- Accès support plateforme  

---

## 3. Helpers futurs — PROPOSÉ (noms, non codés)

| Helper | Rôle |
|--------|------|
| `requireAuthenticatedUser()` | Session valide ; sinon 401 |
| `requireActiveOrganization()` | Org résolue + active ; sinon 403 |
| `requireOrganizationMembership()` | User ∈ org ; status active |
| `requireOrganizationRole(...roles)` | Rôle membership ∈ liste |
| `requireModuleEntitlement(module)` | SaaS 3+ ; stub refuse-closed si absent |
| `createTenantScopedClient(orgId)` | Wrapper queries avec filtre org obligatoire |
| `requirePlatformAccess(level)` | `platform_access` actif non expiré + audit trail |

Client utilisateur + RLS (SaaS 2) reste l’idéal ; service role reste l’exception (voir inventaire).

---

## 4. Utilisateur sans membership

**Décidé Martin :** compte Auth peut exister **sans** membership pendant invitation/onboarding **uniquement**, **sans aucun accès métier** (fail closed sur `requireActiveOrganization`).

---

## 5. MFA (évolution)

| Aujourd’hui | Cible |
|-------------|--------|
| MFA si JWT role admin/direction | MFA si membership role ∈ owner/admin/direction **ou** platform_access |

Bypass staging : reste staging-only (`mfa.shared.ts`).
