# TAGORA Time — SaaS 1B.1B H5-D2 dépréciation `user_id` (2026-07-15)

**Agent :** Martin  
**Agent donneur :** Martin  
**Poste :** Maison  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `196b208c06a9afeb58c10963527c6c11de64db3a`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

**Staging :** `qokyobcvplzufshydhih`  
**Production (interdite) :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **51 %** (inchangé)

**Décision :** OPTION B APPROUVÉE (Martin) — déprécier sans supprimer.

**Décision d’exécution :** `GO H5-D2 — USER_ID DÉPRÉCIÉ SANS SUPPRESSION, TRANSITION VALIDÉE`

---

## Contenu H5-D2

| Élément | Valeur |
|---------|--------|
| Forward-only | `supabase/migrations/20260715120000_h5d2_deprecate_horodateur_user_id.sql` |
| SHA-256 | `36DFA31A1DDB3BCA896FAA7FBDAC28BF33E8676B139762A7B215C34E1AF52072` |
| Actions | DROP NOT NULL conditionnel ; COMMENT legacy ; vue Direction terrain sur `employee_id` + `c.auth_user_id` |
| App | `insertEvent` canonique sans `user_id` ; fallback borné NOT NULL / colonne `employee_id` absente |
| Interdit | DROP COLUMN `user_id` ; policies ; RBAC ; H5-E/F ; H4 ; seeds |

---

## Contrat colonnes

| Colonne | Avant staging | Après staging | Rôle |
|---------|---------------|---------------|------|
| `employee_id` | NOT NULL | NOT NULL | Identité employé canonique |
| `actor_user_id` | nullable | nullable | Acteur |
| `user_id` | NOT NULL | **nullable** + COMMENT legacy | Legacy déprécié — **toujours présente** |

---

## Application insert / lecture

- Premier essai : **sans** `user_id` ; avec `employee_id` + `actor_user_id`.
- Fallback legacy borné (`attempt < 8`) :
  - erreur `42703` colonne `employee_id` absente → `user_id` = `chauffeurs.auth_user_id` ;
  - erreur `23502` NOT NULL sur `user_id` → ajoute `user_id` depuis `auth_user_id` (jamais `actor_user_id`).
- Lecture principale : `.eq("employee_id", …)` ; fallback lecture `user_id` seulement si colonne `employee_id` absente.

---

## Vue Direction terrain

| | Avant | Après |
|--|-------|-------|
| Branche horodateur `user_id` | `he.user_id` | `c.auth_user_id` |
| `chauffeur_id` | `null` | `he.employee_id` |
| Join | aucun | `c.id = he.employee_id` |
| Colonnes | 18 | 18 |
| Branches | 4 | 4 |
| `security_invoker` | true | true |

Page Direction terrain : contrat select inchangé (`user_id`, `chauffeur_id`, …).

---

## Baseline staging (avant)

| Mesure | Valeur |
|--------|--------|
| Total HE | 0 |
| Conflits | 0 |
| Orphelins employee_id | 0 |
| Perte vue prévue | 0 |
| `user_id` | présente, NOT NULL |

## Après staging

| Mesure | Valeur |
|--------|--------|
| Total HE | 0 (inchangé) |
| `user_id` | présente, nullable + commentaire |
| Index legacy `…_user_occurred_at_legacy` | présent |
| Policies | inchangées |
| H5-D2 history | **applied** |
| H5-D historiques (`18140000`…) | **pending** |
| H5-A/B/C | applied inchangées |
| H4 | pending = 6 |

---

## Snapshots TEMP (hors Git)

| Fichier | SHA-256 |
|---------|---------|
| `%TEMP%\tagora-time-staging-schema-h5d2-before-2026-07-15.sql` | `D2435366FA69FC4F6F17FC78F17B006E95021DD29D0B66911FE613B2A5D56A0D` |
| `%TEMP%\tagora-time-direction-terrain-view-h5d2-before.sql` | `ADAA060681D197D022BC0CEC2650D71BB53B02F350807D806D1FF950119548FB` |
| `%TEMP%\tagora-time-horodateur-events-h5d2-before.sql` | `038829E3F3970CB6CC6C1C5DD2BF4FB4EE11F4BDFBD8B70E366F80FC01976A59` |
| `%TEMP%\tagora-time-migration-history-h5d2-before-2026-07-15.txt` | `1783E41F16D8DC471CD4D8B682BE9065E256C902127151A7B49622B93B6EF0F7` |
| `%TEMP%\tagora-time-staging-schema-h5d2-after-2026-07-15.sql` | `B8A72EAE39E8B2E3FB72B358E59C2477669F4A4F0EBD15FF155C22365F5387C4` |
| `%TEMP%\tagora-time-direction-terrain-view-h5d2-after.sql` | `77BF0942C5FA7680F072AFAEB50156C6D7227C1120C39A931E1566E9A2108645` |

---

## Local

- Cible : `127.0.0.1` (API 54321 / DB 54322) — aucun `--linked` pour le reset.
- `db reset --local` : **88** migrations ; H5-A/B/C/D2 + 6 H4 appliquées.
- H5-C notice : skip vue (pas de `user_id` local post-Phase1).
- H5-D2 notice : skip DROP NOT NULL ; **vue canonique employee_id** créée.
- Test fonctionnel : insert sans `user_id` ; vue `user_id` = `auth_user_id` ; `chauffeur_id` = `employee_id` ; acteur préservé ; événement système `actor_user_id` null ; **ROLLBACK** ; 0 ligne résiduelle.

---

## Staging — méthode

1. SQL isolé `BEGIN` + migration + gates + `COMMIT` (`db query --linked -f`).
2. `migration repair 20260715120000 --status applied --linked` **uniquement**.
3. Historiques H5-D restent pending. H4 pending = 6.
4. Aucun `db push` / `migration up` / `--include-all`.

---

## Rollback

- Ne **pas** remettre automatiquement `user_id` NOT NULL après inserts canoniques sans `user_id`.
- Restaurer la vue depuis snapshot TEMP sous mandat.
- Laisser `user_id` nullable.
- `migration repair 20260715120000 --status reverted --linked` history-only sous mandat.
- Aucun remplissage artificiel de `user_id`.
- Rollback code : revenir au dual-write précédent si nécessaire (mandat séparé).

---

## Protections

| Domaine | Statut |
|---------|--------|
| H5-E / H5-F | Non touchés |
| H4 SaaS | Pending inchangées (6) |
| Feature | Intact |
| Production | Interdite / non touchée |
| Secrets / PII | Absents des docs |
| V1 | 51 % |

---

## Incident

Aucun. Staging transaction commitée ; gates vertes.

---

## Prochaine étape unique

**Période d’observation H5-D / éventuel H5-D3** — **pas** H5-E, H5-F, H4, feature, SaaS 1B.2 sans nouveau GO Martin.
