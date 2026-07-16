# TAGORA Time — SaaS 1B.1B staging history map (2026-07-14)

**Agent :** Martin  
**Mandat :** SaaS 1B.1B-R8 (audit read-only + plan déterministe)  
**Date :** 2026-07-14  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD WIP :** `21bcca8c4e86a77259f4008c26e8380518ea897c`  
**HEAD feature (protégée) :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  

**Staging (lecture seule) :** `qokyobcvplzufshydhih`  
**Production (interdite) :** `qcgvzdlfsxybrmloijpt`  

**Décision R8 :** READY FOR R9 — MAPPING DÉTERMINISTE ET RÉPARATION D'HISTORIQUE CONTRÔLÉE POSSIBLE  

**Décision R9 :** GO HISTORY — H2/H3 NORMALISÉS, H4/H5 CONSERVÉS PENDING  
(voir `docs/handoffs/TAGORA-TIME-SAAS1B1B-STAGING-HISTORY-REPAIR-2026-07-14.md`)

**Avancement V1 :** **77 %** (après GO H5-F5B ; était **65 %** avant H5-F5 complet — voir `TAGORA-TIME-SAAS1B1B-H5F5B-STORAGE-BUCKET-EXECUTION-2026-07-16.md`)

**Statut H5-F4 (2026-07-15) :** `20260425090500`, `20260425140500`, `20260426120500` → **applied** (repair history-only ; aucun DDL) — voir `TAGORA-TIME-SAAS1B1B-H5F4-PROOFS-PHOTOS-INLINE-HISTORY-2026-07-15.md`

**Statut H5-F2 (2026-07-15) :** `20260412161500` → **applied** (repair history-only ; aucun DDL ; candidate_update_count=0) — voir `TAGORA-TIME-SAAS1B1B-H5F2-EMPLOYEE-ACCOUNT-HISTORY-2026-07-15.md`

**Statut H5-F3R (2026-07-15) :** `20260412191500` → **applied** (repair history-only ; UPDATE supersédé ; écart `break_am_minutes`×2 approuvé) — voir `TAGORA-TIME-SAAS1B1B-H5F3R-SCHEDULE-SMS-LEGACY-SUPERSESSION-2026-07-15.md`

**Écritures distantes R8 :** aucune  
**migration repair / db push R8 :** **non executes**  
**Commit / push R8 :** aucun  

---

## 1. Objectif

Mapper de façon déterministe :

1. versions staging **8 chiffres** ;
2. anciens noms locaux `YYYYMMDD_HHMMSS_*.sql` ;
3. noms canoniques locaux `YYYYMMDDHHMMSS_*.sql` ;
4. empreintes DDL réellement présentes sur le schéma staging.

Sans aucune écriture distante.

---

## 2. Inventaire local

| Item | Valeur |
|------|--------|
| Total migrations locales | **96** (95 post H4-B3 + H5-F5B `20260716223000`) |
| Renommages legacy (R4) | **42** |
| Hash avant/après rename (R4) | **42/42 identiques** (contenu SQL inchangé au moment du rename) |
| Versions 14 chiffres uniques | **96** (0 doublon) |
| Première version | `20260407000000` |
| Dernière version | `20260716223000` (H5-F5B) |
| Empreinte LF fichiers+SHA-256 (portable, post H5-F5B) | `BB1112A3C4948D72CE250DCCB3E105F2EC98C9A9814DFD77313684B0BA381D34` |
| Empreinte LF fichiers+SHA-256 (portable, post H4-B3) | `9950695E0F10C6495BBF3D2903716A89AC567CE49D0EC26C21AEDB119C04482C` |
| Empreinte LF fichiers+SHA-256 (portable, post H4-B2) | `0144D8372B304E8A4D0BAF5CA0F83B093B312F075F03F3FEE85F7E2023067D67` |
| Empreinte LF fichiers+SHA-256 (portable, post H4-B1) | `D2F725E8E00B5A8E8542C5B542BC3828A85A02D667ED1C729468DC8A86C53A2D` |
| Empreinte LF fichiers+SHA-256 (portable, post H5-E2D) | `CD5CB3A15731B192FEB4B6658DBD6A34970BABD20E278CC33CC298371D219C5E` |
| Empreinte LF fichiers+SHA-256 (portable, post H5-E2B) | `2904E0362A4279FA820A2AFC466EBE33387715208D2DCBD30741116AC62D9717` |
| Empreinte LF fichiers+SHA-256 (portable, post H5-E2C) | `26D0DE598ECECC64D3FCD00B0B3B18AEF268669C9C4655DB9C6A4A38D4CFDEA8` |
| Empreinte LF fichiers+SHA-256 (portable, post H5-E2A) | `06BE51BF780911385B15C7F8E05890DD47F5F41CAD5C0EA3A04D071ECEDF42A0` |
| Empreinte LF fichiers+SHA-256 (portable, post H5-D2) | `F0AED47A8C7791A08873C10E2741D503E325105FEF78A5AD7B7A731CD48A93B6` |
| Empreinte git ls-tree (84 fichiers, pre-H5-A) | `370C9C7A2F686D5A49FCD6BF644DC971F6B289C1F63E27B195663E0AFD2A927B` |
| Empreinte fichier+SHA-256 historique (poste maison R8, non portable CRLF) | `2A2693481D3684C8CF836CB9AE43BB78A761C244568D9A6052CDA64502A31863` |

