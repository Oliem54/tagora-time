# TAGORA Time — Migration version normalization map (2026-07-13)

**Agent :** Martin  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD :** `21bcca8c4e86a77259f4008c26e8380518ea897c`  
**Staging ref (read-only) :** `qokyobcvplzufshydhih`  
**Production :** non utilisée

---

## Résumé inventaire local

| Item | Valeur |
|------|--------|
| Total migrations | 84 |
| Canonique (14 chiffres) avant | 42 |
| Legacy `YYYYMMDD_HHMMSS_` avant | 42 |
| Anormal | 0 |
| Groupes en collision (version 8 chiffres) | 10 |
| Fichiers renommés | **42** |
| Legacy restant après | **0** |
| Versions 14 chiffres uniques après | **84** |

### Groupes en collision (avant)

- `20260410` → 3 fichiers  
- `20260412` → 7  
- `20260416` → 2  
- `20260418` → 2  
- `20260419` → 3  
- `20260420` → 3  
- `20260425` → 5  
- `20260426` → 3  
- `20260428` → 6  
- `20260429` → 4  

Plus collisions mono-fichier 8 chiffres : `20260408`, `20260411`, `20260421`, `20260513` (pas de doublon local, mais version courte).

---

## Audit staging (read-only)

`supabase migration list --linked` (project ref `qokyobcvplzufshydhih`) :

- Staging stocke surtout des versions **8 chiffres** pour la période avril 2026 (`20260408`, `20260410`, … `20260429`, `20260513`).
- Staging a **une seule** entrée `20260410` pour **trois** fichiers locaux historiquement collisionnés.
- Versions **14 chiffres** alignées local/remote à partir de `20260502140000` (sauf absences SaaS / baseline / bootstrap).
- Local-only aujourd’hui : `20260407000000` (RBAC baseline), `20260409120000` (bootstrap), six migrations SaaS `2026071222xxxx`.

**Compatibilité staging (après normalisation) : B — incompatible / migration history mapping requis.**

Les renames 14 chiffres seront vus comme de **nouvelles** versions côté staging (pas comme les anciennes clés 8 chiffres). Aucun `migration repair` ni écriture distante dans ce mandat.

---

## Règle de transformation

```
YYYYMMDD_HHMMSS_description.sql  →  YYYYMMDDHHMMSS_description.sql
```

- Concaténation uniquement.
- Description inchangée.
- Contenu SQL inchangé (hash avant = hash après), sauf le fichier GPS déjà corrigé en R3 (contenu différent de HEAD, mais hash stable avant/après rename).
- Bootstrap `20260409120000_historical_schema_bootstrap.sql` **non renommé**.

---

## Mapping (42 fichiers)

