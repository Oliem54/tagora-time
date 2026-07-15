# TAGORA Time — SaaS 1B.1B H5-E2D — Grants vue direction_terrain_positions (2026-07-15)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time`)  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `95732730774240285d55e55971cde2dd72a84375`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

---

## 1. Objectif

Valider le contrat H5-D2 de `public.direction_terrain_positions` et durcir **uniquement** ses ACL.

---

## 2. Contrat H5-D2 (staging)

| Champ | Valeur |
|-------|--------|
| Relkind | `v` |
| Owner | `postgres` |
| security_invoker | `true` |
| Colonnes | **18** (ordre canonique) |
| Branches | gps / sortie_depart / sortie_retour / horodateur |
| Horodateur | `c.auth_user_id`, `he.employee_id`, join `c.id = he.employee_id` |
| `he.user_id` | **absent** |
| view_md5 | `6bda9e7d17e75f5be56adec6cac0999e` (avant = après) |
| Lignes | 0 |

---

## 3. Migration

| Champ | Valeur |
|-------|--------|
| Fichier | `supabase/migrations/20260715160000_h5e2d_harden_direction_terrain_view_grants.sql` |
| Version | `20260715160000` |
| SHA-256 | `0258AF70EB2FE7DA85EDDE7495EF3DCB891C80B21CE0788A243B51F1A8951B8F` |

Pas de CREATE/DROP/REPLACE VIEW.

---

## 4. ACL avant / après

### Avant
anon + authenticated + service_role : SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER  
postgres : all (owner)

### Après
| Grantee | Privileges |
|---------|------------|
| PUBLIC / anon | **aucun** |
| authenticated | **SELECT** seulement |
| service_role | **SELECT** seulement |
| postgres | inchangé |

---

## 5. Matrice d’accès (locale, ROLLBACK)

| Acteur | Résultat |
|--------|----------|
| Anon | SELECT refusé ACL |
| Employé + terrain | lignes propres GPS/sortie/HE ; **0** cross-employee |
| Employé sans terrain | HE propre seulement ; GPS/sorties = 0 ; **0** cross |
| Direction + terrain | GPS/sorties/HE visibles (≥2 fixtures) |
| Direction sans terrain | **0** ligne |
| Admin sans terrain | sorties/HE OK ; **GPS = 0** (policy GPS = direction+terrain OU employé propre — admin non couvert) |
| Admin avec terrain | sorties/HE OK ; **GPS = 0** (même écart policy) |
| service_role | SELECT OK |
| Écriture authenticated | refusée |

Écart Admin/GPS : RLS sous-jacente `gps_positions` — **hors scope H5-E2D** (lot séparé éventuel). Aucune fuite cross-employee.

---

## 6. Snapshots (hors Git)

| Fichier | SHA-256 |
|---------|---------|
| view before/after | `561AF8DF…940B` (=) |
| columns before/after | `A25C522D…0B6D` (=) |
| acl-before | `AAE4FFA27C3673CD2ABF7D3BF87CEF851F10D780911D43E754D0B385A2D20A67` |
| acl-after | `3D6E7EE3DC9266FBBA51CD515E11173ABAD460CF53A829BEA67EE69CF89E67C3` |
| dependencies | `F18442B9…9A7A` (=) |
| underlying-policies | `C2C8BE58…06CB` (=) |
| helpers | `694C0177…D4FE` (=) |

---

## 7. Exécution

### Reset local
- `127.0.0.1` ; **PASS** ; **92** migrations

### Staging
- Project ● `qokyobcvplzufshydhih`
- TX ACL COMMIT ; définition vue inchangée
- `migration repair 20260715160000 --status applied --linked` uniquement
- Historiques `2912`/`2913` pending ; H4 pending = 6

### Non-régression
- test:ci / lint 0 erreur / build / diff --check

---

## 8. Limites / rollback

- Isolation tenant = **H4**
- Ne jamais restaurer anon ; ne jamais recréer depuis `29130000`
- H5-E2A/B/C inchangés
- H5-F / feature / production protégés
- V1 : **51 %**
- Rollback ACL : snapshots TEMP sous mandat distinct ; repair reverted = history-only

---

## 9. Verdict

**GO H5-E2D — VUE DIRECTION TERRAIN ET GRANTS VALIDÉS**

H5-E forward-only **complet**. Prochaine étape unique : **H5-F** (mandat distinct).
