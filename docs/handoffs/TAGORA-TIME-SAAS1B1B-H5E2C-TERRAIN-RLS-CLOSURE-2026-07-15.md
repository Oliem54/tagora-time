# TAGORA Time — SaaS 1B.1B H5-E2C — Fermeture RLS fail-open terrain / Horodateur (2026-07-15)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time`)  
**Poste :** Maison  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `5fb81fbc76d10f7378e41adeeb128c3b7e9c11ae`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

---

## 1. Objectif

Fermer les six policies fail-open publiques et poser un contrat RLS authentifié pour :

- `horodateur_events` / `shifts` / `current_state` / `exceptions` (SELECT only) ;
- `chauffeurs` (SELECT) ;
- `sorties_terrain` (SELECT/INSERT/UPDATE + DELETE Direction/Admin).

---

## 2. Policies avant (staging)

| Table | Policy | Cmd | Roles | USING / CHECK |
|-------|--------|-----|-------|---------------|
| chauffeurs | `allow all ` *(espace final)* | ALL | public | true / true |
| sorties_terrain | `allow all ` | ALL | public | true / true |
| horodateur_events | `horodateur_events_select` | SELECT | public | true |
| horodateur_events | `horodateur_events_insert` | INSERT | public | CHECK true |
| horodateur_events | `horodateur_events_update` | UPDATE | public | true / true |
| horodateur_events | `horodateur_events_delete` | DELETE | public | true |
| horodateur_events | `events_select` | SELECT | authenticated | employee_id own |
| horodateur_shifts | `shifts_select` | SELECT | authenticated | own |
| horodateur_current_state | `state_select` | SELECT | authenticated | own |
| horodateur_exceptions | `exceptions_select` | SELECT | authenticated | own |

FAIL RLS : enabled ; FORCE : off. Orphelins employee_id : **0**. Rows HE/sorties : **0** ; chauffeurs : **2** (agrégat).

---

## 3. Accès applicatifs validés

| Surface | Client | Tables |
|---------|--------|--------|
| Direction terrain | user JWT | vue, chauffeurs, sorties, HE |
| Direction sorties | user JWT | CRUD sorties + SELECT chauffeurs |
| Employé terrain | user JWT | SELECT/INSERT/UPDATE propres sorties (`user_id`) |
| Horodateur métier | **service_role** (admin client) | événements / shifts / state / exceptions |

Aucune dépendance légitime aux policies `public true`.

---

## 4. Matrice d’accès cible

| Surface | Employé propre | Employé autre | Dir+terrain | Dir sans terrain | Admin | Anon | service_role |
|---------|----------------|---------------|-------------|------------------|-------|------|--------------|
| chauffeurs SELECT | oui | non | oui | non* | oui | non | oui |
| sorties SELECT | oui (+terrain) | non | oui | non | oui | non | oui |
| sorties INSERT/UPDATE | oui (+terrain) | non | oui | non | oui | non | oui |
| sorties DELETE | non | non | oui | non | oui | non | oui |
| HE/shifts/state/exc SELECT | oui | non | oui | non | oui | non | oui |
| HE I/U/D authenticated | non | non | non | non | non | non | oui |

Refus **cross-employee** explicite : un employé ne lit/écrit jamais les lignes d’un autre.

\*Sur staging post-E2C. En local, policies finance Direction (`ressources`/`livraisons`) peuvent rester additives hors fail-open.

---

## 5. Migration

| Champ | Valeur |
|-------|--------|
| Fichier | `supabase/migrations/20260715140000_h5e2c_close_terrain_fail_open_policies.sql` |
| Version | `20260715140000` |
| SHA-256 | `7C9180AA9E95B6A8D3B42F6537EF36F7EC2FC0ECE927CF7C3A4A1CB0FF5325C6` |

Fail-open retirées (noms exacts) :

1. `horodateur_events_select`
2. `horodateur_events_insert`
3. `horodateur_events_update`
4. `horodateur_events_delete`
5. `allow all ` on chauffeurs
6. `allow all ` on sorties_terrain

Policies après (noms sans espace final) : `*_select_phase1` (×4), `chauffeurs_select_h5e2c`, `sorties_terrain_{select,insert,update,delete}_h5e2c`.

Helpers / vue / grants / FORCE : **inchangés**.

