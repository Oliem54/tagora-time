# TAGORA Time — SaaS 1B.1B H5 reconciliation plan (2026-07-14)

**Agent :** Martin
**Mandat :** R10 (documentation only)
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`
**HEAD WIP au départ R10 :** `21bcca8c4e86a77259f4008c26e8380518ea897c`
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

**Staging (lecture seule) :** `qokyobcvplzufshydhih`
**Production (interdite) :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **51 %**
**Exécution H5 / H4 / repair / db push / migration up dans R10 :** **aucune**

---

## 1. Contexte après R9

| Classe | Distant | Signification |
|--------|---------|---------------|
| H1 | 34 applied | inchangées |
| H2 | 18 applied | effets complets, history normalisée |
| H3 | 2 applied | baseline RBAC + bootstrap |
| H4 | 6 pending | SaaS 1B.1 — **séparées et protégées** |
| H5 | 24 pending | écarts partiels — objet de ce plan |
| Versions 8 chiffres | 0 | retirées en R9 |

Aucune migration SQL nouvelle n’est créée durant R10.
Tout SQL « forward-only » ci-dessous est **documentation uniquement**.

---

## 2. Catégories R1–R6

| Code | Sens |
|------|------|
| **R1** | Migration originale potentiellement exécutable (idempotente / no-op probable) |
| **R2** | Forward-only DDL requis pour atteindre la cible locale |
| **R3** | Supersédée par une migration plus tardive / hors périmètre d’exécution |
| **R4** | Transformation / backfill de données éventuel (hors affichage métier) |
| **R5** | Décision métier / produit requise avant exécution |
| **R6** | Preuve insuffisante ou blocage technique (ex. storage hors dump public) |

**Comptes R10 :** R1=6, R2=9, R3=2, R4=1, R5=3, R6=3 — **total 24**.

---

## 3. Inventaire des 24 H5

Légende état staging : d’après dump R8 + `migration list` R10 + requêtes agrégées RO
(`tracking_token`=0, `sorties_terrain.company_context`=0, `horodateur_events.user_id`=1, `employee_id`=1, `actor_user_id`=1).

| # | Version | Fichier canonique | Ancien nom | Domaine | Cat | État staging | Cible locale | Écart | Risque | Stratégie historique |
|---|---------|-------------------|------------|---------|-----|--------------|--------------|-------|--------|----------------------|
| 1 | `20260408190000` | `…_horodateur.sql` | `20260408_190000_…` | Horodateur early | **R3** | Tables HE présentes (évoluées) | Schéma early historique | Supersédé Phase1+ | moyen | Marquer applied après R3 lot D **sans** rejeu destructif, ou laisser pending jusqu’à preuve no-op |
| 2 | `20260410130000` | `…_gps_direction_and_company_hardening.sql` | `20260410_130000_…` | GPS / company | **R2** | `sorties_terrain.company_context` **absent** | Colonne + UPDATE GPS R3 | Colonne manquante | élevé | Après forward DDL réussi → `repair --status applied` |
| 3 | `20260410140000` | `…_direction_terrain_compatibility.sql` | `20260410_140000_…` | Vue terrain | **R2** | Vue = `gps_positions` only | Vue sorties+HE + Toronto R5 | Définition divergente | élevé | `CREATE OR REPLACE VIEW` contrôlé puis applied |
| 4 | `20260411101500` | `…_delivery_tracking_tokens.sql` | `20260411_101500_…` | Tracking livraisons | **R4** | `tracking_token`/`enabled` **absents** | Colonnes + index unique | DDL + éventuel backfill tokens | élevé | Forward ADD COLUMN ; backfill agrégé seulement si GO données |
| 5 | `20260412103000` | `…_timeclock_terrain_intercompany.sql` | `20260412_103000_…` | Terrain interco | **R2** | Contexte compagnie partiel | Contexte canon local | Colonnes/contrats manquants | moyen | Forward idempotent puis applied |
| 6 | `20260412161500` | `…_employee_account_management.sql` | `20260412_161500_…` | Comptes employés | **R5** | Partiel (empreintes mixtes) | Contrat compte complet | Décision champs / policies | élevé | GO métier avant toute exécution |
| 7 | `20260412170000` | `…_employee_breaks.sql` | `20260412_170000_…` | Pauses | **R1** | Objets liés souvent déjà présents | Même contrat | No-op probable | faible | Exécuter en dry-run / IF NOT EXISTS puis applied |
| 8 | `20260412181500` | `…_breakdown_work_time.sql` | `20260412_181500_…` | Temps ventilé | **R1** | Partiel / probable | Contrat local | No-op ou ajouts mineurs | faible | Idem R1 |
| 9 | `20260412191500` | `…_employee_schedule_and_sms_alerts.sql` | `20260412_191500_…` | Horaires / SMS | **R6** | Preuve colonne/table incomplète | Contrat schedule+SMS | Preuve insuffisante | moyen | Audit DDL dédié avant lot |
| 10 | `20260418140000` | `…_horodateur_phase1_schema.sql` | `20260418_140000_…` | Horodateur Phase1 | **R5** | `actor_user_id`+`employee_id` OK ; `user_id` **encore présent** ; vue non alignée | DROP `user_id` + vue R6 | DROP vs conservation legacy | **bloquant** métier | Décider conservation `user_id` ; ne jamais DROP sans GO |
| 11 | `20260418141000` | `…_horodateur_phase1_rls.sql` | `20260418_141000_…` | RLS Horodateur | **R2** | Policies présentes (variantes) | Policies Phase1 locales | Alignement policy | moyen | Après décision R5 sur 18140000 |
| 12 | `20260419103000` | `…_horodateur_exception_direction_notifications.sql` | `20260419_103000_…` | Notif exceptions | **R1** | Configs alertes présentes | Même famille | No-op probable | faible | Verify puis applied |
| 13 | `20260419141500` | `…_horodateur_direction_alert_config_and_reminders.sql` | `20260419_141500_…` | Alert config | **R1** | Table config présente | Contrat local | Mineur | faible | Verify puis applied |
| 14 | `20260419164500` | `…_horodateur_lateness_notifications.sql` | `20260419_164500_…` | Retards | **R1** | Empreintes partielles OK | Contrat local | Mineur | faible | Verify puis applied |
| 15 | `20260420110000` | `…_horodateur_events_canonical_minimal.sql` | `20260420_110000_…` | Canon HE | **R3** | Schéma déjà élargi | Minimal + garde `user_id` | Supersédé / collision DROP | élevé | Ne pas rejouer aveuglément ; applied après preuve no-op |
| 16 | `20260420111000` | `…_chauffeurs_telephone_canonical_minimal.sql` | `20260420_111000_…` | Téléphone | **R1** | Colonnes téléphone probables | Canon minimal | No-op probable | faible | Verify puis applied |
| 17 | `20260420112000` | `…_horodateur_core_guardrails_minimal.sql` | `20260420_112000_…` | Guardrails HE | **R5** | Contraintes partielles | Guardrails locaux | Peut rejeter données | élevé | GO métier / audit comptes agrégés |
| 18 | `20260421113000` | `…_delivery_phase_a_minimal.sql` | `20260421_113000_…` | Livraison Phase A | **R2** | Tracking lié absent | Champs Phase A | Dépend tokens | moyen | Après lot tracking |
| 19 | `20260425090500` | `…_photos_dossier_proof_metadata.sql` | `20260425_090500_…` | Photos / preuves | **R6** | Tables photos/preuves mixtes | Metadata locale | Preuve colonnes incomplète | moyen | Audit schéma photos |
| 20 | `20260425133500` | `…_storage_photos_dossiers_policy_alignment.sql` | `20260425_133500_…` | Storage policies | **R6** | Storage hors dump `public` | Policies storage | Non vérifiable dump public | élevé | Inspect storage schema RO dédié |
| 21 | `20260425140500` | `…_operation_proofs_note_type.sql` | `20260425_140500_…` | Proofs note_type | **R2** | `operation_proofs` présent ; note_type ? | Colonne/check note | Possiblement manquante | moyen | ADD IF NOT EXISTS |
| 22 | `20260426120500` | `…_livraisons_planifiees_inline_stop_fields.sql` | `20260426_120500_…` | Stops inline | **R2** | Champs stop **absents** | Colonnes inline stop | Colonnes manquantes | moyen | Forward ADD COLUMN |
| 23 | `20260429120000` | `…_rls_account_requests_temps_titan.sql` | `20260429_120000_…` | RLS AR/TT | **R2** | RLS présentes (variantes) | Policies locales | Diff helpers role | moyen | Diff policies RO puis align |
| 24 | `20260429130000` | `…_security_advisor_view_and_metadata_policies.sql` | `20260429_130000_…` | Vues sécurité | **R2** | Vue terrain divergente | Vues R5+R6 locales | Dépend lots C/D | élevé | Dernier lot vues |

### Dépendances (synthèse)

- `10140000` / `29130000` dépendent de la décision GPS + HE.
- `18141000` dépend de `18140000` (R5).
- `21113000` dépend de `11101500` (R4/R2 tracking).
- `20110000` / `08190000` (R3) ne doivent pas précéder la décision DROP/`user_id`.

### Données éventuellement touchées (sans ligne métier exposée)

- R4 `11101500` : backfill `tracking_token` possible pour lignes `livraisons_planifiees` sans token (compte agrégé seulement).
- R5 `18140000` : DROP `user_id` pourrait casser clients dépendants de la colonne.
- R2 `10130000` : UPDATE GPS company_context (agrégats null vs non-null uniquement).

---

## 4. Écarts principaux (prouvés)

| Écart | Preuve |
|-------|--------|
| `tracking_token` absent | dump + count colonne = 0 |
| `sorties_terrain.company_context` absent | dump + count = 0 |
| Vue `direction_terrain_positions` = `gps_positions` | dump DDL |
| `horodateur_events.user_id` encore présent | dump + count = 1 |
| `employee_id` / `actor_user_id` présents | dump + count = 1 |
| Inline stop fields absents | pas de match stop_sequence/adresse_stop |
| H4 SaaS absentes | `organizations` count = 0 |

---

## 5. Lots futurs (non exécutés)

Note R10 : exemples SQL dans les lots non encore exécutés restent **DOC ONLY** jusqu’à GO Martin du lot.

### LOT H5-A — Fondations horaires / pauses / notifs (risque faible)

**Statut 2026-07-14 bureau :** **EXÉCUTÉ** — voir `TAGORA-TIME-SAAS1B1B-H5A-EXECUTION-2026-07-14.md`
Forward-only `20260714140000_h5a_reconcile_foundations_columns.sql` applied staging ; historiques R1 restent pending.

- Migrations : `12170000`, `12181500`, `19103000`, `19141500`, `19164500`, `20111000` (R1)
- Prérequis : staging RO snapshot ; H2/H3 inchangés
- Opérations futures : replay idempotent ou mark applied après preuve no-op
- Tests : empreintes tables/colonnes ; pas de ligne métier
- STOP : objet manquant inattendu / erreur non-IF EXISTS
- Rollback : `repair --status reverted` si mark too early ; pas de DROP
- Risque : **faible**

### LOT H5-B — Contexte compagnie + tracking (risque élevé)

**Statut 2026-07-14 bureau :** **EXÉCUTÉ** — voir `TAGORA-TIME-SAAS1B1B-H5B-EXECUTION-2026-07-14.md`

- Migrations : `10130000` (R2), `12103000` (R2), `11101500` (R4), `21113000` (R2)
- Prérequis : GO H5-A ; portes agrégées unresolved=0 / conflicts=0 / token dups=0
- Forward-only exécuté :

`supabase/migrations/20260714150000_h5b_reconcile_company_context_tracking.sql`

- Historiques H5-B restent **pending** ; seule la version `20260714150000` est marked applied.
- Politique : pas de fallback `oliem_solutions` sur lignes ambiguës ; tracking ancien `false` ; tokens `gen_random_bytes` ; pas de SMS ; `type_operation` nullable historique.
- STOP : unresolved / conflit / doublon token / orphelin FK
- Rollback : `migration repair 20260714150000 --status reverted` (DDL non auto-retiré)
- Risque : **élevé** (mitigé staging tables métier vides)
- Décision / preuve : `docs/handoffs/TAGORA-TIME-SAAS1B1B-H5B-EXECUTION-2026-07-14.md`

### LOT H5-C — GPS / vue Direction terrain (risque élevé)

**Statut 2026-07-14 bureau :** **EXÉCUTÉ** — voir `TAGORA-TIME-SAAS1B1B-H5C-EXECUTION-2026-07-14.md`

- Migrations : `10140000` (R2), dépendance partielle `29130000` (**security_invoker seulement**)
- Prérequis : GO H5-B ; colonnes gps/sorties/horodateur présentes ; `user_id` conservé
- Forward-only exécuté :

`supabase/migrations/20260714160000_h5c_reconcile_direction_terrain_view.sql`

- Contrat pré-H5-D : `horodateur_events.user_id` (pas de join `employee_id` / chauffeurs)
- Historiques `10140000` / `29130000` restent **pending**
- STOP : prérequis colonne manquant / regression Direction terrain
- Rollback : `migration repair 20260714160000 --status reverted` + restore DDL snapshot
- Risque : **élevé** (mitigé staging vue GPS-only + 0 lignes)


### LOT H5-D — Transition Horodateur (risque bloquant)

- Migrations : `18140000` (R5), `18141000` (R2), `08190000`/`20110000` (R3), `20112000` (R5)
- Prérequis : **décision métier** conservation `user_id`
- Interdit sans GO : `DROP COLUMN user_id`
- STOP : toute tentative DROP sans checklist lignes dépendantes (agrégats)
- Rollback : history only ; pas de recreation col sans mandat
- Risque : **bloquant** tant que R5 non tranché
- **Statut H5-D1 :** `H5-D1 AUDITÉ — OPTION B APPROUVÉE` (Martin) — voir `TAGORA-TIME-SAAS1B1B-H5D1-USER-ID-DECISION-2026-07-15.md`
- **Statut H5-D2 :** dépréciation contrôlée `user_id` (DROP NOT NULL + vue `employee_id` / `chauffeurs.auth_user_id`) — `20260715120000` ; **aucun DROP COLUMN**
- Recommandation exécutée : Option B (conserver colonne, déprécier)
- **Statut H5-D3 :** `H5-D3 OBSERVATION INSUFFISANTE — AUCUN ÉVÉNEMENT POST-DÉPLOIEMENT` (table HE staging = 0 ; pas de stabilisation données réelles) — voir `TAGORA-TIME-SAAS1B1B-H5D3-OBSERVATION-2026-07-15.md`
- **Statut H5-D4 :** `H5-D4 VALIDÉ — PREUVE TRANSACTIONNELLE STAGING RÉUSSIE, AUCUNE DONNÉE PERSISTANTE` (BEGIN/insert canonique/`user_id` null/vue/triggers + **ROLLBACK**) — voir `TAGORA-TIME-SAAS1B1B-H5D4-STAGING-TRANSACTIONAL-PROOF-2026-07-15.md` ; trafic réel H5-D3 toujours non observé

### LOT H5-E — Sécurité / RLS / vues finales (risque moyen–élevé)

- Migrations : `29120000` (R2), `29130000` (R2)
- Prérequis : lots C et D stabilisés
- STOP : policy fail-open `USING (true)` non voulue
- Rollback : restore policy names previous
- Risque : **élevé**
- **Statut H5-E1 :** `H5-E1 TERMINÉ — AUDIT SÉCURITÉ/RLS DOCUMENTÉ` — voir `TAGORA-TIME-SAAS1B1B-H5E1-SECURITY-RLS-AUDIT-2026-07-15.md`
- **Statut H5-E2A :** `H5-E2A EXÉCUTÉ — HELPERS DURCIS` — migration `20260715130000` ; voir `TAGORA-TIME-SAAS1B1B-H5E2A-AUTH-HELPERS-HARDENING-2026-07-15.md`
- **Statut H5-E2C :** `H5-E2C EXÉCUTÉ — FAIL-OPEN TERRAIN/HORODATEUR FERMÉS` — migration `20260715140000` ; voir `TAGORA-TIME-SAAS1B1B-H5E2C-TERRAIN-RLS-CLOSURE-2026-07-15.md`
- **Statut H5-E2B :** `H5-E2B EXÉCUTÉ — ACCOUNT_REQUESTS / TEMPS_TITAN DURCIS` — migration `20260715150000` ; voir `TAGORA-TIME-SAAS1B1B-H5E2B-ACCOUNT-REQUESTS-TEMPS-TITAN-RLS-2026-07-15.md`
- **Statut H5-E2D :** `H5-E2D EXÉCUTÉ — GRANTS VUE DIRECTION TERRAIN DURCIS` — migration `20260715160000` ; voir `TAGORA-TIME-SAAS1B1B-H5E2D-DIRECTION-TERRAIN-VIEW-GRANTS-2026-07-15.md`
- **Ne jamais rejouer** `29120000` / `29130000` (vue 2913 supersédée par H5-D2) ; H5-E forward-only **complet** ; suite éventuelle **H5-F** après GO Martin
- Fail-open staging **fermé** en H5-E2C (`horodateur_events_*` public ; `chauffeurs` / `sorties_terrain` `allow all `)
- Avancement V1 : **51 %** (inchangé)

### LOT H5-F — Autres domaines (risque moyen)

- Migrations : `12161500` (R5), `12191500` (R6), `25090500` (R6), `25133500` (R6), `25140500` (R2), `26120500` (R2)
- **Statut H5-F1 :** `H5-F1 TERMINÉ — AUDIT RO DOCUMENTÉ` — voir `TAGORA-TIME-SAAS1B1B-H5F1-OTHER-DOMAINS-AUDIT-2026-07-15.md`
- **Statut H5-F4 :** `GO H5-F4 — HISTORY NORMALISÉ` — trois repairs history-only (`25090500`, `25140500`, `26120500`) ; voir `TAGORA-TIME-SAAS1B1B-H5F4-PROOFS-PHOTOS-INLINE-HISTORY-2026-07-15.md`
- Découpage restant : **H5-F2** comptes ; **H5-F3** SMS/pauses ; **H5-F5** Storage (bloqué / DELETE large ; bucket staging absent)
- Prérequis exécution F2/F3/F5 : **décisions Martin** (surtout SMS + Storage) ; ne jamais rejouer `25133500` / UPDATE global `12191500`
- STOP : rejeu historique Storage ; db push
- Risque : **moyen** à **élevé** (storage)
- Avancement V1 : **51 %** (inchangé)

Chaque lot futur exige : snapshot `migration list` avant/après ; empreintes DDL ; aucun `db push --include-all`.

---

## 6. Stratégie d’historique future

1. Ne jamais `db push` les 24 H5 d’un coup.
2. Lot par lot : forward DDL contrôlé **ou** preuve no-op → `migration repair --status applied`.
3. R3 : préférer preuve no-op + applied, pas de rejeu.
4. R5 : bloquer jusqu’à GO écrit Martin.
5. H4 SaaS (`20260712220000`…`20500`) : **mandat séparé** ; jamais mélangé aux lots H5.

---

## 7. H4 SaaS — protégées (hors R10)

`20260712220000`, `20260712220100`, `20260712220200`, `20260712220300`, `20260712220400`, `20260712220500`
→ tables absentes ; pending strict ; aucun applied / push dans R10.

---

## 8. Validations avant/après chaque lot (futur)

- `npx supabase migration list --linked`
- counts colonnes/cibles (agrégats)
- tests documentaires + ciblés migrations
- STOP si H4 change d’état accidentellement

---

## 9. Rollback générique (documenté)

```text
npx supabase migration repair <VERSION_H5> --status reverted --linked
```

Ne restaure pas automatiquement le DDL ; un mandat inverse distinct est requis pour DROP/ADD inversés.

---

## 10. Interdictions R10 (respectées)

- aucun repair / db push / migration up
- aucune exécution H4/H5
- aucune production
- aucun fichier SQL nouveau dans `supabase/migrations`
- aucun secret / dump dans Git

---

## 11. Prochaine étape après fermeture maison

Synchroniser le bureau sur le checkpoint poussé, puis — **nouveaux GO Martin** — exécuter les lots H5 dans l’ordre A→F selon dépendances et décisions R5.
