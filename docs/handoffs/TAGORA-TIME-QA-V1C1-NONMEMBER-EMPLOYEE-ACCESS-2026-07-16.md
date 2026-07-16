# TAGORA Time — QA V1-C1 — Non-member fail-closed & employee limits (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Bureau  
**Branche :** `feature/sales-book-grants`  
**HEAD avant :** `87125ce8a777b8419a91e071a7f8871f59ba15f3`  
**Staging :** `qokyobcvplzufshydhih`  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **77 % → 77 %**

**Verdict :** **PARTIAL QA V1-C1 — MEMBERSHIP H4 VALIDÉ, AUTHGATE EMPLOYÉ NON RACCORDÉ AUX MEMBERSHIPS**

---

## 1. Contexte

Reprise après **GO QA V1-C1A** (environnement local staging validé).  
Aucun re-bootstrap V1-B. Aucune modification Auth. Aucune donnée métier. Aucun objet Storage.

---

## 2. Environnement & baseline

| Contrôle | Résultat |
|----------|----------|
| `.env.local` staging | oui (`qokyobcvplzufshydhih`) |
| Production dans env | non |
| Env ignoré Git | oui |
| organizations / settings / companies | 1 / 1 / 0 |
| memberships avant | **3** |
| Auth / Storage | 4 / 0 |
| QA-USER-2 avant | sans membership ; JWT `none` |

---

## 3. Routes testées

| Surface | Route | Non auth | Auth sans membership | Après membership H4 `employe` |
|---------|-------|----------|----------------------|-------------------------------|
| Employé | `/employe/dashboard` | refus (AuthGate shell) | refus (JWT `none` → signOut) | **refus** (AuthGate JWT toujours `none`) |
| Direction | `/direction/dashboard` | refus | refus | refus |
| Admin | `/admin/dashboard` | refus | refus | refus |
| Utilisateurs | `/direction/demandes-comptes`, `/direction/comptes-employes` | refus | refus | refus |
| Compensation | `/admin/compensation/ventes` | refus (pas de JSON métier) | refus | refus |
| Plateforme UI | aucune | N/A | N/A | N/A |

API représentative : `GET /api/employe/effectifs/mon-horaire` avec session QA-USER-2 → **403** (avant et après membership H4).

---

## 4. Fail-closed non-membre

- Session éphémère via magic link admin (**pas** de mot de passe affiché ; **pas** de changement `app_metadata`).
- JWT `none` → AuthGate signe hors / redirige login.
- Memberships totaux restent 3 pendant les tests négatifs.
- Preuve : `%TEMP%\tagora-time-qa-v1c1-nonmember-proof-2026-07-16.txt`  
  SHA-256 : `875324D9637F4527E625C45E405A52DACA5D7079406CD3CDD5EA2C6F3DA4EBA4`  
  Verdict preuve : **PASS**

---

## 5. Membership Employé (H4)

| Champ | Valeur |
|-------|--------|
| Script ajout | `%TEMP%\tagora-time-qa-v1c1-add-employee-2026-07-16.sql` |
| SHA ajout | `7259307D5AE125416719A9F06F790974FE984E29A85F021DFAE4457442D02987` |
| Script retrait (non exécuté) | `%TEMP%\tagora-time-qa-v1c1-remove-employee-2026-07-16.sql` |
| SHA retrait | `2755D4566D6CF0B3D3A917567ED93FF7CF6BC8EC9121BD85980CAE573E2D3DA8` |
| Rôle | `employe` |
| Statut | `active` |
| `is_default` | `false` |
| Memberships après | **4** |
| Owner / Admin / Direction | 1 / 1 / 1 (intacts) |
| Auth JWT après | toujours `none` (inchangé) |

---

## 6. Écart architecture (dette)

| Couche | Comportement observé |
|--------|----------------------|
| H4 `organization_memberships` | QA-USER-2 = `employe` actif sur `tagora-time-qa-v1` |
| AuthGate / APIs historiques | lit uniquement JWT `app_metadata.role` |
| Conséquence | membership H4 **ne débloque pas** `/employe/dashboard` tant que JWT reste `none` |
| Correctif | **hors mandat** — ne pas modifier Auth ici ; raccord AuthGate ↔ H4 à planifier |

Aucune élévation vers Direction / Admin / Compensation / plateforme.

---

## 7. Confirmations négatives

| Action | Statut |
|--------|--------|
| Invitation | non |
| `platform_access` | 0 |
| Donnée métier | non |
| Storage | 0 |
| Auth modifiée | non |
| Production touchée | non |
| Retrait Employé exécuté | non |
| Cleanup V1-B exécuté | non |

---

## 8. Prochaine étape

Selon verdict PARTIAL :

1. **Correctif AuthGate / runtime** pour consommer les memberships H4 (ou stratégie JWT alignée, sous mandat dédié) ;  
2. puis **QA V1-C2** (Owner / Admin / Direction) — **ne pas démarrer automatiquement**.

**Avancement V1 : 77 % → 77 %**
