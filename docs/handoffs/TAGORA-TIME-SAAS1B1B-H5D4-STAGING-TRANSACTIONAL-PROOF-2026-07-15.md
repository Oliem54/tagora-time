# TAGORA Time — SaaS 1B.1B H5-D4 preuve transactionnelle staging (2026-07-15)

**Agent :** Martin  
**Agent donneur :** Martin  
**Poste :** Maison  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `743a538b507a918f2d50285be355a729d0c84c37`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

**Staging (TX éphémère uniquement) :** `qokyobcvplzufshydhih`  
**Production :** **INTERDITE** — `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **51 %** (inchangé)

**Verdict :** `H5-D4 VALIDÉ — PREUVE TRANSACTIONNELLE STAGING RÉUSSIE, AUCUNE DONNÉE PERSISTANTE`

---

## 1. Prérequis

| Contrôle | Résultat |
|----------|----------|
| H5-D2 `20260715120000` applied | Oui |
| H5-D3 verdict | OBSERVATION INSUFFISANTE (0 événement) |
| `user_id` présente + nullable | Oui |
| `employee_id` NOT NULL | Oui |
| Vue sans `he.user_id` ; avec `auth_user_id` | Oui |
| H5-D historiques pending | Oui |
| H4 pending | 6 |

Réf. : `…H5D2-DEPRECATION…`, `…H5D3-OBSERVATION…`

---

## 2. Effets externes (Phase 2)

Triggers HE :
- `trg_horodateur_events_recompute_current_state` → `trg_recompute_horodateur_current_state`
- `trg_horodateur_events_recompute_shift` → `trg_recompute_horodateur_shift`

Fonctions `*horodateur*` / `*recompute_horodateur*` inspectées : **aucun** motif `http` / `pg_net` / `webhook` / `dblink` / `supabase_functions` / `curl`.

**Porte :** aucun effet externe hors transaction PostgreSQL → **GO écriture TX**.

---

## 3. Chauffeurs (agrégats uniquement)

| Métrique | Valeur |
|----------|--------|
| Actifs | 2 |
| Avec `auth_user_id` | 2 |
| Compagnie valide + admissible | 2 |

Aucune identité affichée. Aucun chauffeur créé.

---

## 4. Baseline avant

| Table / vue | Count |
|-------------|-------|
| `horodateur_events` | 0 |
| `horodateur_current_state` | 0 |
| `horodateur_shifts` | 0 |
| `horodateur_exceptions` | 0 |
| vue branches `horodateur` | 0 |

Fichier TEMP (hors Git) : `%TEMP%\tagora-time-h5d4-baseline-2026-07-15.txt`  
SHA-256 : `CC5884D42F0632815821F212818B5E40498051A2CA1A6F448447581E04FB598C`

---

## 5. Transaction

| Élément | Valeur |
|---------|--------|
| Script TEMP | `%TEMP%\tagora-time-h5d4-transactional-proof-2026-07-15.sql` (**non versionné**) |
| Ouverture | `BEGIN` |
| COMMIT de donnée QA | **Non** |
| ROLLBACK | **Oui** — sortie `H5-D4 ROLLBACK COMPLETED` |
| Marqueur | `H5-D4-TRANSACTIONAL-PROOF-2026-07-15` (metadata uniquement) |
| Type événement | `quart_debut` |
| `user_id` | **NULL** (omise / null explicite) |
| `employee_id` | chauffeur admissible (non affiché) |
| `actor_user_id` | = `auth_user_id` du même chauffeur |
| `actor_role` / `source_kind` | `employe` / `employe` |
| Dates | `America/Toronto` work_date + week_start (lundi) |
| Status | `normal` ; `requires_approval` false |

---

## 6. Assertions in-TX (toutes PASS)

| Assertion | Résultat |
|-----------|----------|
| 1 événement marqueur | PASS |
| `employee_id` non null + FK | PASS |
| `actor_user_id` non null = auth | PASS |
| `user_id` null | PASS |
| work_date / week_start | PASS |
| company/status/source/role | PASS |
| Vue 1 ligne `horodateur` | PASS |
| Vue `chauffeur_id` = employee_id | PASS |
| Vue `user_id` = auth_user_id | PASS |
| `recorded_at` non null | PASS |
| 18 colonnes vue | PASS |
| 0 doublon id vue | PASS |
| current_state mis à jour (≥1) | PASS |
| shift recomputé (≥1) | PASS |
| 0 exception inattendue | PASS |

---

## 7. Baseline après = avant

| Table / vue | Après |
|-------------|-------|
| `horodateur_events` | 0 |
| `horodateur_current_state` | 0 |
| `horodateur_shifts` | 0 |
| `horodateur_exceptions` | 0 |
| vue `horodateur` | 0 |
| marqueur restant | 0 |
| sms_alerts_log QA | 0 |
| app_alerts QA | 0 |

**Baseline avant = après :** Oui. **Aucune donnée QA persistante.**

---

## 8. Limites de la preuve

Validé : schéma, nullabilité `user_id`, insert sans `user_id`, `employee_id`, `actor_user_id`, triggers PG, tables dérivées, vue, ROLLBACK.

**Non validé :** trafic humain réel, navigateur, route API punch, SMS/courriel, logs Vercel, UX.

H5-D3 (observation trafic réel) **reste à rejouer** quand un usage staging existera.

---

## 9. Tests

Tests documentaires + Horodateur ciblés (R8/R9/R10, H5-A/B/C/D1–D4, repository, operational-state, schedule-gate, vue).  
Aucun `db reset`.

---

## 10. Protections

| Domaine | Statut |
|---------|--------|
| H5-E exécution | Non |
| H5-E1 audit | Admissible *après* GO Martin distinct |
| H5-F / H4 / feature / 1B.2 | Non |
| Production | Interdite |
| DROP `user_id` | Non |
| V1 | 51 % |

---

## 11. Prochaine étape unique

**GO Martin distinct pour H5-E1 (audit lecture seule RLS/sécurité)** — ou attendre trafic réel pour rejouer H5-D3.  
Pas d’exécution H5-E, pas H5-F, pas H4.
