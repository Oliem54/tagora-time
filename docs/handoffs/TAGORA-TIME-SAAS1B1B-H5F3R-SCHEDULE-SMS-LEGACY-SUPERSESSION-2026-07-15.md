# TAGORA Time — SaaS 1B.1B H5-F3R — Supersession UPDATE legacy + history-only (2026-07-15)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time`)  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `f2c1e83ca9ffbbd6dbf4580f129a472c38289e7f`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

**Contexte :** H5-F3 initial = NO-GO contrôlé (`candidate_historical_update_count = 2`).  
**Décision Martin :** écart legacy approuvé ; UPDATE historique **supersédé** ; repair history-only autorisé.

---

## 1. Migration

`20260412191500_employee_schedule_and_sms_alerts.sql` (R6)

- DDL : 12 pauses + 10 SMS — déjà présent sur staging  
- UPDATE `WHERE true` : **interdit** ; supersédé par le contrat produit actuel

---

## 2. Contrat actuel (22 colonnes)

Pauses : `break_am_enabled`, `break_am_time`, `break_am_minutes`, `break_am_paid`, `lunch_enabled`, `lunch_time`, `lunch_minutes`, `lunch_paid`, `break_pm_enabled`, `break_pm_time`, `break_pm_minutes`, `break_pm_paid`.

SMS : `sms_alert_depart_terrain`, `sms_alert_arrivee_terrain`, `sms_alert_sortie`, `sms_alert_retour`, `sms_alert_pause_debut`, `sms_alert_pause_fin`, `sms_alert_dinner_debut`, `sms_alert_dinner_fin`, `sms_alert_quart_debut`, `sms_alert_quart_fin`.

`break_am_minutes` : integer **nullable** ; **NULL est une valeur valide** ; aucune dérivation depuis `break_1_minutes`.

Legacy conservés sans sync : `break_1_*`, `break_2_*`, `break_3_*`, `sms_alerts_enabled`.

---

## 3. Divergence legacy approuvée (agrégats)

| Métrique | Valeur |
|----------|--------|
| n_total | 2 |
| **contract_invalid_count** | **= 0** |
| total lignes candidates UPDATE historique | **2** |
| divergences `break_am_minutes` | **2** |
| divergences autres pauses | **0** |
| divergences SMS | **0** |

Cause unique : `break_am_minutes IS NULL` alors que `break_1_minutes IS NOT NULL` (2 lignes).  
`contract_invalid_count = 0`.  
**Aucun backfill** ; **aucun UPDATE** ; données inchangées.

---

## 4. Snapshots TEMP (SHA-256)

| Snapshot | SHA-256 |
|----------|---------|
| migration-list-before | `0D4BAE86B523232AD6D133A51153B3C3484E766986D8375EEE15F0FB0B60C7E8` |
| columns-before | `09C7C418407915894410C4E9C83A20B597252748D637B386C6576D2652A0E083` |
| aggregates-before | `3EDDBD1CF53292627CDAEFD797641548AEAE0AE0A3A7CAA42EA2445291563CA7` |
| legacy-divergence-before | `43A1FE5A3CA770C5A9FC18DCDCF4B9A41B6810BB905164AF1BABD614762228C9` |
| policies-before | `797A1501514A91D1A2BB63BA0ACB529974DECAB99F324F9C50EEEBBDA4C8119E` |
| grants-before | `35391B53BB4E953BA4DB8EF49D1E9B57442EFDE593F278E2106D20BA3F4790F3` |

---

## 5. Exécution

### Reset local
- `127.0.0.1` ; `npx supabase db reset --local` — PASS / **92** migrations  
- Ne constitue pas une autorisation de rejouer le SQL sur staging

### Repair history-only
```text
npx supabase migration repair 20260412191500 --status applied --linked
```

Aucune autre version. Aucune donnée modifiée. Aucun SMS réel.

### Après
- colonnes / agrégats / divergences / policies / grants = inchangés (EQ)
- H5-F5 (`25133500`) pending ; H4 pending = 6
- migration-list-after SHA : `5A362E1C39E9665FB1E5F7692B6425E67B400E1205B4B91538CD521651333AA2`

---

## 6. Protections

H5-F5 / H4 / feature / production protégés. V1 **51 %**.

---

## 7. Rollback (mandat distinct)

```text
npx supabase migration repair 20260412191500 --status reverted --linked
```

History-only ; ne modifie aucune donnée / SMS / colonne.

---

## 8. Verdict

**GO H5-F3R — ÉCART LEGACY APPROUVÉ, HISTORIQUE NORMALISÉ**

### Fermeture bureau / reprise maison

Document de fermeture : `TAGORA-TIME-OFFICE-CLOSURE-AFTER-H5F3R-2026-07-15.md`  
Poste quitté : Bureau (`C:\dev\tagora-time`).  
Reprise maison : synchroniser la branche WIP avec `git pull --ff-only` ; ne pas démarrer H4 / H5-F5 sans mandat.

Prochaine étape unique : H5-F5 **bloqué** — attendre décisions Storage / H4 ; ne pas démarrer auto.