| Ancien | Nouveau | Ancienne version | Nouvelle | Hash SHA-256 (stable) | Staging | Risque | Décision |
|--------|---------|------------------|----------|------------------------|---------|--------|----------|
| `20260408_190000_horodateur.sql` | `20260408190000_horodateur.sql` | `20260408` | `20260408190000` | `0618b3ff…dad12ab7` | staging=`20260408` | mapping requis | renommé |
| `20260410_120000_company_activation_and_payroll.sql` | `20260410120000_company_activation_and_payroll.sql` | `20260408`/`20260410` | `20260410120000` | `bab02949…957dfc14` | staging=`20260410` (1 entrée pour 3 locals) | collision historique | renommé |
| `20260410_130000_gps_direction_and_company_hardening.sql` | `20260410130000_gps_direction_and_company_hardening.sql` | `20260410` | `20260410130000` | `6563e6b1…4e0a145d…` | idem | + correction SQL R3 | renommé |
| `20260410_140000_direction_terrain_compatibility.sql` | `20260410140000_direction_terrain_compatibility.sql` | `20260410` | `20260410140000` | (stable) | idem | mapping requis | renommé |
| `20260411_101500_delivery_tracking_tokens.sql` | `20260411101500_delivery_tracking_tokens.sql` | `20260411` | `20260411101500` | (stable) | staging=`20260411` | mapping requis | renommé |
| `20260412_103000_timeclock_terrain_intercompany.sql` | `20260412103000_timeclock_terrain_intercompany.sql` | `20260412` | `20260412103000` | (stable) | staging=`20260412` (1/7) | mapping requis | renommé |
| `20260412_161500_employee_account_management.sql` | `20260412161500_employee_account_management.sql` | `20260412` | `20260412161500` | (stable) | idem | mapping requis | renommé |
| `20260412_170000_employee_breaks.sql` | `20260412170000_employee_breaks.sql` | `20260412` | `20260412170000` | (stable) | idem | mapping requis | renommé |
| `20260412_181500_breakdown_work_time.sql` | `20260412181500_breakdown_work_time.sql` | `20260412` | `20260412181500` | (stable) | idem | mapping requis | renommé |
| `20260412_191500_employee_schedule_and_sms_alerts.sql` | `20260412191500_employee_schedule_and_sms_alerts.sql` | `20260412` | `20260412191500` | (stable) | idem | mapping requis | renommé |
| `20260412_201500_app_improvements.sql` | `20260412201500_app_improvements.sql` | `20260412` | `20260412201500` | (stable) | idem | mapping requis | renommé |
| `20260412_213000_gps_bases.sql` | `20260412213000_gps_bases.sql` | `20260412` | `20260412213000` | (stable) | idem | mapping requis | renommé |
| `20260416_120000_ensure_chauffeurs_auth_user_id.sql` | `20260416120000_ensure_chauffeurs_auth_user_id.sql` | `20260416` | `20260416120000` | (stable) | staging=`20260416` | mapping requis | renommé |
| `20260416_193500_ensure_chauffeurs_account_request_columns.sql` | `20260416193500_ensure_chauffeurs_account_request_columns.sql` | `20260416` | `20260416193500` | (stable) | idem | mapping requis | renommé |
| `20260418_140000_horodateur_phase1_schema.sql` | `20260418140000_horodateur_phase1_schema.sql` | `20260418` | `20260418140000` | (stable) | staging=`20260418` | mapping requis | renommé |
| `20260418_141000_horodateur_phase1_rls.sql` | `20260418141000_horodateur_phase1_rls.sql` | `20260418` | `20260418141000` | (stable) | idem | mapping requis | renommé |
| `20260419_103000_horodateur_exception_direction_notifications.sql` | `20260419103000_horodateur_exception_direction_notifications.sql` | `20260419` | `20260419103000` | (stable) | staging=`20260419` | mapping requis | renommé |
| `20260419_141500_horodateur_direction_alert_config_and_reminders.sql` | `20260419141500_horodateur_direction_alert_config_and_reminders.sql` | `20260419` | `20260419141500` | (stable) | idem | mapping requis | renommé |
| `20260419_164500_horodateur_lateness_notifications.sql` | `20260419164500_horodateur_lateness_notifications.sql` | `20260419` | `20260419164500` | (stable) | idem | mapping requis | renommé |
| `20260420_110000_horodateur_events_canonical_minimal.sql` | `20260420110000_horodateur_events_canonical_minimal.sql` | `20260420` | `20260420110000` | (stable) | staging=`20260420` | mapping requis | renommé |
| `20260420_111000_chauffeurs_telephone_canonical_minimal.sql` | `20260420111000_chauffeurs_telephone_canonical_minimal.sql` | `20260420` | `20260420111000` | (stable) | idem | mapping requis | renommé |
| `20260420_112000_horodateur_core_guardrails_minimal.sql` | `20260420112000_horodateur_core_guardrails_minimal.sql` | `20260420` | `20260420112000` | (stable) | idem | mapping requis | renommé |
| `20260421_113000_delivery_phase_a_minimal.sql` | `20260421113000_delivery_phase_a_minimal.sql` | `20260421` | `20260421113000` | (stable) | staging=`20260421` | mapping requis | renommé |
| `20260425_090500_photos_dossier_proof_metadata.sql` | `20260425090500_photos_dossier_proof_metadata.sql` | `20260425` | `20260425090500` | (stable) | staging=`20260425` | mapping requis | renommé |
| `20260425_093500_operation_proofs_minimal.sql` | `20260425093500_operation_proofs_minimal.sql` | `20260425` | `20260425093500` | (stable) | idem | mapping requis | renommé |
| `20260425_133500_storage_photos_dossiers_policy_alignment.sql` | `20260425133500_storage_photos_dossiers_policy_alignment.sql` | `20260425` | `20260425133500` | (stable) | idem | mapping requis | renommé |
| `20260425_140500_operation_proofs_note_type.sql` | `20260425140500_operation_proofs_note_type.sql` | `20260425` | `20260425140500` | (stable) | idem | mapping requis | renommé |
| `20260425_143000_employee_alert_recipients.sql` | `20260425143000_employee_alert_recipients.sql` | `20260425` | `20260425143000` | (stable) | idem | mapping requis | renommé |
| `20260426_103500_create_app_improvements.sql` | `20260426103500_create_app_improvements.sql` | `20260426` | `20260426103500` | (stable) | staging=`20260426` | mapping requis | renommé |
| `20260426_111500_app_improvements_admin_only.sql` | `20260426111500_app_improvements_admin_only.sql` | `20260426` | `20260426111500` | (stable) | idem | mapping requis | renommé |
| `20260426_120500_livraisons_planifiees_inline_stop_fields.sql` | `20260426120500_livraisons_planifiees_inline_stop_fields.sql` | `20260426` | `20260426120500` | (stable) | idem | mapping requis | renommé |
| `20260428_120000_app_improvements_archive_and_soft_delete.sql` | `20260428120000_app_improvements_archive_and_soft_delete.sql` | `20260428` | `20260428120000` | (stable) | staging=`20260428` | mapping requis | renommé |
| `20260428_150000_admin_improvement_notification_preferences.sql` | `20260428150000_admin_improvement_notification_preferences.sql` | `20260428` | `20260428150000` | (stable) | idem | mapping requis | renommé |
| `20260428_203500_livraison_ramassage_audit_logs.sql` | `20260428203500_livraison_ramassage_audit_logs.sql` | `20260428` | `20260428203500` | (stable) | idem | mapping requis | renommé |
| `20260428_214500_direction_ramassage_alert_config.sql` | `20260428214500_direction_ramassage_alert_config.sql` | `20260428` | `20260428214500` | (stable) | idem | mapping requis | renommé |
| `20260428_220500_direction_ramassage_alert_config_admin_write_only.sql` | `20260428220500_direction_ramassage_alert_config_admin_write_only.sql` | `20260428` | `20260428220500` | (stable) | idem | mapping requis | renommé |
| `20260428_235500_user_role_audit_logs.sql` | `20260428235500_user_role_audit_logs.sql` | `20260428` | `20260428235500` | (stable) | idem | mapping requis | renommé |
| `20260429_001500_internal_mentions.sql` | `20260429001500_internal_mentions.sql` | `20260429` | `20260429001500` | (stable) | staging=`20260429` | mapping requis | renommé |
| `20260429_120000_rls_account_requests_temps_titan.sql` | `20260429120000_rls_account_requests_temps_titan.sql` | `20260429` | `20260429120000` | (stable) | idem | mapping requis | renommé |
| `20260429_130000_security_advisor_view_and_metadata_policies.sql` | `20260429130000_security_advisor_view_and_metadata_policies.sql` | `20260429` | `20260429130000` | (stable) | idem | mapping requis | renommé |
| `20260429_140000_add_weekly_schedule_config_to_chauffeurs.sql` | `20260429140000_add_weekly_schedule_config_to_chauffeurs.sql` | `20260429` | `20260429140000` | (stable) | idem | mapping requis | renommé |
| `20260513_103000_livraisons_planifiees_user_audit.sql` | `20260513103000_livraisons_planifiees_user_audit.sql` | `20260513` | `20260513103000` | (stable) | staging=`20260513` | mapping requis | renommé |

Hashes complets : capturés dans le plan de renommage ; vérification `before == after` pour les **42** fichiers (0 divergence).

---

## Non renommés (déjà canoniques ou nouveaux)

- `20260407000000_rbac_auth_helpers_baseline.sql`
- `20260409120000_historical_schema_bootstrap.sql`
- Toutes les migrations `20260502…`+ déjà en 14 chiffres
- Six migrations SaaS `2026071222xxxx`

---

## Interdictions respectées

- aucun `migration repair`
- aucun `db push`
- aucune écriture staging/production
- aucun contenu SQL réécrit lors des renames
- seul contenu SQL legacy déjà modifié : correction GPS R3 (dans le fichier renommé `20260410130000_…`)
