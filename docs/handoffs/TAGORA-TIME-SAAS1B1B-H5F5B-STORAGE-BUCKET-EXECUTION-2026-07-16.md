# TAGORA Time — SaaS 1B.1B H5-F5B — Storage bucket isolation execution (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `bd77185e3f49f2c0af7f4f0862db3879e4bc7cda`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih` (● linked)  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **65 % → 77 %**  
**Option :** **A** (bucket privé + 0 policy client ; runtime H5-F5A inchangé)

---

## 1. Contexte

H4 complet. H5-F5A runtime Option A GO (`bd77185…`). Cette passe livre le bucket privé, ferme les accès clients Storage, normalise l’historique, et **termine H5-F5**.

## 2. Migration

| Item | Valeur |
|------|--------|
| Fichier | `supabase/migrations/20260716223000_h5f5_photos_dossiers_org_isolation.sql` |
| Version | `20260716223000` |
| SHA-256 | `33A4BE1D0A0D813A51BC28512DFB0999AA53E3D261C05630BCE868EA077382DB` |
| Transaction | `BEGIN` … `COMMIT` |
| Style | forward-only, autonome, idempotent local (`ON CONFLICT` force `public=false`) |
| Seed / backfill / objets | **aucun** |

## 3. Bucket après application

| Contrôle | Résultat |
|----------|----------|
| Existe | oui |
| `public` | **false** |
| `file_size_limit` | **15728640** (15 MiB) |
| `allowed_mime_types` | JPEG/PNG/GIF/WEBP, PDF, text, Office, audio voice (aligné H5-F5A) |
| Objets | **0** |
| Taille agrégée | **0** |

## 4. Policies

| Contrôle | Résultat |
|----------|----------|
| Policies photos-dossiers | **0** |
| SELECT / INSERT / UPDATE / DELETE client | **aucune** |
| Drop ciblé historique | `photos_dossiers_storage_{select,insert,delete}_policy` |
| Nouvelle policy créée | **non** |
| USING(true) / WITH CHECK(true) | **non** |

## 5. Application staging

| Étape | Résultat |
|-------|----------|
| Cible | `qokyobcvplzufshydhih` |
| Commande | `npx supabase db query --linked -f …/20260716223000_….sql` |
| SQL COMMIT | oui |
| `db push` / `--include-all` | **non** |
| Contenu historique `20260425133500` rejoué | **non** |

## 6. Normalisation historique

| Version | Action | Résultat |
|---------|--------|----------|
| `20260716223000` | `migration repair --status applied --linked` | applied |
| `20260425133500` | `migration repair --status applied --linked` (**history-only**) | applied |
| Autre repair | **aucun** | — |
| H5-F5 pending | **0** (ces versions) | oui |

## 7. Runtime H5-F5A

Intact : upload / signed-url / delete / ZIP serveur ; pas de `getPublicUrl` photos-dossiers ; pas d’upload navigateur direct ; chemins `<organization_id>/…`.

## 8. Protections

| Domaine | Statut |
|---------|--------|
| H4 | intact (0 lignes memberships) |
| Autres buckets | seul `photos-dossiers` créé |
| Grants Storage | inchangés (pas de GRANT ajouté) |
| Feature | intacte |
| Production | intacte |
| Données métier / Auth / org / membership | **aucune** création |

## 9. Snapshots TEMP (SHA-256)

**Before (échantillon) :**

| Snapshot | SHA-256 |
|----------|---------|
| migration-list-before | `6AF2E642C6B0A5C37AC7E95C05E2668A0ABDD2D59A404434B31D361AB9C5E763` |
| bucket-before | `86B8C1FF7C1708F6CAA69CC613D27568D93C4420C3F71E5B6AEE0A4548C2F986` |
| policies-before | `3CAC40D4B8047D682F2F1999353232143EACEBCA9F1969AE8358CC169FEA7022` |
| grants-before | `DA18FFCFA27801D6F64FFA97B79FCAFCC931923F09CC2E0A7881B9F2206E8820` |
| h4-before | `37188501627601668815A883564C2CABE062E9A36C0B6B708943F263DC6A1996` |

**After :**

| Snapshot | SHA-256 |
|----------|---------|
| migration-list-after | `B9B79A676B66F41F8AC3FE0536F745F03D2966AC20A7F19B4A647F57508FDF32` |
| bucket-after | `B6906393653E6ED39D4233BD3CC05A70B33CCD15CDC619BC10BAEFCB2F3A95D8` |
| policies-after | `E2E92AAFB014FF049ACF7EB4BB2A6545D792188F081B5C84974D076069A13B9F` |
| grants-after | `8E1F257899D500F25E22C1091EB1D76BEE2457C1780F0A43965EE4EC40792093` |
| object-count-after | `BEBEA7E98B9FF09938F278D2C1F82C64ECA07B146D0900E9A16E8DA29D56B469` |
| h4-after | `CB47F3FA492928EB8C52ED129BF98CA4587B469FE12EA6F056F9253185165F7A` |

## 10. Tests

- Reset local PASS ; bucket privé local ; policies = 0 ; objets = 0  
- `h5f5b-storage-bucket-isolation.migrations.test.ts`  
- `npm run test:ci` PASS (80 files / 503 tests)  
- lint 0 erreur ; build PASS ; `git diff --check` PASS  

## 11. Rollback documentaire (ne pas exécuter)

Sous mandat distinct, si objets = 0 : supprimer bucket vide ; conserver runtime H5-F5A ; `migration repair 20260716223000 --status reverted` ; réévaluer séparément le statut history-only de `20260425133500`.

## 12. Verdict

**GO H5-F5B — BUCKET PRIVÉ ET ISOLATION STORAGE VALIDÉS, H5-F5 COMPLET**

Prochaine étape unique : **intégration feature** (`feature/sales-book-grants`) — **ne pas démarrer automatiquement**.
