# TAGORA Time — SaaS 1B.1B H5-F4 — Normalisation history-only preuves / photos / inline (2026-07-15)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time`)  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `b358bd0738eeb0ce60fd88e62bce09e9e4fa4dde`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

**Portée :** preuve no-op + `migration repair --status applied` history-only sur **trois** versions.  
**Aucun** SQL historique rejoué ; **aucune** migration SQL créée ; **aucun** DDL staging ; **aucune** donnée modifiée ; **aucun** Storage ; **aucun** bucket `photos-dossiers` touché.

---

## 1. Versions H5-F4

| Version | Fichier |
|---------|---------|
| `20260425090500` | `20260425090500_photos_dossier_proof_metadata.sql` |
| `20260425140500` | `20260425140500_operation_proofs_note_type.sql` |
| `20260426120500` | `20260426120500_livraisons_planifiees_inline_stop_fields.sql` |

Exactement **trois** versions. Aucune autre version réparée.

---

## 2. Pourquoi aucun SQL n’a été rejoué

Staging possède déjà l’équivalent complet du contrat historique :

- photos_dossier : `proof_type`, `proof_name`, `linked_record_type`, `linked_record_id` (text/text/text/bigint, nullable, sans default inattendu) ;
- index `idx_photos_dossier_proof_type`, `idx_photos_dossier_linked_record` (btree exact) ;
- operation_proofs contrainte `operation_proofs_type_preuve_check` : `document|voice|signature|note` ; valeurs hors domaine = 0 ;
- livraisons_planifiees : sept champs `ville`, `code_postal`, `province`, `latitude`, `longitude`, `note_chauffeur`, `commentaire_operationnel` (types exacts, optionnels) ;
- 0 lignes sur les trois tables (agrégats uniquement) ;
- dépendances app déjà alignées (dossiers, OperationProofsPanel `note`, inline-stop APIs) ;
- aucune table d’arrêts alternative canonique.

Catalogue `type_preuve` exact : document, voice, signature, note.

Équivalence complète → normalisation **history-only** uniquement (`migration repair --status applied --linked`).

---

## 3. Snapshots avant (SHA-256 fichiers TEMP, contenu normalisé LF)

| Snapshot | SHA-256 (contenu LF) |
|----------|----------------------|
| migration-list-before | `8AF708476AC8A13FDE4FE62C1330EAAB2609E6B232B1FCDE934AD2AF26E74939` |
| photos-schema | `00D01590CADE3C08F1A3E2B9F45644BD092B7B756B717F860FC611F4D89A5249` |
| photos-indexes | `13836756B34716973A8B87D7AA1520D3258A292A4405D89B94D1EE5101E4629A` |
| photos-aggregates | `D22286B6424FA5ED96E7632EC4B70A6F3F8D14290AF8978561AC18C3C0B6CC1A` |
| operation-proofs | `80B13CD498F26F16A88E3BA7C05EDC2621C7E87D1A12E3B8683E6BEC9C40C10F` |
| inline-schema | `773FB8A6BEC658014CBD4E65A86C28D031ECE5B6D7EF67EA9F0F2DBB30373C2F` |
| inline-aggregates | `2C2CB419C3ACCAF0D08A2250C1EF5FD103BB53954134AF9234B8036FA56796E6` |
| policies | `DD7BF1E53238052433A9F0BFD0C38272694FF188BA238BF5EDF92051668ED1E0` |
| data-counts | `55375A1E6EE2FF768955A69EC39057C0C403AC0CC14740D199BF8AD53861B1C6` |

Migration list avant : trois versions H5-F4 **pending** ; E2A–E2D applied ; H5-F2 / H5-F3 / H5-F5 pending ; H4 pending = 6.

---

## 4. Exécution

### Reset local
- Cible `127.0.0.1` uniquement (Studio / REST / DB locaux) ; aucun `--linked` sur le reset.
- `npx supabase db reset --local` — **PASS**.
- **92** migrations locales appliquées.
- Les trois migrations historiques H5-F4 s’exécutent localement sans erreur.
- Aucune donnée métier staging touchée.

### Repair (une version à la fois, history-only)
1. `npx supabase migration repair 20260425090500 --status applied --linked` → applied
2. `npx supabase migration repair 20260425140500 --status applied --linked` → applied
3. `npx supabase migration repair 20260426120500 --status applied --linked` → applied

Aucune autre version.

### Après (égalité contenu avant = après)
| Domaine | Avant = après |
|---------|---------------|
| photos schéma | oui |
| photos index | oui |
| photos agrégats | oui |
| operation_proofs | oui |
| inline schéma | oui |
| inline agrégats | oui |
| policies | oui |
| data counts | oui |
| migration list | **seule** entrée d’historique modifiée (3 versions) — SHA after `931000E6C63B838991684481A727AACCB27469ACF32633C303DFC2148F7C08B4` |

Post-repair pending conservés :
- H5-F2 `20260412161500` pending  
- H5-F3 `20260412191500` pending  
- H5-F5 `20260425133500` pending  
- historiques Horodateur/RLS encore pending inchangés  
- H4 pending = 6 (`20260712220000`…`20260712220500`)

---

## 5. Tests

- Documentaire H5-F4 : `src/app/lib/saas/h5f4-proofs-inline-history-normalization.migrations.test.ts`
- Ciblés + `npm run test:ci` / lint / build / `git diff --check` (à confirmer verts dans le commit)

---

## 6. Protections

H5-F2 / H5-F3 / H5-F5 / H4 / feature / production / Storage protégés. V1 **51 %**.

---

## 7. Rollback (documentaire uniquement — mandat distinct requis)

```text
npx supabase migration repair <VERSION> --status reverted --linked
```

Ce rollback :
- modifie seulement l’historique ;
- ne modifie pas le schéma ;
- ne supprime aucune colonne ni index ;
- ne modifie aucune donnée.

Ne jamais rollback sans mandat distinct.

---

## 8. Verdict

**GO H5-F4 — PREUVES, PHOTOS ET CHAMPS INLINE VALIDÉS, HISTORIQUE NORMALISÉ**

Prochaine étape unique : décisions Martin puis mandat distinct **H5-F2** (comptes) — ne pas démarrer auto H5-F2 / H5-F3 / H5-F5 / H4 / intégration feature.
