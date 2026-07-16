# TAGORA Time — SaaS 1B.1B H5-F5 — Storage isolation readiness (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Maison  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `0bb10db318c8e583baee7bc3879333d5f28fa536`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih`  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`  

**Avancement V1 :** **65 %** (inchangé — préparation seulement)  
**Cible après GO H5-F5 complet :** **77 %**

**Portée :** porte d’exécution post-H4 — **read-only staging** — **aucune** migration SQL créée, **aucun** bucket, **aucune** policy, **aucun** objet Storage, **aucun** `migration repair`, **aucun** `db push`.

---

## 1. Prérequis H4

| Contrôle | Résultat |
|----------|----------|
| H4 complet (B1+B2+B3) | oui |
| H4 pending | **0** |
| Sept tables H4 | présentes, **0** ligne |
| Policies H4 | **0** |
| `organization_memberships` | fail-closed (RLS+FORCE, 0 policy client) |

---

## 2. Migration historique H5-F5

| Item | Valeur |
|------|--------|
| Fichier | `supabase/migrations/20260425133500_storage_photos_dossiers_policy_alignment.sql` |
| Version | `20260425133500` |
| Staging | **pending** |
| Modifiée cette passe | **non** |
| Rejouée | **non — interdite** |

**Risques historiques :**

- SELECT/INSERT/DELETE `to authenticated` si permission `documents` **OU** `livraisons` **OU** `terrain` ;
- **aucun** filtre organisation / owner / prefix ;
- DELETE bucket-wide pour tout authenticated avec l’une des permissions — **inacceptable V1**.

---

## 3. Baseline staging (agrégats, sans PII)

| Contrôle | Valeur |
|----------|--------|
| Project ref | `qokyobcvplzufshydhih` |
| Bucket `photos-dossiers` | **absent** (`bucket_n=0`) |
| Public / privé | N/A (absent) |
| `file_size_limit` / MIME | N/A |
| Objets agrégés | **0** / **0** octets |
| Policies `photos-dossiers` | **0** |
| Policies `storage.objects` totales | **0** |
| RLS `storage.objects` / `buckets` | enabled ; FORCE = false |
| Grants table-level objects/buckets | anon / authenticated / service_role : large surface PostgREST (SELECT…TRUNCATE) — **gouvernés par RLS** (0 policy ⇒ pas d’accès client utile) |
| H4 counts | toutes **0** ; policies H4 **0** |
| Écriture staging | **aucune** |

### Snapshots TEMP (SHA-256 fichiers)

| Fichier | SHA-256 |
|---------|---------|
| migration-list-before | `D74E2736D15241ADBD44734076B08FBA78F754F79116E40B8125105F294976FA` |
| schema-before (JSON baseline) | `F2538106FB0412E0170C5B624AD20EDF41FD8CD6B947AADDE885371D78C7F45D` |
| bucket-before | `4BADC293CA67A0453FC15D3C305ED2489CBEC119C66611D6F36D8096C667B3B3` |
| storage-policies-before | `BF9DEFF6C5A85F2A00D7A59322FF5D48A5F5FA0FAAC81C90905CB539701E098E` |
| storage-grants-before | `D386598E442DD14452C583AEE7502E444D5D28B1746353D18C9E3A64E84CA73F` |
| h4-before | `E4CEA2D9D96D439E6F312BACA446A0CABBF1691515CA49E91D9C44564DB8E185` |
| code-paths-before | `385A0BF064C79204A72ED4869B47FE2C39C06491C64D0E428B110E01A360FAD0` |

---

## 4. Inventaire code Storage (`photos-dossiers`)

### Matrice actions

| Action | Fichier | Navigateur ou serveur | Client | Rôle DB | Format de chemin | Autorisation actuelle |
|--------|---------|----------------------|--------|---------|------------------|----------------------|
| Upload | `OperationProofsPanel.tsx` | navigateur | anon key + JWT user | authenticated (si policies) | `operation-proofs/{module}/{sourceId}/{file}` | session + insert `operation_proofs` |
| Upload | `upload-operation-proof.client.ts` | navigateur | idem | authenticated | idem | `getUser()` requis |
| Upload | `StopSignatureQuickCapture.tsx` | navigateur | idem | authenticated | idem | session |
| URL | mêmes composants | navigateur | `getPublicUrl` | N/A (URL construite) | path ci-dessus | **suppose bucket public** (`/object/public/`) |
| Lecture ZIP | `archives/[id]/zip/route.ts` | serveur | **service_role** | bypass RLS | extrait depuis URL stockée | Direction/Admin API |
| Suppression | `api/operation-proofs/[id]/route.ts` | serveur | **service_role** `.remove` | bypass RLS | extrait depuis URL | JWT role + permissions + `canDeleteOperationDocument` |
| Liste Storage | — | — | — | — | — | **aucun** `list()` Storage trouvé |
| Remplacement | — | — | — | — | — | **aucun** upsert Storage sur ce bucket |
| Dossier photos | `employe/dossiers/[id]/page.tsx` | navigateur | table `photos_dossier` seulement | RLS table | URL déjà en `image_url` | delete **ligne DB** ; **pas** `storage.remove` |
| Hors périmètre | `EmployeeProfilePageClient.tsx` | navigateur | bucket `chauffeurs-documents` | — | `permis/…` | **hors H5-F5** |

