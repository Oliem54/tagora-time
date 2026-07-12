# SAAS-TABLE-INVENTORY

**Statut :** inventaire SaaS 0 (lecture architecture)  
**Date :** 2026-07-12  
**Note :** le système n’est **pas** multi-tenant aujourd’hui. `organization_id futur = oui` signifie « à ajouter ».

Légende RLS actuelle :

- **Rôle** : policies basées sur JWT role / permission, sans org  
- **Own-row** : `auth.uid()`  
- **RLS on / no policy** : deny JWT ; service role OK  
- **Absent** : pas d’ENABLE trouvé dans migrations repo  
- **Legacy** : table hors CREATE migrations ; RLS possible via `permissions_and_rls.sql`

Sensibilité : `critique` | `élevé` | `standard` | `faible`

Priorité migration tenant : P0 (fondation) → P3 (plus tard)

---

## Synthèse

| # | Table | Module | Données tenant | org_id futur | Sensibilité | RLS actuelle | Risque | Priorité |
|---|--------|--------|----------------|--------------|-------------|--------------|--------|----------|
| 1 | `chauffeurs` | Core | oui | oui | élevé | Legacy / rôle | Fuite RH cross-client | P0 |
| 2 | `account_requests` | Core | oui | oui | élevé | Rôle | Demandes d’un autre client | P0 |
| 3 | `app_permissions` | Core | partiel* | oui* | standard | Rôle | Permissions globales | P1 |
| 4 | `user_role_audit_logs` | Core | oui | oui | élevé | Rôle admin | Audit cross-tenant | P1 |
| 5 | `horodateur_events` | Pointage | oui | oui | élevé | Rôle + own | Pointages autres clients | P0 |
| 6 | `horodateur_shifts` | Pointage | oui | oui | élevé | Rôle | Idem | P0 |
| 7 | `horodateur_current_state` | Pointage | oui | oui | élevé | Rôle | Idem | P0 |
| 8 | `horodateur_exceptions` | Pointage | oui | oui | élevé | Rôle | Idem | P0 |
| 9 | `horodateur_punch_zones` | Pointage | oui | oui | standard | Deny direct | Zones partagées | P1 |
| 10 | `horodateur_direction_alert_config` | Pointage | oui | oui | standard | Absent / service | Config globale | P2 |
| 11 | `horodateur_lateness_notifications` | Pointage | oui | oui | standard | Absent | Notifs cross | P2 |
| 12 | `horodateur_exception_action_tokens` | Pointage | oui | oui | élevé | RLS tokens | Tokens | P1 |
| 13 | `gps_positions` | GPS | oui | oui | critique | Own + rôle | Tracking employés | P0 |
| 14 | `gps_bases` | GPS | oui | oui | standard | Rôle | Bases | P1 |
| 15 | `livraisons_planifiees` | Opérations | oui | oui | élevé | Legacy / rôle | Ops clients | P0 |
| 16 | `delivery_proofs` | Opérations | oui | oui | élevé | Absent mig. | Preuves | P1 |
| 17 | `delivery_media` | Opérations | oui | oui | élevé | Absent | Médias | P1 |
| 18 | `delivery_incidents` | Opérations | oui | oui | élevé | Absent | Incidents | P1 |
| 19 | `service_cases` | Opérations | oui | oui | élevé | Absent | SAV | P2 |
| 20 | `sorties_terrain` | Opérations | oui | oui | élevé | Legacy | Terrain | P0 |
| 21 | `direction_ramassage_alert_config` | Opérations | oui | oui | standard | Rôle | Singleton actuel | P2 |
| 22 | `livraison_ramassage_audit_logs` | Opérations | oui | oui | élevé | Rôle | Audit ops | P1 |
| 23 | `effectifs_departments` | Effectifs | oui | oui | standard | Absent | Depts Oliem/Titan | P1 |
| 24 | `effectifs_regular_closed_days` | Effectifs | oui | oui | standard | Absent | Fermetures | P1 |
| 25 | `department_coverage_windows` | Effectifs | oui | oui | standard | Absent | Couverture | P1 |
| 26 | `effectifs_calendar_exceptions` | Effectifs | oui | oui | élevé | Absent | Absences | P1 |
| 27 | `effectifs_employee_schedule_requests` | Effectifs | oui | oui | élevé | Absent | Demandes | P1 |
| 28 | `employee_leave_periods` | Effectifs | oui | oui | élevé | RLS on / no policy | Congés | P1 |
| 29 | `app_alerts` | Alertes | oui | oui | élevé | RLS on / no policy | Journal | P1 |
| 30 | `app_alert_deliveries` | Alertes | oui | oui | élevé | Idem | Livraisons alerte | P1 |
| 31 | `sms_alerts_log` | Alertes | oui | oui | élevé | Own + rôle | SMS PII | P1 |
| 32 | `authorization_requests` | Alertes/Core | oui | oui | élevé | Rôle | Autorisations | P1 |
| 33 | `app_communication_templates` | Alertes | oui | oui | standard | RLS on / no policy | Templates Titan | P1 |
| 34 | `internal_mentions` | Alertes | oui | oui | standard | Rôle | Mentions | P2 |
| 35 | `dossiers` | Documents | oui | oui | élevé | Legacy | Docs | P0 |
| 36 | `notes_dossier` | Documents | oui | oui | élevé | Legacy | Notes | P1 |
| 37 | `photos_dossier` | Documents | oui | oui | élevé | Legacy + storage | Photos | P1 |
| 38 | `operation_proofs` | Documents | oui | oui | élevé | Rôle | Preuves | P1 |
| 39 | `sales_objectives` | Commissions | oui | oui | critique | Rôle admin | Objectifs $ | P0 |
| 40 | `commission_rules` | Commissions | oui | oui | critique | Rôle | Règles $ | P0 |
| 41 | `commission_entries` | Commissions | oui | oui | critique | Rôle | Entrées $ | P0 |
| 42 | `commission_book_access_grants` | Commissions | oui | oui | critique | Admin | Grants | P0 |
| 43 | `compensation_events` | Livre commissions | oui | oui | critique | Admin | Events | P0 |
| 44 | `compensation_accruals` | Livre commissions | oui | oui | critique | Admin | Accruals $ | P0 |
| 45 | `compensation_accrual_status_history` | Livre commissions | oui | oui | critique | Admin | Historique $ | P0 |
| 46 | `temps_titan` | Rémunération | oui | oui | critique | Admin | Paie / interco | P0 |
| 47 | `vehicules` | Opérations | oui | oui | standard | Legacy | Flotte | P2 |
| 48 | `remorques` | Opérations | oui | oui | standard | Legacy | Flotte | P2 |
| 49 | `app_improvements` | Core/interne | partiel | oui / plateforme | faible | Admin | Roadmap interne | P3 |
| 50 | `admin_improvement_notification_preferences` | Core | oui | oui | faible | Own + admin | Prefs | P3 |
| 51 | `app_action_tokens` | Core | oui | oui | élevé | Tokens | Actions email | P1 |
| 52 | `account_request_rate_limits` | Core | technique | optionnel | faible | — | Anti-abus | P3 |

\* `app_permissions` aujourd’hui global ; cible : permissions effectives via membership + entitlements (refonte, pas simple colonne).

**Nombre de tables inventoriées dans cette matrice : 52.**

---

## Notes par domaine

### Comptes / auth

- Auth users : Supabase Auth (pas une table métier à `organization_id`, mais membership requis).
- `scripts/bootstrap-founder-admin.mjs` : hors modèle SaaS client.

### Paramètres

Pas de table `organization_settings` aujourd’hui. Config dispersée (`horodateur_direction_alert_config`, `direction_ramassage_alert_config`, defaults code). → nouvelle table en SaaS 1/6.

### Vues

- `payroll_company_summary`, `intercompany_billing_summary`, `direction_temps_titan_operational` : à scoper `organization_id` (P0 finance).

### Storage

- Bucket `photos_dossiers` : policies storage à scoper org (chemins préfixés `org_id/...`).
