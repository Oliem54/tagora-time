# TAGORA Time — SaaS 1B.1B H5-F1 — Audit RO autres domaines + découpage H5-F (2026-07-15)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `39ab7e0dcf292ac0b009d0856ec2dd818a39f224`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

**Portée :** audit RO uniquement — **aucune** migration SQL, aucune écriture staging, aucun Storage write, aucune donnée modifiée, aucun `migration repair`, aucun `db push`.

---

## 1. Six migrations H5-F

| Version | Fichier | Cat. | Domaine |
|---------|---------|------|---------|
| `20260412161500` | `…_employee_account_management.sql` | **R5** | Comptes employés |
| `20260412191500` | `…_employee_schedule_and_sms_alerts.sql` | **R6** | Horaires / pauses / SMS |
| `20260425090500` | `…_photos_dossier_proof_metadata.sql` | **R6** | Metadata photos_dossier |
| `20260425133500` | `…_storage_photos_dossiers_policy_alignment.sql` | **R6** | Policies Storage `photos-dossiers` |
| `20260425140500` | `…_operation_proofs_note_type.sql` | **R2** | Contrainte `type_preuve` + `note` |
| `20260426120500` | `…_livraisons_planifiees_inline_stop_fields.sql` | **R2** | Champs arrêts inline |

Historique staging : **les six restent pending** (absentes de `schema_migrations`). H5-A→E2D applied. H4 pending = **6**.

---

## 2. Contenu exact (résumé)

### 12161500
- ADD `auth_user_id` (FK auth.users), `social_benefits_percent` default 15, `titan_billable` default false, `planned_*_hours`, `scheduled_work_days` default `{}`
- UNIQUE partial index `idx_chauffeurs_auth_user_id`
- UPDATE backfill `social_benefits_percent` / `titan_billable` depuis legacy `can_work_for_titan_produits_industriels`

### 12191500
- ADD 12 colonnes pauses (am/lunch/pm) + 10 flags SMS (defaults **true**)
- UPDATE **global** (`where true`) dérivant pauses de `break_1/2/3_*` et SMS de `sms_alerts_enabled`

### 25090500
- ADD `proof_type`, `proof_name`, `linked_record_type`, `linked_record_id` + 2 index

