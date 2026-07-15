# TAGORA Time — SaaS 1B.1B H5-E2B — Durcissement RLS account_requests / temps_titan (2026-07-15)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time`)  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `2b1c856d76dda59ed6ad5e7ba8c6d7dfe7b9cd19`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

---

## 1. Objectif

Durcir uniquement les policies RLS de :

1. `public.account_requests`
2. `public.temps_titan`

Forward-only ; aucune rejeu historique `20260429120000` / `20260429130000` ; H5-E2A / H5-E2C / helpers / vues / grants / Horodateur / chauffeurs / sorties_terrain inchangés.

---

## 2. Migration

| Champ | Valeur |
|-------|--------|
| Fichier | `supabase/migrations/20260715150000_h5e2b_harden_account_requests_temps_titan.sql` |
| Version | `20260715150000` |
| SHA-256 | `4426B1B1155367BACFB8E8B9F1787A7B47603BBB286CCA6643C562DC2BB72553` |

---

## 3. Policies avant (staging)

### account_requests
- `account_requests_insert_pending_public` (INSERT anon+authenticated)
- `account_requests_select_direction_admin`
- `account_requests_update_direction_admin`
- `account_requests_delete_direction_admin`

### temps_titan
- `temps_titan_select_direction_admin` (`is_direction_or_admin()` seulement — sans gate terrain)
- `temps_titan_insert_direction_admin`
- `temps_titan_update_direction_admin`

Pas de DELETE authenticated sur staging. Triggers DB liés aux deux tables : **0** (notifications via API hors SQL — non appelées).

Agrégats staging (sans PII) : AR n=2 (active) ; TT n=0.

Doublons locaux prouvés (phase finance `20260525120000`, absents staging) également droppés : `temps_titan_admin_{select,insert,update,delete}` + aliases `temps_titan_*_policy`.

---

## 4. Contrat public account_requests (après)

| Règle | Valeur |
|-------|--------|
| INSERT | anon + authenticated |
| Status | `pending` obligatoire |
| assigned_role | interdit (NULL) |
| assigned_permissions | NULL ou vide |
| review_note / reviewed_by / reviewed_at | interdits |
| invited_user_id | interdit |
| review_lock_token / review_started_at | interdits |
| last_error | interdit |
| company | `oliem_solutions` \| `titan_produits_industriels` |
| portal_source | `employe` \| `direction` |
| requested_role | `employe` \| `direction` |
| requested_permissions | sous-ensemble catalogue ; **sans doublon** |
| audit_log | tableau JSON ; longueur max **1** ; si présent : `event=request_submitted`, `actor=requester` |
| SELECT / UPDATE / DELETE public | **refusés** |
| Gestion authenticated | `is_direction_or_admin()` seulement |

Policies après : `account_requests_*_h5e2b`.

---

## 5. Matrice temps_titan (après)

| Acteur | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| Admin | oui | oui | oui | non (pas de policy auth) |
| Direction + terrain | oui | oui | oui | non |
| Direction sans terrain | non | non | non | non |
| Employé (+/− terrain) | non | non | non | non |
| Anon | non | non | non | non |
| service_role | oui (bypass RLS) | oui | oui | oui |

`has_app_permission('terrain')` **seul** ne suffit pas : Direction requise (sauf Admin).

Isolation Oliem/Titan en base : **non garantie avant H4**. H5-E2B réduit les rôles autorisés seulement.

Policies après : `temps_titan_{select,insert,update}_privileged_h5e2b`.

---

## 6. Snapshots avant (hors Git)

| Fichier | SHA-256 fichier |
|---------|-----------------|
| `%TEMP%\tagora-time-h5e2b-policies-before-2026-07-15.sql` | `50FF3C95B5D21400CD53B74240175CC2E11FCA20E2668D5CCEC43E205E0B14BF` |
| `%TEMP%\tagora-time-h5e2b-grants-before-2026-07-15.txt` | `1FA50BC81095290FDBCD57B9EDF557713B799D044E3C12F546BA1A83E1346D84` |
| `%TEMP%\tagora-time-h5e2b-account-constraints-before-2026-07-15.txt` | `2F1D624B64CCE57590A6ABE5BB1CF097A735C9A332447A569036E5942ADE59ED` |
| `%TEMP%\tagora-time-h5e2b-helpers-hash-before-2026-07-15.txt` | `694C0177405A65A225C3E9E6C08BCBFE952CFE91D30D11CE29D48E901801D4FE` |
| `%TEMP%\tagora-time-h5e2b-e2c-policies-hash-before-2026-07-15.txt` | `3B8552C58B76655CC628F6F0AC801C221E72B648A1D3F9B6738917FA1D1B95DA` |

