# TAGORA Time — SaaS 1B.1B H5-C execution (2026-07-14)

**Agent :** Martin  
**Agent donneur :** Martin  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `07220df08a38976ccef3acfc187ded3a63edfc97`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

**Staging :** `qokyobcvplzufshydhih`  
**Production (interdite) :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **51 %** (inchangé)

---

## Contenu H5-C

| Élément | Valeur |
|---------|--------|
| Historique (pending) | `20260410140000` (R2) |
| Dépendance partielle | `20260429130000` → `security_invoker` seulement (pas policies/helpers) |
| Forward-only | `supabase/migrations/20260714160000_h5c_reconcile_direction_terrain_view.sql` |
| SHA-256 | `676BBA68F392CEBA5A63628ACDEE97E45DABAA0DA3FCB6383363DAF5CF41CD65` |

Contrat pré-transition Horodateur : `horodateur_events.user_id` (aucun join `employee_id` / chauffeurs).

---

## Avant staging

| Mesure | Valeur |
|--------|--------|
| Définition | passthrough `SELECT … FROM gps_positions` (`id` uuid) |
| security_invoker | true |
| Lignes vue | 0 |
| gps / sorties depart / retour / he | 0 / 0 / 0 / 0 |
| Prérequis colonnes | gps 16/16 ; sorties 11/11 ; he 9/9 (+ user_id présent) |

Note technique : `CREATE OR REPLACE` impossible (type `id` uuid→text). Migration fait `DROP VIEW IF EXISTS` **sans** cascading, puis `CREATE VIEW`.

---

## Local

- `db reset --local` : 87 migrations ; H5-C **skip** notice si `user_id` absent (schéma post-transition historique).
- Synthétique transactionnelle : gps=1, sortie_depart=1, sortie_retour=1 ; horodateur=0 (FK auth locale) ; **ROLLBACK** (PASS forcé).
- Aucune fixture persistante.

---

## Staging

1. SQL isolé `BEGIN` … `COMMIT` + gates (18 colonnes, 4 branches, `security_invoker`, requête app).
2. `migration repair 20260714160000 --status applied --linked` **uniquement**.
3. Historiques `10140000` / `29130000` restent **pending**. H4 pending.

---

## Snapshots TEMP (hors Git)

| Fichier | SHA-256 |
|---------|---------|
| `%TEMP%\tagora-time-staging-schema-h5c-before-2026-07-14.sql` | `F2B49D9767DEBA0B726954CC558307468C59ACF99901E5FE7AB242C0FC2F53D6` |
| `%TEMP%\tagora-time-local-schema-h5c-before-2026-07-14.sql` | `C34A4D41B956AD1110BB7337ECB6D7A189C2AAA80BC50D5D6CA89B25B6C84C29` |
| `%TEMP%\tagora-time-direction-terrain-view-before.sql` | `BB20186FEA85AB8955EA8CE542A58697DF8FE9386D1775676D6EC026A6CE8141` |
| `%TEMP%\tagora-time-staging-schema-h5c-after-2026-07-14.sql` | `D2435366FA69FC4F6F17FC78F17B006E95021DD29D0B66911FE613B2A5D56A0D` |
| `%TEMP%\tagora-time-direction-terrain-view-after.sql` | `FF51E2DFA679F9984426CC0EF662BE03EA193550791361656DC70B64D785ED42` |

---

## Rollback

```text
npx supabase migration repair 20260714160000 --status reverted --linked
```

Restaurer le DDL vue depuis le snapshot TEMP (mandat inverse pour réécrire la vue).

---

## Protections

- H5-D / H5-E / H5-F : non touchés  
- H4 : pending  
- Tables gps/sorties/horodateur : non modifiées  
- Policies / fonctions : non modifiées  
- Production : non ciblée  

---

## Décision

**GO H5-C — GPS ET VUE DIRECTION TERRAIN DÉPLOYÉS ET VALIDÉS**

Prochaine étape unique : **GO Martin H5-D** (pas H5-E, pas H4, pas feature, pas 1B.2).