### 25133500
- DROP/CREATE SELECT/INSERT/**DELETE** sur `storage.objects` pour bucket `photos-dossiers`
- Autorisation : `documents` OU `livraisons` OU `terrain`
- **Aucun** filtre owner / folder / tenant — **DELETE trop large**

### 25140500
- Remplace check `operation_proofs_type_preuve_check` → `(document, voice, signature, note)`

### 26120500
- ADD `ville`, `code_postal`, `province`, `latitude`, `longitude`, `note_chauffeur`, `commentaire_operationnel`

**Supersédés / doublons locaux :** `20260409120000` bootstrap + `20260416193500_ensure_chauffeurs_account_request_columns.sql` rejouent déjà une partie chauffeurs ; ne jamais conclure au seul nom de fichier.

---

## 3. Baseline staging (agrégats, sans PII)

### Chauffeurs (n=2)
- Colonnes H5-F **présentes** (account + pauses + SMS + legacy `break_1/2/3` + `sms_alerts_enabled`)
- Index `idx_chauffeurs_auth_user_id` : **présent**
- `auth_user_id` : 2 non-null, **0** groupe doublon
- `social_benefits_percent` : 2/2 non-null (default 15 effectif)
- `titan_billable` : 0 true / 2 false
- `planned_*_hours` : 0 non-null
- `scheduled_work_days` : 2 vides
- Legacy titan true : 0

### photos_dossier
- Table existe ; RLS enabled ; 10 colonnes ; metadata ×4 présentes ; 2 index ; **0** lignes

### Storage
- Bucket `photos-dossiers` : **absent** (`bucket_n=0`)
- `storage.objects` policies (schéma storage) : **0** au total sur staging
- Objets : 0
- **Ne jamais rejouer** 25133500 tel quel (DELETE non borné ; bucket à créer sous mandat)

### operation_proofs
- Existe ; **0** lignes
- Check actuel déjà : `document|voice|signature|note`
- Types hors domaine : 0

### livraisons_planifiees
- 7 champs inline **présents** ; **0** lignes ; tous compteurs non-null = 0

### Snapshots TEMP (SHA-256 fichiers)
| Fichier | SHA-256 |
|---------|---------|
| migration-list | `E84EAD777CB5D909B9AE697510E5E91096CB2320DFDD0BE74FE9A9D91AF12B33` |
| chauffeurs-schema | `FA2C41160EE1D03679863F52F6F2B60C1E389004A434D56C9A074C61B90C0BCC` |
| chauffeurs-aggregates | `8B18A903C3EC00E4269CA7846D8B3133294BCC9881DB1539F84679EF4ECFD179` |
| photos-schema | `587891FB9358549790C2F528A13912C779378585D2719405B959AF4AA8B847AA` |
| storage-policies (synthèse) | `2966E0152702E0BC1F99710663BB85B16E80C452DEF398A6E1AB06430B93878F` |
| operation-proofs | `3C8794E3F8F47020C32014D6E38D53F78AA5AC007888740E050377F2C3C9035C` |
| inline-stops agg | `2407C39DADB4592EB28B85E0280F56C1EB547D0909D34D92AA416B1116D39880` |

---

## 4. Dépendances code (lecture/écriture)

| Domaine | Surfaces |
|---------|----------|
| Comptes / horaires / SMS | `EmployeeProfilePageClient`, `employee-profile-shared`, `weekly-schedule`, `effectifs`, `account-requests/[id]`, `employee-schedule-notify` |
| Photos metadata | `employe/dossiers/[id]` (proof_*), documents, dashboard |
| Bucket `photos-dossiers` | `OperationProofsPanel`, `upload-operation-proof`, `StopSignatureQuickCapture`, archives zip |
| `operation_proofs` + `type_preuve=note` | `OperationProofsPanel` (insert note), reception-proofs |
| Inline stop | `api/livraisons`, `inline-stop`, DayOperations, ramassages (`commentaire_operationnel`) |

Pas de table d’arrêts alternative canonique identifiée pour remplacer les colonnes inline V1.

---

## 5. Matrice Local / Staging / Code

| Migration | Objet | Local | Staging | Code | Données à transformer | Risque | Classe | Décision |
|-----------|-------|-------|---------|------|----------------------|--------|--------|----------|
| 12161500 | cols+index chauffeurs | présent | présent ; mig pending | oui | backfill probablement no-op | moyen | **A** (+ E defaults) | Ne pas rejouer UPDATE sans GO ; preuve no-op + repair possible |
| 12191500 | pauses+SMS | présent | présent ; pending | oui | UPDATE global dangereux | élevé | **E/D** | Colonnes OK ; **interdire** `WHERE true` ; décisions SMS |
| 25090500 | metadata photos | présent | présent ; 0 rows | oui | non | bas | **A** | Preuve no-op |
| 25133500 | Storage policies | policies locales sans bucket | **bucket absent** ; **0** policy storage | oui | création bucket | **critique** | **F/G** | Lot H5-F5 ; attendre décisions + idéalement H4 |
| 25140500 | check note | note inclus | note inclus ; 0 rows | oui note | non | bas | **A** | Preuve no-op |
| 26120500 | inline stop | présent | présent ; 0 rows | oui | non | bas | **A** | Preuve no-op |

---

## 6. Décisions Martin (questions fermées)

### 12161500
1. Conserver défaut `social_benefits_percent = 15` ?  
2. `titan_billable` dérivé de `can_work_for_titan_*` encore requis (staging déjà false) ?  
3. `planned_*_hours` / `scheduled_work_days` restent optionnels / `{}` ?  
4. Conserver unicité partielle `auth_user_id` (0 conflit actuel) ?  
5. Autoriser **repair applied** sans rejeu UPDATE si empreinte DDL prouvée ?

### 12191500
1. Toutes alertes SMS default **true** souhaitées ?  
2. Hériter de `sms_alerts_enabled` pour lignes existantes ?  
3. Dériver pauses de `break_1/2/3` ?  
4. Heures de pause null acceptables ?  
5. **Interdire** UPDATE global (`where true`) — colonnes-only puis backfill optionnel séparé ?  

### 25090500
1. Metadata encore requises V1 (oui côté dossiers) ?  
2. Borner `linked_record_type` / catalogue `proof_type` ?  
3. `linked_record_id bigint` suffisant ?

### 25133500 (bloquant)
1. Qui lit / upload / **supprime** ?  
2. Employé+terrain peut-il supprimer **toutes** les photos ? (historique = oui → **inacceptable**)  
3. DELETE limité owner ou Direction/Admin ?  
4. Filtre organisation après H4 ?  
5. **Reporter après H4** ?

### 25140500
1. Types officiels = `document|voice|signature|note` ? (déjà en base + code)  
2. Autre valeur legacy ? (non détectée, 0 rows)

### 26120500
1. Colonnes inline = source canonique arrêt V1 ?  
2. Lat/lon saisies (routes inline) vs calculées ?  
3. Garder `note_chauffeur` ≠ `commentaire_operationnel` ?  
4. Ajout avant/après H4 ? (déjà présents → preuve only)

---

## 7. Découpage recommandé

### H5-F2 — Comptes employés (`12161500`)
- Prérequis : réponses Martin 12161500 — **satisfaits**
- Stratégie : **preuve DDL no-op** + `repair applied` history-only ; **pas** de rejeu UPDATE ; backfill interdit
- **Statut :** `GO H5-F2` exécuté — voir `TAGORA-TIME-SAAS1B1B-H5F2-EMPLOYEE-ACCOUNT-HISTORY-2026-07-15.md`
- `candidate_update_count = 0` ; 0 doublon auth_user_id ; aucun DDL staging
- Dépendance H4 : non

### H5-F3 — Horaires / SMS (`12191500`)
- Prérequis : décisions SMS/pauses  
- Stratégie : forward-only colonnes **si absentes** (déjà présentes → no-op) ; **aucun** UPDATE global ; **aucun SMS réel**  
- STOP : tentation de rejeu historique  
- Verdict : **NO-GO exécution** tant que décisions SMS ouvertes

### H5-F4 — Preuves / photos metadata / inline (`25090500` + `25140500` + `26120500`)
- Prérequis : confirmation catalogue note + metadata — **satisfaits**
- Stratégie : preuves no-op + repair history-only (trois versions, une à la fois)
- **Statut :** `GO H5-F4` exécuté — voir `TAGORA-TIME-SAAS1B1B-H5F4-PROOFS-PHOTOS-INLINE-HISTORY-2026-07-15.md`
- Aucun SQL rejoué ; schéma/données/policies inchangés ; history-only applied

### H5-F5 — Storage (`25133500`)
- Prérequis : décisions ACL + création bucket contrôlée  
- **Ne jamais rejouer** la policy historique DELETE large  
- Peut attendre **H4** si isolation org requise  
- Verdict : **BLOQUÉ**

### Ordre
**H5-F4 (preuves no-op) → H5-F2 (comptes) → H5-F3 (SMS sans UPDATE) → H5-F5 (Storage, post-décisions / H4)**

Sous-lot pouvant démarrer en préparation documentaire sans décision lourde : **H5-F4** (schema déjà satisfait).  
Sous-lots bloqués sans décision : **H5-F3** (SMS), **H5-F5** (Storage).  
H5-F2 : décisions légères puis preuve.

---

## 8. Effets externes

- UPDATE 12191500 touche toutes les lignes chauffeurs — **pas d’appel HTTP** mais mutation massique  
- Storage policies : pas de webhook DB  
- SMS/email : déclenchés uniquement par app si flags lus — H5-F1 n’envoie rien

---

## 9. Protections

| Domaine | Statut |
|---------|--------|
| H5-A…E / H5-E2D | Préservés (H5-E complet) |
| Feature | Intact |
| H4 | pending 6 |
| Production | Interdite |
| Migration SQL H5-F1 | **Aucune créée** |
| Écriture staging | **Aucune** |
| V1 | **51 %** |

---

## 10. Rollback

Sans objet (audit doc only). Futurs lots : snapshots TEMP ; interdit restaurer DELETE Storage large / UPDATE SMS global sans mandat.

---

## 11. Verdict

**H5-F1 TERMINÉ — AUDIT DES DOMAINES RESTANTS DOCUMENTÉ, DÉCISIONS MARTIN REQUISES**

Prochaine étape unique : mandat distinct **H5-F3** (SMS/pauses) après décisions Martin — **ne pas démarrer automatiquement** H5-F3 / H5-F5 / H4.
