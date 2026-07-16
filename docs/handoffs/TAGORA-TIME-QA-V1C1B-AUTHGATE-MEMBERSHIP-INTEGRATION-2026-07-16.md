# TAGORA Time — QA V1-C1B — AuthGate ↔ H4 memberships (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Bureau  
**Branche :** `feature/sales-book-grants`  
**HEAD avant :** `be4578ed47d3e3f39886220fa3d998a408f6e890`  
**Staging :** `qokyobcvplzufshydhih`  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **77 % → 77 %**

**Verdict :** **GO QA V1-C1B — AUTHGATE RACCORDÉ AUX MEMBERSHIPS H4, QA EMPLOYÉ VALIDÉE**

---

## 1. Écart initial (QA V1-C1)

- Auth : session OK pour QA-USER-2  
- H4 : membership `employe` actif  
- AuthGate / APIs : lisaient uniquement JWT `app_metadata.role`  
- JWT historique : `none` → refus Employé malgré H4  

---

## 2. Contrat figé

| Couche | Source |
|--------|--------|
| Authentification | Supabase Auth (session) |
| Autorisation organisationnelle | `organization_memberships` (actif) + organisation `active` |
| JWT historique | diagnostic seulement — **n’autorise jamais** un non-membre |
| Finance | garde-fou JWT `admin` conservé (`hasAdminFinanceAccess`) |
| Plateforme | `platform_access` seul → aucun accès métier |

Résolution org active : `is_default` → sinon membership actif unique → sinon refus `membership_ambiguous`.

---

## 3. Fichiers livrés

| Fichier | Rôle |
|---------|------|
| `src/app/lib/saas/organization-membership.shared.ts` | sélection membership |
| `src/app/lib/saas/organization-membership.server.ts` | résolution serveur H4 |
| `src/app/lib/auth/organization-role-mapping.shared.ts` | map H4 → AppRole + hiérarchie zones |
| `src/app/api/auth/session-context/route.ts` | contexte pour AuthGate |
| `src/app/lib/auth/session-context.client.ts` | client fetch |
| `src/app/components/AuthGate.tsx` | raccord membership |
| `src/app/account/AccountAuthGate.tsx` | idem compte |
| `src/app/lib/account-requests.server.ts` | `getAuthenticatedRequestUser` → rôle H4 |

Aucune migration. Aucune modification Auth / memberships staging / RLS / grants.

---

## 4. Mapping H4 → AppRole

| Membership H4 | AppRole shell |
|---------------|---------------|
| `organization_owner` | `admin` |
| `organization_admin` | `admin` |
| `direction` | `direction` |
| `employe` | `employe` |

Hiérarchie zones : admin ≥ direction ≥ employe (Employé autorise aussi direction/admin).

---

## 5. Preuve fonctionnelle staging (QA-USER-2)

| Contrôle | Résultat |
|----------|----------|
| JWT historique | toujours `none` (Auth non modifié) |
| `GET /api/auth/session-context` | **200** `authorized=true` `appRole=employe` `source=membership` |
| `GET /api/employe/effectifs/mon-horaire` | **200** (était 403 avant correctif) |
| Direction / Admin / Compensation UI | pas de payload métier confidentiel |
| Memberships | **4** inchangé |
| Auth users | **4** |
| Storage | **0** |
| platform_access | **0** |

---

## 6. Dette restante

- `resolveDirectionRequestUser` / MFA middleware restent partiellement JWT (Owner/Admin/Direction → QA V1-C2).  
- Permissions modules hors finance restent listées dans JWT (membership n’invente pas les permissions terrain/livraisons).  
- Storage conserve son sélecteur `storage_compat` (non régressé).

---

## 7. Prochaine étape

**QA V1-C2** — Owner / Admin / Direction (ne pas démarrer automatiquement).

**Avancement V1 : 77 % → 77 %**