### Confirmations

| Question | Réponse |
|----------|---------|
| Accès Storage navigateur direct | **oui** (upload + `getPublicUrl`) |
| service_role | **oui** (delete preuves ; download archives) |
| Bucket hardcodé | **oui** — `photos-dossiers` |
| Préfixe organisation | **non** |
| Préfixe user | **non** |
| Identifiant dossier / livraison | **oui** — segment `sourceId` / module |
| Écrasement upsert | **non** sur `photos-dossiers` (défaut upload) |
| Suppression client Storage | **non** — delete via route serveur ; dossiers = delete SQL row |
| `createSignedUrl` | **absent** des flux preuves |
| Validation MIME / taille | partielle côté métadonnées insert ; **pas** de limite bucket staging |
| Journalisation suppression | console warn si remove Storage échoue ; pas d’audit append-only Storage |
| Permissions avant op | JWT `documents` \| `livraisons` \| `terrain` (delete API) ; upload client sans check membership org |

**Domaines permission V1 (JWT / helpers, pas H4 roles) :** `documents`, `livraisons`, `terrain`.

---

## 5. Contrat organisationnel V1 figé (cible)

1. **Bucket** : `photos-dossiers`, **privé**, aucun accès public/anon, aucune URL publique permanente.  
2. **Chemin** : `<organization_id>/<domain>/<record_id>/<nom_fichier_unique>` avec domain ∈ `{documents, livraisons, terrain}` (mapping runtime depuis module preuve).  
3. **Aucun** chemin sans préfixe organisation accepté une fois le contrat appliqué.  
4. **Aucune** policy UPDATE sur `storage.objects`.  
5. Remplacement = nouvel objet + suppression contrôlée.  
6. Rôles plateforme (`platform_support` / `platform_super_admin`) : **aucun** accès métier implicite aux fichiers org.  
7. DELETE Employé général bucket-wide : **interdit**.

---

## 6. Matrice des rôles recommandée V1

Rôles membership H4 exacts : `organization_owner`, `organization_admin`, `direction`, `employe` (+ status `active`/`suspended`/`invited`).  
Rôles app JWT actuels (runtime) : `employe`, `direction`, `admin` — **distincts** des rôles plateforme.

| Acteur | Lire | Téléverser | Supprimer | Remplacer |
|--------|------|------------|-----------|-----------|
| PUBLIC | non | non | non | non |
| anon | non | non | non | non |
| authenticated sans membership | non | non | non | non |
| membership inactif | non | non | non | non |
| Employé actif | oui via serveur contrôlé + permission domaine | oui via serveur contrôlé + permission domaine | **non** général ; seulement cas serveur déjà bornés (ex. propre doc non sensible) | non |
| Direction active | oui serveur | oui serveur (si permission) | oui **serveur contrôlé** | non (delete+create) |
| Admin/Owner actif | oui serveur | oui serveur | oui **serveur contrôlé** | non (delete+create) |
| platform_support | aucun métier implicite | aucun | aucun | aucun |
| platform_super_admin | aucun métier implicite | aucun | aucun | aucun |
| service_role | uniquement routes serveur autorisées | oui (mêmes routes) | oui (mêmes routes) | oui (mêmes routes) |

---

## 7. Options A / B / C

### Risque RLS memberships

`organization_memberships` : RLS + FORCE, **policies = 0**, grants client révoqués.  
Une policy Storage `authenticated` **ne peut pas** `SELECT` memberships pour prouver l’org — échec silencieux ou besoin de DEFINER / élargissement H4.

### OPTION A — Storage uniquement routes serveur + service_role