### Contenu SQL modifié après rename (R3–R7, conservé)

Ces fichiers restent les canoniques locaux mais **différent** du contenu Git HEAD initial ; le staging historique a vu une variante antérieure :

| Fichier canonique | Correction |
|-------------------|------------|
| `20260410130000_gps_direction_and_company_hardening.sql` | GPS R3 |
| `20260410140000_direction_terrain_compatibility.sql` | Temps R5 |
| `20260418140000_horodateur_phase1_schema.sql` | Transition vue R6 |
| `20260426103500_create_app_improvements.sql` | Alignement colonnes R7 |
| `20260429130000_security_advisor_view_and_metadata_policies.sql` | Vues R5+R6 |

### Rôles

| Rôle | Versions |
|------|----------|
| baseline | `20260407000000` |
| bootstrap | `20260409120000` |
| legacy-renamed | 42 fichiers R4 |
| fonctionnel déjà 14 chiffres alignés | `20260502140000` … (sauf absences SaaS / 8-digit `20260513`) |
| SaaS 1B.1 | `20260712220000` … `20260712220500` |

Référence rename détaillée : `docs/handoffs/TAGORA-TIME-SAAS1B1B-MIGRATION-VERSION-MAP-2026-07-13.md`.

---

## 3. Inventaire distant (lecture seule)

Commande utilisée (sans secret) :

```text
npx supabase migration list --linked
```

Project ref confirmé via `supabase/.temp/project-ref` : `qokyobcvplzufshydhih` (≠ production).

Sortie expurgée : `%TEMP%\tagora-time-migration-list-r8.txt`

### Versions staging à 8 chiffres (14)

`20260408`, `20260410`, `20260411`, `20260412`, `20260416`, `20260418`, `20260419`, `20260420`, `20260421`, `20260425`, `20260426`, `20260428`, `20260429`, `20260513`

### Versions staging à 14 chiffres (alignées local/remote)

**34** versions exactes communes (H1), à partir de `20260502140000` jusqu’à `20260707120000`, **hors** `20260513` (8 chiffres seulement côté remote).

### Local only (absentes du remote comme version 14)

**50** versions : baseline + bootstrap + 42 renames + 6 SaaS.

Le remote présente chaque collision de date comme **une seule** entrée 8 chiffres pour **N** fichiers locaux historiques.

---

## 4. Dump schema-only

| Champ | Valeur |
|-------|--------|
| Chemin | `%TEMP%\tagora-time-staging-schema-r8-2026-07-14.sql` |
| Source | copie bit-à-bit du dump R2 (même contenu) |
| Taille | 202480 |
| Date fichier | 2026-07-13 19:27:15 |
| SHA-256 | `0395B82B2CF263E004BA21E501D712BC512EADADD149812F2E175A8D1BCD3269` |
| Project ref | `qokyobcvplzufshydhih` |
| Contenu | schema-only `public` ; pas de données métier ; hors Git |

---

## 5. Mapping ancien → canonique (42)

Règle : `YYYYMMDD_HHMMSS_desc.sql` → `YYYYMMDDHHMMSS_desc.sql` (concaténation).