---

## 6. Snapshots avant (hors Git)

| Fichier | SHA-256 fichier |
|---------|-----------------|
| `%TEMP%\tagora-time-h5e2c-policies-before-2026-07-15.sql` | `A623D8883C8C3BB1F6627FBD3575DFA2B8E2E7D6D8F37A5292B37096D3D706C8` |
| `%TEMP%\tagora-time-h5e2c-grants-before-2026-07-15.txt` | `74C30C14917A6AEF020770A8EF5D802EC93FFB9410C465267EB33BCEA0ED5AEA` |
| `%TEMP%\tagora-time-h5e2c-view-before-2026-07-15.sql` | `C033F3FA94D8F706E12C55FE4E45D452A74CF870351B6ACD1C46198981B2ECA0` |
| `%TEMP%\tagora-time-h5e2c-helpers-hash-before-2026-07-15.txt` | `5E92C5C0452B7A51A58CC438451E9B91E63E8B0D88DBF30C2B075F8BC136E8E9` |

Helpers sha : `e81060876595b3858f88c636d3ba2861aed0404ebb8e8c990aafa7ea92b1ad63`  
Vue sha : `9aff5841040669bf4acb3528ad997751064915b849f6358e7e6c6c24a64b30b7`

---

## 7. Exécution

### Reset local
- Cible `127.0.0.1` ; `npx supabase db reset --local` **PASS**
- Migrations locales : **90** (H5-E2C incluse)
- Fail-open true/public : **0** ; policies sécurisées : **9**

### RLS TX locale (ROLLBACK)
Employé A (+terrain) : voit 1/1 chauffeur/sortei/HE propres ; insert propre OK ; insert/update cross refusés ; DELETE refusé ; HE insert direct refusé.  
Direction+terrain : voit 2 chauffeurs / HE ; CRUD sorties OK.  
Direction sans terrain (JWT `sub` propre) : **0** accès.  
Admin : OK. Anon : refusé. service_role : OK.

### Staging
- Project ● `qokyobcvplzufshydhih` ; TX + gates **COMMIT**
- `migration repair 20260715140000 --status applied --linked` **uniquement**
- Helpers sha avant=après `e8106087…ad63`
- Vue sha avant=après `9aff5841…4b30b7`
- Grants avant=après (identique bit-à-bit)
- Historiques `2912`/`2913`/`18141000` **pending** ; H4 pending = 6

Snapshots après :

| Fichier | SHA-256 fichier |
|---------|-----------------|
| `%TEMP%\tagora-time-h5e2c-policies-after-2026-07-15.sql` | `3BFA71E8D117DDCF90F9B790C3CC28DBB88B96A591DAA64AD7C311DB7A7E08A9` |
| `%TEMP%\tagora-time-h5e2c-grants-after-2026-07-15.txt` | `74C30C14917A6AEF020770A8EF5D802EC93FFB9410C465267EB33BCEA0ED5AEA` |
| `%TEMP%\tagora-time-h5e2c-view-after-2026-07-15.sql` | `C033F3FA94D8F706E12C55FE4E45D452A74CF870351B6ACD1C46198981B2ECA0` |
| `%TEMP%\tagora-time-h5e2c-helpers-hash-after-2026-07-15.txt` | `5E92C5C0452B7A51A58CC438451E9B91E63E8B0D88DBF30C2B075F8BC136E8E9` |

---

## 8. Limites

- Isolation organisationnelle complète = **H4**.
- Ne jamais restaurer policies `public true`.
- H5-E2B/D, H5-F, feature : protégés.
- Production intacte.
- V1 : **51 %**.

---

## 9. Rollback

1. Restaurer policies depuis snapshot TEMP (mandat séparé).
2. **Interdit** de restaurer fail-open public true.
3. `migration repair 20260715140000 --status reverted` = history-only.

---

## 10. Verdict

**GO H5-E2C — POLICIES FAIL-OPEN TERRAIN/HORODATEUR FERMÉES ET VALIDÉES**

Prochaine étape unique : **H5-E2D** (mandat distinct).
H5-E2B exécuté : `TAGORA-TIME-SAAS1B1B-H5E2B-ACCOUNT-REQUESTS-TEMPS-TITAN-RLS-2026-07-15.md`.
