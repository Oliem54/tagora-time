# TAGORA Time — SaaS 1B.1B H5-F5A — Storage server runtime Option A (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `07149672714480c3ce447ef164e0e75b2c925a24`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging :** `qokyobcvplzufshydhih` (aucune écriture Storage cette passe)  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **65 % → 65 %** (runtime seul ; cible 77 % réservée au GO H5-F5 complet)  
**Option :** **A** (toutes opérations Storage V1 via routes serveur)

---

## 1. Contexte

H4 complet. H5-F5 readiness PARTIAL. Cette passe livre le **runtime Option A** avant toute migration/bucket/policy H5-F5B.

## 2. Fichiers lus (échantillon)

- `docs/handoffs/TAGORA-TIME-SAAS1B1B-H5F5-STORAGE-ISOLATION-READINESS-2026-07-16.md`
- `docs/handoffs/TAGORA-TIME-SAAS1B1B-H5F1-OTHER-DOMAINS-AUDIT-2026-07-15.md`
- `docs/handoffs/TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md`
- `docs/handoffs/TAGORA-TIME-SAAS1B1B-H4B3-PLATFORM-ACCESS-AUDIT-EXECUTION-2026-07-16.md`
- Clients upload / delete / ZIP / admin client / permissions

## 3. Flux avant → après

| Flux | Avant | Après |
|------|-------|-------|
| Upload | Navigateur `storage.upload` + `getPublicUrl` | `POST /api/operation-proofs/upload` (service_role après authz) |
| Lecture | URL publique permanente | `POST/GET /api/operation-proofs/signed-url` (300 s) |
| Suppression | Route serveur (partiel) | + membership org + path org-safe + remove ciblé |
| ZIP | service_role download | + membership org + path org-safe |
| Chemin | `operation-proofs/{module}/{id}/{file}` | `<organization_id>/<domain>/<record_id>/<unique>` |

## 4. Résolution organisation / membership

Helper : `resolveStorageOrganizationContext()` (`photos-dossiers-org.server.ts`)

- Session via `getAuthenticatedRequestUser`
- Membership `active` via `organization_memberships` (service_role après auth)
- Préférence `is_default`
- **Refuse** `organization_id` client
- Rôle plateforme seul (`platform_access` actif sans membership) → **refusé**
- Rôles membership : `organization_owner` | `organization_admin` | `direction` | `employe`

## 5. Permissions métier

- Domaines Storage : `documents` | `livraisons` | `terrain`
- Mapping module → domain (dossier→documents ; livraison/ramassage→livraisons ; cases→terrain)
- JWT permissions via `hasUserPermission`
- Ressource : existence `livraisons_planifiees` / `dossiers` quand applicable  
  (pas de FK org sur tables métier encore — gate org = membership + path prefix pour nouveaux objets)

## 6. Validation fichier (décision V1 documentée)

| Limite | Valeur |
|--------|--------|
| Taille max | **15 MiB** (conservateur ; non préexistante bucket) |
| Extensions | images, pdf, office, txt, audio voice (webm/ogg/mp3/…) |
| MIME | préfixes `image/`, `audio/`, pdf, text, office |
| Traversée / slash | refusés |
| upsert | **false** |

## 7. URL signée

- Durée : **300 secondes** (`PHOTOS_DOSSIERS_SIGNED_URL_SECONDS`)
- Jamais d’URL publique permanente pour nouveaux objets
- Référence stockée : `storage://photos-dossiers/<path>`
- URL signée complète **non journalisée**

## 8. Anciens chemins

- **Aucun** backfill / déplacement
- **Aucun** nouvel ancien format généré
- Lecture legacy : route serveur après validation métier ; `pathBelongsToOrganization` accepte legacy pour la gate path (org via membership + ressource)
- Suppression legacy : seulement si preuve métier + org membership + permission delete

## 9. Non-portée confirmée

- Migration SQL : **non**
- Bucket `photos-dossiers` : **non créé**
- Policies Storage : **non**
- Objet Storage réel : **non**
- Staging write / production / feature : **non**
- H4 : **inchangé**

## 10. Tests

- `photos-dossiers-contract.shared.test.ts`
- `photos-dossiers-org.server.test.ts`
- `h5f5a-storage-runtime.route.test.ts`  
  (mocks Storage / session / membership — aucun bucket réel)

## 11. Rollback applicatif

Revenir au commit précédent WIP. Aucune migration à annuler.

## 12. REPORT APRÈS V1

- Audit append-only Storage dédié
- Backfill / normalisation objets historiques
- FK org sur ressources métier
- Seed memberships opérationnels

## 13. Prochaine étape unique

**H5-F5B livré** — voir `TAGORA-TIME-SAAS1B1B-H5F5B-STORAGE-BUCKET-EXECUTION-2026-07-16.md`.
Prochaine étape chemin critique : **intégration feature** — ne pas démarrer automatiquement.

---

**Verdict runtime :** GO H5-F5A (inchangé). **H5-F5 complet :** oui (avec H5-F5B).