| Remote 8 | Ancien local | Canonique | Locals dans le groupe |
|----------|--------------|-----------|------------------------|
| 20260408 | `20260408_190000_horodateur.sql` | `20260408190000_…` | 1 |
| 20260410 | `20260410_120000_…`, `_130000_…`, `_140000_…` | `20260410120000`, `10130000`, `10140000` | 3 |
| 20260411 | `20260411_101500_…` | `20260411101500_…` | 1 |
| 20260412 | 7 fichiers `_103000`…`_213000` | `12103000`…`12213000` | 7 |
| 20260416 | `_120000`, `_193500` | `16120000`, `16193500` | 2 |
| 20260418 | `_140000`, `_141000` | `18140000`, `18141000` | 2 |
| 20260419 | 3 fichiers | `19103000`…`19164500` | 3 |
| 20260420 | 3 fichiers | `20110000`…`20112000` | 3 |
| 20260421 | `_113000` | `21113000` | 1 |
| 20260425 | 5 fichiers | `25090500`…`25143000` | 5 |
| 20260426 | 3 fichiers | `26103500`…`26120500` | 3 |
| 20260428 | 6 fichiers | `28120000`…`28235500` | 6 |
| 20260429 | 4 fichiers | `29001500`…`29140000` | 4 |
| 20260513 | `20260513_103000_…` | `20260513103000_…` | 1 |

**Mapping nominal : 100 % déterministe.**  
**Ambiguïté restante :** une entrée remote 8 chiffres ne prouve pas que les N SQL locaux du groupe ont tous été appliqués.

---

## 6. Groupes legacy — statut d’effets (DDL)

Légende groupe : **A** tous effets ; **B** partiels ; **C** impossibles à distinguer seuls ; **D** remote absent ; **E** incohérence schéma.

| Groupe remote | # locals | Empreintes staging clés | Statut |
|---------------|----------|-------------------------|--------|
| 20260408 | 1 | `horodateur_events` présent (+ colonnes phase1 ultérieures) | **B** |
| 20260410 | 3 | `primary_company` OK ; `sorties_terrain.company_context` **absent** ; vue `direction_terrain_positions` = `SELECT … FROM gps_positions` (**≠** définition locale R5/R6) | **E/B** |
| 20260411 | 1 | `tracking_token` / `tracking_enabled` **absents** ; `client_phone` présent | **B** |
| 20260412 | 7 | `app_improvements`, `gps_bases` présents ; effets divers | **B** |
| 20260416 | 2 | `chauffeurs.auth_user_id` présent | **A** (empreintes auth/account) |
| 20260418 | 2 | `actor_user_id`, `employee_id` présents ; `user_id` **encore présent** (DROP local non reflété) | **B/E** |
| 20260419 | 3 | tables/configs alertes horodateur présentes (`horodateur_direction_alert_config`, etc.) | **A/B** |
| 20260420 | 3 | schéma horodateur canonique partiel ; `user_id` legacy conservé | **B** |
| 20260421 | 1 | delivery phase A — tokens tracking absents → partiel | **B** |
| 20260425 | 5 | `operation_proofs` présent ; colonnes alert recipients sur `chauffeurs` présentes | **A/B** |
| 20260426 | 3 | `app_improvements` contrat final (`en_attente`, `treated_at`, checks) ; policies admin via `current_app_role` | **A** (empreintes principales) |
| 20260428 | 6 | `archived_at`/`deleted_by`, prefs notif, audit ramassage, alert config, `user_role_audit_logs` | **A/B** |
| 20260429 | 4 | `internal_mentions`, RLS, `weekly_schedule_config` ; vue terrain staging ≠ locale | **B** |
| 20260513 | 1 | colonnes audit user sur livraisons (`created_by_*`) présentes | **A** |

---

## 7. Empreintes physiques (échantillon vérifiable)

| Migration / thème | Empreinte | Staging |
|-------------------|-----------|---------|
| Baseline RBAC | fonctions `current_app_role`, `is_admin_user`, `is_direction_user`, `has_app_permission`, … | **présentes** |
| Bootstrap | tables historiques (`chauffeurs`, `horodateur_events`, …) | **présentes** (59 tables public) |
| Company activation `10120000` | `chauffeurs.primary_company`, `account_requests_company_check` | **présentes** |
| GPS `10130000` | `sorties_terrain.company_context` | **absente** |
| Direction terrain `10140000` / R5-R6 | vue union sorties+horodateur + `America/Toronto` | **vue différente** (gps_positions only) |
| Tracking `11101500` | `livraisons_planifiees.tracking_token` | **absente** |
| Horodateur Phase1 `18140000` | `actor_user_id`, `employee_id` ; absence `user_id` | colonnes **oui** ; DROP `user_id` **non** |
| app_improvements `26103500`+`28120000` | `treated_at`, `deleted_at`, `archived_*`, check `en_attente` | **présentes** |
| SaaS 1B.1 | 7 tables `organizations`…`platform_access_audit` | **absentes** |