---

## 7. Exécution

### Reset local
- Cible `127.0.0.1` ; `npx supabase db reset --local` **PASS**
- Migrations locales : **91** (H5-E2B incluse)
- H5-E2A / H5-E2C appliquées inchangées

### RLS TX locale (ROLLBACK)
- Anon INSERT pending valide OK ; SELECT/UPDATE/DELETE publics refusés
- Inserts invalides (status, assignations, review/lock/error, company, perms, audit) refusés
- Employé gestion AR refusée ; Direction / Admin gestion OK
- TT : Admin S/I/U OK ; Direction+terrain OK ; Direction sans terrain / Employé / Anon refusés
- DELETE authenticated absent ; service_role OK
- Fixtures QA : **0** après ROLLBACK

### Staging
- Project ● `qokyobcvplzufshydhih` ; production absente
- SQL isolé migration appliqué (DDL policies) ; validation RLS en TX **ROLLBACK** ; QA **0**
- `migration repair 20260715150000 --status applied --linked` **uniquement**
- Historiques `2912` / `2913` / `18141000` **pending** ; H4 pending = **6**
- Helpers hash avant=après (fichier SHA `694C0177…D4FE`)
- E2C policies hash avant=après (fichier SHA `3B8552C5…95DA`)
- Grants avant=après (fichier SHA `1FA50BC8…6D84`)
- Vue `direction_terrain_positions` non modifiée (présente ; md5 viewdef inventorié)

Snapshots après :

| Fichier | SHA-256 fichier |
|---------|-----------------|
| `%TEMP%\tagora-time-h5e2b-policies-after-2026-07-15.sql` | `1C23B48ED0503122A8C627A8A7D45F66850D2E52BB00E01E47125810E80FA606` |
| `%TEMP%\tagora-time-h5e2b-grants-after-2026-07-15.txt` | `1FA50BC81095290FDBCD57B9EDF557713B799D044E3C12F546BA1A83E1346D84` |
| `%TEMP%\tagora-time-h5e2b-helpers-hash-after-2026-07-15.txt` | `694C0177405A65A225C3E9E6C08BCBFE952CFE91D30D11CE29D48E901801D4FE` |
| `%TEMP%\tagora-time-h5e2b-e2c-policies-hash-after-2026-07-15.txt` | `3B8552C58B76655CC628F6F0AC801C221E72B648A1D3F9B6738917FA1D1B95DA` |

### Non-régression
- `npm run test:ci` : **428 PASS**
- lint : **0 erreur** (warnings préexistants hors H5-E2B)
- build : **PASS**
- `git diff --check` : **PASS**

---

## 8. Limites

- Isolation organisationnelle complète = **H4**.
- Ne jamais restaurer policy fail-open / USING true.
- H5-E2D, H5-F, feature, production : protégés.
- H5-E2A / H5-E2C : **inchangés**.
- V1 : **51 %**.

---

## 9. Rollback

1. Restaurer policies depuis snapshots TEMP (mandat séparé).
2. **Interdit** de restaurer toute policy fail-open / USING true.
3. `migration repair 20260715150000 --status reverted` = history-only (ne restaure pas les policies).
4. Aucune suppression de données.

---

## 10. Verdict

**GO H5-E2B — POLICIES ACCOUNT_REQUESTS ET TEMPS_TITAN DURCIES ET VALIDÉES**

Prochaine étape unique : **H5-E2D** exécuté — voir `TAGORA-TIME-SAAS1B1B-H5E2D-DIRECTION-TERRAIN-VIEW-GRANTS-2026-07-15.md`.