| Critère | Évaluation |
|---------|------------|
| Sécurité | **meilleure** surface publique minimale |
| Compatibilité code actuel | upload navigateur **incompatible** tel quel ; delete/ZIP déjà alignés |
| Changement code | **requis** : routes upload + URLs signées ; préfixe org |
| Changement SQL | bucket privé ; **0** policy client photos-dossiers ; ne pas rejouer historique |
| Effet H4 | **aucun** |
| Test local | oui (TX + routes) |
| Risque inter-tenant | bas si serveur valide membership via service_role |
| Escalade | bas (pas de policy Storage client) |
| Rollback | drop policies/bucket vide |
| Pilote V1 | **recommandé** |

### OPTION B — Helper SQL pour policies Storage

| Critère | Évaluation |
|---------|------------|
| Sécurité | acceptable si DEFINER durci + tests anti-escalade |
| Compatibilité | permettrait de garder upload navigateur |
| SQL | helper + policies org-prefix |
| Effet H4 | lecture memberships via DEFINER (sans policy membership) |
| Risque | surface DEFINER ; JWT mal revalidé |
| Pilote | plus de surface que A |

### OPTION C — Policies client sur `organization_memberships`

| Critère | Évaluation |
|---------|------------|
| Sécurité | élargit H4 fail-closed |
| Effet H4 | **modification H4** |
| Pilote | **rejeté** pour V1 |

### Option recommandée : **A**

**Justification :** H4 fail-closed ne doit pas être ouvert ; le DELETE serveur existe déjà ; le bucket staging est absent (pas d’objets à migrer) ; Option A évite DEFINER et policies permissives ; compatible avec chemin critique V1 sans refonte H4.

**Helper SECURITY DEFINER :** **non requis** sous Option A.  
**Modification H4 :** **non**.  
**Modification runtime :** **oui — obligatoire** avant que le contrat org soit réellement appliqué (contexte org actif + préfixe chemin + upload serveur + signed URL).

---

## 8. Future migration (ne pas créer maintenant)

| Item | Valeur |
|------|--------|
| Nom | `supabase/migrations/20260716223000_h5f5_photos_dossiers_org_isolation.sql` |
| Version | `20260716223000` |
| Style | transactionnel, forward-only, autonome, idempotent local, sans seed/backfill/objet réel |

**Contenu prévu :**

- création idempotente bucket `photos-dossiers` **privé** ;
- drop ciblé des policies nommées historiques si présentes ;
- **aucune** nouvelle policy SELECT/INSERT/DELETE/UPDATE client (Option A) ;
- **aucune** policy UPDATE ;
- **aucun** helper DEFINER dans le lot SQL minimal ;
- commentaires contrat org + interdiction rejeu `20260425133500` ;
- après preuve complète : normalisation history-only de `20260425133500` seulement.

**STOP si :** production ciblée ; objets réels non agrégés ; collision policies ; H4 non vide / policies H4 ≠ 0 ; tentative `--include-all` / `db push`.

---

## 9. Modifications runtime requises (mandat suivant, hors cette passe)

1. Résoudre **organization_id active** côté serveur (membership `active`).  
2. Construire chemins `<organization_id>/<domain>/…`.  
3. Déplacer upload preuves vers routes serveur (service_role).  
4. Remplacer `getPublicUrl` par **URL signée** à durée courte.  
5. Conserver delete/ZIP serveur ; durcir check membership org du path.  
6. Ne jamais accorder DELETE Storage bucket-wide à authenticated.

---

## 10. Rollback documentaire (ne pas exécuter)

Si lot SQL futur appliqué avec bucket vide et 0 objets : drop policies nommées créées (s’il y en a) ; optionnellement retirer bucket vide ; marquer forward version reverted sous mandat ; **ne pas** restaurer policies historiques larges.

---

## 11. Protections

| Domaine | Statut |
|---------|--------|
| H4 | intact (aucun DDL) |
| Feature | intacte |
| Production | interdite |
| Migration SQL H5-F5 | **non créée** |
| Bucket / policy / objet | **non créés** |
| Écriture staging | **aucune** |
| V1 | **65 %** |

---

## 12. Verdict

**PARTIAL H5-F5 — CONTRAT STORAGE FIGÉ, INTÉGRATION DU CONTEXTE ORGANISATIONNEL REQUISE AVANT APPLICATION**

Prochaine étape unique : mandat d’exécution H5-F5 **Option A** (runtime org + chemins + routes serveur) **puis** migration forward-only `20260716223000` — **ne pas démarrer automatiquement**.