Aucune donnée métier lue.

---

## 8. Classification H1–H6 (résumé quantitatif)

| Classe | Signification | Nombre |
|--------|---------------|--------|
| **H1** | version distante 14 chiffres exacte | **34** |
| **H2** | remote 8 chiffres + effets canoniques du fichier **complets** | **18** |
| **H3** | remote absent, effets DDL déjà présents | **2** (baseline + bootstrap) |
| **H4** | remote absent, effets absents | **6** (SaaS) |
| **H5** | effets partiels / incompatibles vs canon local | **24** |
| **H6** | mapping ambigu non classifiable | **0** |

Total : 34+18+2+6+24 = **84**.

### Liste H2 exacte (18) — candidates `applied` R9

`20260410120000`, `20260412201500`, `20260412213000`, `20260416120000`, `20260416193500`, `20260425093500`, `20260425143000`, `20260426103500`, `20260426111500`, `20260428120000`, `20260428150000`, `20260428203500`, `20260428214500`, `20260428220500`, `20260428235500`, `20260429001500`, `20260429140000`, `20260513103000`

### Liste H5 exacte (24) — historique R8/R9

`20260408190000`, `20260410130000`, `20260410140000`, `20260411101500`, `20260412103000`, `20260412161500`, `20260412170000`, `20260412181500`, `20260412191500`, `20260418140000`, `20260418141000`, `20260419103000`, `20260419141500`, `20260419164500`, `20260420110000`, `20260420111000`, `20260420112000`, `20260421113000`, `20260425090500`, `20260425133500`, `20260425140500`, `20260426120500`, `20260429120000`, `20260429130000`

**Post H5-F4 (2026-07-15) :** `20260425090500`, `20260425140500`, `20260426120500` → **applied** (history-only, no-op DDL).

**Post H5-F2 (2026-07-15) :** `20260412161500` → **applied** (history-only, no-op DDL).

**Post H5-F3R (2026-07-15) :** `20260412191500` → **applied** (history-only ; UPDATE legacy supersédé) ; reste pending côté F : `25133500` (+ autres H5 non F2/F3/F4).

### Détail spécial

| Élément | Classe | Action future |
|---------|--------|---------------|
| Baseline RBAC `20260407000000` | **H3** | candidate `applied` après checklist fonctions ; ne pas rejouer destructif |
| Bootstrap `20260409120000` | **H3** | **ne jamais exécuter aveuglément** sur staging ; candidate `applied` (idempotent IF NOT EXISTS) **ou** exclusion push contrôlée |
| GPS `20260410130000` | **H5** | laisser **pending** jusqu’à mandat DDL dédié |
| Direction `20260410140000` | **H5** | laisser **pending** (vue staging divergente) |
| Tracking `20260411101500` | **H5** | laisser **pending** (`tracking_token` absent) |
| Horodateur `20260418140000` | **H5** | `applied` **interdit** tant que contrat DROP/`vue` non tranché ; ne pas rejouer DROP sur staging sans GO |
| app_improvements `26103500` / `26111500` / `28120000` | **H2** | candidates `applied` (DDL final présent) |
| SaaS organizations `20260712220000` | **H4** | pending — vraie application DDL |
| SaaS organization_companies `20260712220100` | **H4** | pending |
| SaaS organization_settings `20260712220200` | **H4** | pending |
| SaaS organization_memberships `20260712220300` | **H4** | pending |
| SaaS organization_invitations `20260712220400` | **H4** | pending |
| SaaS platform_access (+ audit) `20260712220500` | **H4** | pending |

**Règle R9 :** toute H5 reste **pending**. Aucune H6.

---

## 9. Plan de réparation future (R9) — **NON EXÉCUTÉ**

### Ordre exact

