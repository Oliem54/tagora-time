# TAGORA Time — SaaS 1B.1B H5-F2 — Normalisation history-only comptes employés (2026-07-15)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time`)  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `1ebb317b92bf289a73023e27a962b1b870eb82eb`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

**Portée :** preuve no-op du contrat comptes employés (**R5**) + `migration repair --status applied` history-only sur **une** version.  
**Aucun** SQL historique rejoué ; **aucun UPDATE** ; **aucun backfill** ; **aucune** migration SQL créée ; **aucun** DDL staging.

---

## 1. Décisions Martin (figées)

| Champ | Décision |
|-------|----------|
| `social_benefits_percent` | `numeric(5,2)` NOT NULL default 15 ; aucune valeur modifiée |
| `titan_billable` | boolean NOT NULL default false ; **aucun** dérivé depuis `can_work_for_titan_produits_industriels` ; backfill interdit |
| `planned_daily_hours` / `planned_weekly_hours` | `numeric(5,2)` nullable ; pas de default imposé |
| `scheduled_work_days` | `text[]` NOT NULL default tableau vide `{}` |
| `auth_user_id` | uuid nullable ; FK `auth.users(id)` ON DELETE SET NULL ; index unique partiel ; doublon = STOP |
| Historique | aucun SQL / UPDATE historique ; repair history-only seulement si no-op complet |

---

## 2. Migration

`20260412161500_employee_account_management.sql` (classe **R5**)

Six colonnes : `auth_user_id`, `social_benefits_percent`, `titan_billable`, `planned_daily_hours`, `planned_weekly_hours`, `scheduled_work_days`.

Index : `idx_chauffeurs_auth_user_id` UNIQUE WHERE `auth_user_id IS NOT NULL`.

FK : `FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL`.

---

## 3. Pourquoi aucun SQL / UPDATE n’a été rejoué

Staging possède déjà le contrat exact :

- 6/6 colonnes types/nullability/defaults exacts ;
- FK Auth + ON DELETE SET NULL ;
- index unique partiel exact ;
- 0 groupe doublon `auth_user_id` ;
- `candidate_update_count = 0` (prédicat UPDATE historique inutile) ;
- `social_benefits_percent` / `titan_billable` : 0 NULL ;
- aucun backfill requis ;
- app utilise déjà ces champs (profil employé, account-requests, finances) sans dépendre du rejeu.

Équivalence complète → normalisation **history-only** uniquement.

---

## 4. Agrégats staging (sans PII)

| Métrique | Valeur |
|----------|--------|
| n_total | 2 |
| auth null / non-null | 0 / 2 |
| dup_groups / dup_rows | 0 / 0 |
| sbp null / =15 / other / hors plage | 0 / 2 / 0 / 0 |
| titan true / false / null | 0 / 2 / 0 |
| désaccord legacy | 0 |
| planned_* non-null | 0 |
| scheduled_work_days vide | 2 |
| **candidate_update_count** | **0** |

---

## 5. Snapshots TEMP (SHA-256 contenu LF)

| Snapshot | SHA-256 |
|----------|---------|
| migration-list-before | `1C5A8ADB3B0D453B872E2123622761F3133E00A7FA8F7A2E010B3F011BCF18D7` |
| columns | `C7B574CE97820BF1D746EFEE066FCD2F3C9219E151760C46E6C7A182A427B4FD` |
| auth-fk | `D0DC5BC6D6F5ACC0DF1C98157A1116C149C6851C4E99E0D647F11B82640A80B2` |
| auth-index | `81A870C98067CB86614F931CD6AA5B034431910CC2A472D560BCF919B2571112` |
| aggregates | `94A850E533EEDF628BDA1EBE58F2196A575CEB7B8DF8A70F668BB714994A6F77` |
| policies | `797A1501514A91D1A2BB63BA0ACB529974DECAB99F324F9C50EEEBBDA4C8119E` |
| grants | `35391B53BB4E953BA4DB8EF49D1E9B57442EFDE593F278E2106D20BA3F4790F3` |

Avant repair : `20260412161500` pending ; F3/F5 pending ; F4 applied ; H4 pending = 6.

Après repair : colonnes / FK / index / agrégats / policies / grants **avant = après** ; seule l’entrée d’historique `20260412161500` a changé.

---

## 6. Exécution

### Reset local
- Cible `127.0.0.1` uniquement ; `npx supabase db reset --local` — **PASS**.
- **92** migrations locales.
- `20260412161500` exécutée localement sans erreur ; staging inchangé par le reset.

### Repair history-only
```text
npx supabase migration repair 20260412161500 --status applied --linked
```

Résultat : applied. Aucune autre version.

### Après
- H5-F3 (`12191500`) et H5-F5 (`25133500`) restent pending
- H4 pending = 6
- H5-F4 + H5-A…E inchangés

---

## 7. Protections

H5-F3 / H5-F5 / H4 / feature / production protégés. V1 **51 %**.

---

## 8. Rollback (documentaire — mandat distinct requis)

```text
npx supabase migration repair 20260412161500 --status reverted --linked
```

History-only ; ne retire aucune colonne/index/FK ; ne modifie aucune donnée.

---

## 9. Verdict

**GO H5-F2 — CONTRAT COMPTES EMPLOYÉS VALIDÉ, HISTORIQUE NORMALISÉ**

Prochaine étape unique : décisions Martin puis mandat distinct **H5-F3** — ne pas démarrer auto H5-F3 / H5-F5 / H4 / intégration feature.
