# SAAS-1 — Role mapping

**Statut :** PROPOSÉ / NON IMPLÉMENTÉ  
Compatible SaaS 0 ADR-003.

Ne pas confondre :

| Concept | Définition |
|---------|------------|
| Rôle plateforme | `platform_access` |
| Rôle organisation | `organization_memberships.role` |
| Permission module | capacité fine (documents, terrain, …) |
| Entitlement commercial | module vendu/activé (SaaS 3) |
| Permission sensible | finance, commissions $, salaires, GPS détaillé |
| État membre | `active` / `suspended` / … |
| Compagnie interne | `organization_companies` |

---

## 1. Rôles EXISTANTS → cibles

| EXISTANT (JWT) | Cible membership Groupe Oliem | Notes |
|----------------|-------------------------------|-------|
| `admin` | `organization_admin` ; **un** compte fondateur → aussi `organization_owner` | `admin_finance` aujourd’hui = être `admin` |
| `direction` | `direction` | MFA conservée |
| `employe` (+ aliases employee/chauffeur) | `employe` | |
| `manager` (legacy alias) | `direction` | via normalize actuel |

`platform_super_admin` : **nouveau**, table `platform_access` — **pas** un membership client.

---

## 2. Permissions modules EXISTANTES

Fichier : `src/app/lib/auth/permissions.ts`

| Permission JWT actuelle | Cible |
|-------------------------|--------|
| `documents`, `dossiers`, `terrain`, `livraisons`, `ressources`, `commissions` | Rester des **permissions org-scoped** (table ou metadata membership) **et** exiger entitlement module quand SaaS 3 existe |
| `admin_finance` (effet via rôle admin) | Permission sensible `finance` / rôles owner|admin + entitlement `payroll` / `commission_book` |

### Accès commissions EXISTANT

- Admin finance UI/API  
- Grants Direction : `commission_book_access_grants` (`sales-book-grants.server.ts`)  
- Employé : son livre  

**Cible :** mêmes règles **dans** l’org + entitlement Premium `commission_book`.

### Accès rémunération EXISTANT

- Routes `/admin/paie*`, `temps-titan*`, `facturation-titan*` — admin only  

**Cible :** entitlement Premium `payroll` + rôle finance org ; renommage Titan en SaaS 6.

---

## 3. Comptes inactifs / archivés

| État EXISTANT | Mapping proposé |
|---------------|-----------------|
| `account_requests` refused / error | Pas de membership actif |
| Chauffeur inactif / désactivé | Membership `suspended` ou pas de portal |
| Auth user disabled | Pas d’accès ; membership status aligné |

---

## 4. Garde-fous

| Règle | Proposition |
|-------|-------------|
| Dernier admin | Étendre le garde-fou actuel au **dernier `organization_owner` actif** (+ éventuellement dernier admin) |
| Plusieurs owners | **Oui** (décision Martin) ; minimum un owner actif |
| Suppression owner | **Non** sans transfert préalable |
| Révocation membership | Invalider cookie org + caches ; ne pas se fier au JWT périmé |

---

## 5. Stratégie de transition (implémentation future)

**Dual-run JWT — autorisé temporairement (Martin) pendant SaaS 1B.**

1. **Dual-read** : si membership + org active validés → rôle membership ; sinon fallback JWT global **uniquement** pour préserver l’app legacy pendant la fenêtre contrôlée  
2. Écrire memberships (seed) sans couper encore le JWT runtime  
3. JWT = hint seulement ; **pas** vérité tenant/permissions  
4. Couper le fallback JWT global après **critères de sortie** (voir `SAAS-1-OPEN-DECISIONS.md` §10) + GO Martin  
5. Mettre à jour RLS métier tenant-aware en **SaaS 2**  

**NON IMPLÉMENTÉ** dans 1A ; 1B = fondation + dual-run préparé, pas coupure JWT.