1. **Sauvegarde read-only** de `supabase migration list --linked` → fichier horodaté hors Git.  
2. **Preuve schéma** : re-hasher dump schema-only ; rejouer checklist empreintes §7.  
3. **STOP conditions :** project ref ≠ `qokyobcvplzufshydhih` ; empreinte H2 devenue H5 ; présence production ref.  
4. **Reverted (proposé)** — anciennes versions **8 chiffres** uniquement :

```text
npx supabase migration repair --status reverted 20260408
npx supabase migration repair --status reverted 20260410
npx supabase migration repair --status reverted 20260411
npx supabase migration repair --status reverted 20260412
npx supabase migration repair --status reverted 20260416
npx supabase migration repair --status reverted 20260418
npx supabase migration repair --status reverted 20260419
npx supabase migration repair --status reverted 20260420
npx supabase migration repair --status reverted 20260421
npx supabase migration repair --status reverted 20260425
npx supabase migration repair --status reverted 20260426
npx supabase migration repair --status reverted 20260428
npx supabase migration repair --status reverted 20260429
npx supabase migration repair --status reverted 20260513
```

5. **Applied (proposé)** — uniquement versions **H2** (+ optionnel H3 baseline/bootstrap après GO explicite) ; **jamais** H4/H5. Exemple de forme :

```text
npx supabase migration repair --status applied 20260410120000
npx supabase migration repair --status applied 20260426103500
npx supabase migration repair --status applied 20260426111500
npx supabase migration repair --status applied 20260428120000
# … liste H2 complète figée dans le mandat R9, une par une
```

6. **Pending à laisser** : toutes **H5** + six **SaaS H4**.  
7. **Vérification après chaque groupe :** `migration list` + empreintes DDL ; STOP si divergence.  
8. **Aucun SQL métier** (`INSERT`/`UPDATE`/`DELETE` données) pendant le repair d’historique.  
9. **Aucun `db push`** dans le même mandat que le repair massif, sauf sous-GO séparé pour migrations H4/H5 réellement à exécuter.

### Plan de retour arrière

1. Restaurer les 14 versions 8 chiffres via `migration repair --status applied <8digits>` (inverser le reverted).  
2. `migration repair --status reverted` sur chaque 14 chiffres indûment marqué applied.  
3. Revalider `migration list` = état capturé étape 1.  
4. Aucune restauration de données métier (history-only).

### Interdit durant R9 (rappel)

- production `qcgvzdlfsxybrmloijpt`  
- `db push` non autorisé sans GO distinct  
- bootstrap exécuté en « vrai » DDL si risque non idempotent  
- marquer SaaS applied sans les 7 tables + RLS FORCE

---

## 10. Risques

| Risque | Niveau |
|--------|--------|
| Rejeu d’une migration canonique déjà partiellement appliquée | **élevé** |
| Double création / collision IF NOT EXISTS masquant un manque | **moyen** |
| Divergence historique ↔ schéma après repair incorrect | **élevé** |
| 1 remote 8 chiffres ↔ N locals | **élevé** (d’où H5) |
| Marquer applied une migration H5 | **bloquant** |
| `db push` destructif post-repair mal cadré | **bloquant** |
| Bootstrap rejoué sans précaution | **élevé** |
| SaaS marquées applied alors absentes | **bloquant** |
| Contenu local R3–R7 ≠ SQL historiquement poussé | **élevé** |
| Retour arrière history-only | **faible** (possible via repair inverse) |

**Risques bloquants avant R9 :** aucune H5/H4 marquée applied ; aucun push SaaS/GPS/vue avant checklist.

---

## 11. Commandes repair exécutées durant R8

**Aucune.**

## 12. db push / staging / production

| Action | Statut |
|--------|--------|
| db push | non |
| Staging modifié | non |
| Production touchée | non |
| Commit | non |
| Push git | non |

---

## 13. Prochaine étape unique

**Mandat R9 (GO Martin distinct) :** exécuter uniquement le repair d’historique contrôlé (reverted 8 chiffres → applied H2/H3 approuvés), sans `db push` SaaS/H5, puis revalider `migration list` + empreintes.

---

## 14. Décision

**READY FOR R9 — MAPPING DÉTERMINISTE ET RÉPARATION D'HISTORIQUE CONTRÔLÉE POSSIBLE**

Même avec READY : ne pas exécuter repair/push/commit ; ne pas intégrer feature ; ne pas démarrer SaaS 1B.2 ; V1 reste **51 %**.
