# TAGORA Time — SaaS 1B.1B H5-B execution (2026-07-14)

**Agent :** Martin  
**Agent donneur :** Martin  
**Poste :** Bureau  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `58073f122d00129c528250d110442ab80453ab78`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

**Staging :** `qokyobcvplzufshydhih`  
**Production (interdite) :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **51 %** (inchangé)

---

## Contenu H5-B (plan R10)

| Versions historiques (restent pending) | Catégorie |
|----------------------------------------|-----------|
| `20260410130000` | R2 |
| `20260412103000` | R2 |
| `20260411101500` | R4 |
| `20260421113000` | R2 |

**Nouvelle migration forward-only :**  
`supabase/migrations/20260714150000_h5b_reconcile_company_context_tracking.sql`

**SHA-256 fichier :** `D0C98F6F1479C7E319F21F71026F80EEFCC32BA040563D8B9A1772E6981954E1`

---

## Règles de backfill appliquées

- `company_context` : valeur valide existante → livraison liée → chauffeur / `primary_company` / `employee_id` ; **aucun** fallback `oliem_solutions`.
- Porte : unresolved = 0, conflicts = 0 avant `NOT NULL`.
- `tracking_token` : `encode(gen_random_bytes(16),'hex')` ; jamais journalisé ; index unique partiel.
- `tracking_enabled` : lignes existantes `false` si null ; **default true** pour nouvelles inserts (contrat app).
- Aucun SMS ; `tracking_sms_sent_at` non peuplé par la migration.
- `client_phone` : colonne seulement ; pas de backfill ambigu.
- `type_operation` : reste nullable pour l’historique.

---

## Matrices agrégées staging (avant)

| Mesure | Valeur |
|--------|--------|
| sorties_terrain | 0 |
| company_context sorties | colonne absente → après: présente |
| non résolues / conflits | 0 / 0 (tables vides) |
| temps_titan | 0 |
| livraisons | 0 |
| tokens existants / doublons | 0 / 0 |
| tokens générés | 0 (aucune ligne) |
| tracking_enabled true | 0 |
| client_phone backfill | 0 |
| Phase A tables | présentes (0 lignes) |
| références orphelines | 0 |
| billing views | 0 → 2 |
| direction_terrain_positions | inchangée (présente) |
| horodateur_events.user_id | inchangé (présent) |

---

## Méthode

1. Validation H5-A toujours verte.
2. Snapshots TEMP schema-only hors Git.
3. `npx supabase db reset --local` → **86** migrations (H5-A + H5-B).
4. Staging : `db query --linked` du SQL forward-only **dans BEGIN/COMMIT** + gates.
5. Historique : `migration repair 20260714150000 --status applied --linked` **uniquement**.
6. Anciennes H5-B **non** marquées applied. H4 **pending**. Autres H5 **pending**.

---

## Snapshots TEMP (hors Git)

| Fichier | SHA-256 |
|---------|---------|
| `%TEMP%\tagora-time-staging-schema-h5b-before-2026-07-14.sql` | `48632899BAAB38DA9A9FC340C4F7E42868CEAE685E05D5F5285174260AEB1507` |
| `%TEMP%\tagora-time-local-schema-h5b-before-2026-07-14.sql` | `3200879D586E88967659513F2CFF1022742A8D920AA4C37B970CB81E1583BB46` |
| `%TEMP%\tagora-time-h5b-migration-history-before.csv` | `8FBD96BF8F4D4E52953A7F0FB985A3F3D9F2E65A75E8072EFAA1D64864449AB9` |
| `%TEMP%\tagora-time-staging-schema-h5b-after-2026-07-14.sql` | `F2B49D9767DEBA0B726954CC558307468C59ACF99901E5FE7AB242C0FC2F53D6` |

---

## Rollback documenté

```text
npx supabase migration repair 20260714150000 --status reverted --linked
```

Ne retire pas automatiquement le DDL ; mandat inverse distinct requis pour retrait de colonnes (interdit hors GO).

---

## Protections

- H5-C…F : non touchés  
- H4 SaaS : pending inchangé  
- Production : non ciblée  
- Pas de `db push` / `--include-all` / replay historique H5  
- Aucun token / PII affiché  

---

## Décision

**GO H5-B — CONTEXTE COMPAGNIE ET TRACKING DÉPLOYÉS ET VALIDÉS**

Prochaine étape unique : **GO Martin H5-C** (pas H5-D, pas H4, pas feature, pas 1B.2).
