# TAGORA Time — QA V1-C2 — Owner / Admin / Direction access (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Maison  
**Branche :** `feature/sales-book-grants`  
**HEAD avant :** `053dd39450da0c9fbbe5dfd834ea6455517188b7`  
**Commit :** `fix(auth): authorize routes from organization memberships`  
**Staging :** `qokyobcvplzufshydhih`  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`  
**Tenant QA :** `TAGORA Time QA V1` / slug `tagora-time-qa-v1`

**Avancement V1 :** **77 % → 77 %**

**Verdict :** **GO QA V1-C2 — OWNER, ADMIN ET DIRECTION VALIDÉS SUR MEMBERSHIPS H4**

---

## 1. Baseline staging (lecture seule)

| Agrégat | Avant | Après |
|---------|------:|------:|
| organizations (slug QA) | 1 | 1 |
| organization_settings | 1 | 1 |
| organization_companies | 0 | 0 |
| organization_memberships | 4 | 4 |
| owner / admin / direction / employe actifs | 1 / 1 / 1 / 1 | inchangé |
| invitations | 0 | 0 |
| platform_access / audit | 0 / 0 | 0 / 0 |
| Auth users | 4 | 4 |
| Storage `photos-dossiers` | 0 | 0 |

Snapshot TEMP baseline SHA-256 : `873D791832417B7D427EB09A120D8F41C3C5CB214F69D0F39C2434935E281B1A`  
Preuve TEMP SHA-256 : `F3B2F98A15AF76534C844F24A8261359EB884D6E980D0DC433777C3B6F1BE83F`

Données métier préexistantes hors création C2 (non modifiées) : chauffeurs / compensation_events déjà présents sur staging.

---

## 2. Contrat d’autorisation réel (code)

| Couche | Source |
|--------|--------|
| AuthGate zones | `GET /api/auth/session-context` → `resolveOrganizationAuthContextForUser` → **membership H4** |
| Mapping H4 → AppRole | owner/admin → `admin` ; direction → `direction` ; employe → `employe` |
| Hiérarchie zones | admin ≥ direction ≥ employe (`appRoleMatchesArea`) |
| JWT historique | diagnostic seulement — **n’autorise jamais** un non-membre |
| Compensation / finance | `hasAdminFinanceAccess` = **JWT `admin` uniquement** |
| Plateforme | `platform_access` distinct — aucun accès métier implicite |
| APIs Direction strictes | `getStrictDirectionRequestUser` encore **JWT** direction/admin (dette documentée) |
| Dernier owner | trigger H4-B2 `enforce_organization_has_owner` (non exercé en écriture ici) |

### Matrice réelle des surfaces

| Surface | Employé | Direction | Admin (org) | Owner | Garde-fou additionnel |
|---------|--------:|----------:|------------:|------:|------------------------|
| Employé (AuthGate) | oui | oui | oui | oui | API horaire peut rester réservée employé |
| Direction (AuthGate) | non | oui | oui | oui | — |
| Admin (AuthGate) | non | non | oui | oui | — |
| Utilisateurs (UI Direction) | non | oui* | oui* | oui* | *APIs listes : JWT direction/admin + marqueur navigateur |
| Compensation `/admin/compensation/*` | non | non | non† | oui‡ | †JWT≠admin ; ‡JWT admin historique Owner |
| Plateforme | refus | refus | refus | refus | `platform_access` = 0 |

---

## 3. Méthode de preuve (sans PII)

- Sessions **éphémères** magic-link admin (aucune modification `app_metadata` / membership).  
- `GET` seulement vers le serveur local pointant staging.  
- Aucun POST / PATCH / PUT / DELETE.  
- Comptes anonymisés QA-USER-1..4.  
- Aucun UUID / courriel / token affiché.

---

## 4. Résultats par rôle

### QA-USER-2 — Employé (référence C1B)

| Contrôle | Résultat |
|----------|----------|
| JWT historique | `none` |
| Membership H4 | `employe` |
| `session-context` | **200** `authorized` `appRole=employe` `source=membership` |
| Zone Employé | oui |
| Zone Direction / Admin | non |
| Compensation finance | non |
| `GET /api/employe/effectifs/mon-horaire` | **200** |
| `GET /api/account-requests/pending-count` | **403** |
| Élévation | **aucune** |

### QA-USER-4 — Direction

| Contrôle | Résultat |
|----------|----------|
| JWT historique | `direction` |
| Membership H4 | `direction` |
| `session-context` | **200** `appRole=direction` `source=membership` |
| Zones Employé / Direction / Admin | oui / oui / **non** |
| Compensation finance | non |
| `pending-count` | **200** |
| JWT élève au-dessus de H4 | **non** |

### QA-USER-3 — organization_admin

| Contrôle | Résultat |
|----------|----------|
| JWT historique | `direction` (inférieur au shell Admin) |
| Membership H4 | `organization_admin` |
| `session-context` | **200** `appRole=admin` `source=membership` |
| Zones Employé / Direction / Admin | oui / oui / **oui** |
| Compensation finance | **non** (JWT ≠ admin — garde-fou conservé) |
| `pending-count` / admin count | **200** |
| Élévation Admin → Owner | **non** (finance Owner non obtenue) |
| Memberships / Auth modifiés | **non** |

### QA-USER-1 — organization_owner

| Contrôle | Résultat |
|----------|----------|
| JWT historique | `admin` |
| Membership H4 | `organization_owner` |
| `session-context` | **200** `appRole=admin` `source=membership` |
| Zones Employé / Direction / Admin | oui / oui / oui |
| Compensation finance | **oui** (JWT admin + garde-fou) |
| Accès plateforme implicite | **non** (`platform_access=0`) |
| Isolation | org active unique = tenant QA ; pas de confiance `organization_id` client dans session-context |

---

## 5. Différence JWT historique / H4

| Compte | JWT | H4 | Autorisation AuthGate observée |
|--------|-----|----|--------------------------------|
| USER-2 | none | employe | employe (H4) |
| USER-4 | direction | direction | direction (H4) |
| USER-3 | direction | organization_admin | **admin** (H4 gagne sur JWT) |
| USER-1 | admin | organization_owner | admin (H4) ; finance via JWT admin |

Conclusion : **membership H4 = source de vérité** pour les zones AuthGate. Le JWT historique **ne réduit pas** un membership admin/owner valide et **n’élève pas** un employé.

---

## 6. APIs auditées (GET only)

- `/api/auth/session-context`  
- `/api/employe/effectifs/mon-horaire`  
- `/api/account-requests/pending-count`  
- `/api/admin/ameliorations-pending-count`  
- Tentatives `/api/account-requests` et `/api/direction/comptes-employes/registry` → **400** sans marqueur navigateur (garde anti-appel non navigateur ; pas une élévation)

`organization_id` falsifié : non accepté par session-context (org dérivée serveur du membership).

---

## 7. Limites de la passe

- Parcours UI navigateur complet non rejoué ici (MFA gate AuthGate possible pour direction/admin).  
- Preuves = sessions éphémères + GET API + simulation zones AuthGate.  
- `resolveDirectionRequestUser` demeure JWT pour certaines APIs Direction (dette) — les JWT QA direction/admin couvrent USER-3/4/1.  
- Protection dernier owner non exercée en écriture (interdit C2).  
- QA V1-C3 (métier + Storage) non commencé.

---

## 8. Protections

| Domaine | Statut |
|---------|--------|
| Auth / memberships | inchangés |
| platform_access | 0 |
| Storage | 0 |
| Écritures métier | aucune |
| Production | intacte |
| Feature | non merge |

---

## 9. Prochaine étape

**QA V1-C3** — parcours métier et Storage (mandat distinct) — **ne pas démarrer automatiquement**.

**Avancement V1 : 77 % → 77 %**
