# TAGORA Time — SaaS 1B.1B local validation (2026-07-13)

**Agent :** Martin  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD départ (inchangé) :** `21bcca8c4e86a77259f4008c26e8380518ea897c`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

---

## Décision (R10)

**PLAN H5 DOCUMENTÉ — AUCUNE EXÉCUTION**

- Document : `docs/handoffs/TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md`
- 24 H5 classées R1–R6 ; lots A–F proposés ; non exécutés
- H4 SaaS toujours protégées pending
- Handoff maison→bureau : `docs/handoffs/TAGORA-TIME-SAAS1B1B-HOME-TO-OFFICE-2026-07-14.md`
- Avancement V1 : **51 %**

## Décision (R9)

**GO HISTORY — H2/H3 NORMALISÉS, H4/H5 CONSERVÉS PENDING**

- 18 H2 + 2 H3 marquées `applied` sur staging `qokyobcvplzufshydhih`
- 14 versions 8 chiffres `reverted`
- 6 H4 + 24 H5 toujours pending
- schéma applicatif inchangé (59 tables / 4 vues / 27 routines / 80 policies)
- aucun `db push` / aucun commit / aucun push
- Document : `docs/handoffs/TAGORA-TIME-SAAS1B1B-STAGING-HISTORY-REPAIR-2026-07-14.md`
- Avancement V1 : **51 %**

## Décision (R8)

**READY FOR R9 — MAPPING DÉTERMINISTE ET RÉPARATION D'HISTORIQUE CONTRÔLÉE POSSIBLE**

- Audit staging read-only + mapping 8→14 chiffres : **terminé**
- Document : `docs/handoffs/TAGORA-TIME-SAAS1B1B-STAGING-HISTORY-MAP-2026-07-14.md`
- Compatibilité staging : **B** (repair **non** exécuté en R8)
- Classification : H1=34, H2=18, H3=2, H4=6, H5=24, H6=0
- **Aucun migration repair / db push / commit / push**
- Avancement V1 : **51 %** (inchangé)

## Décision (R7)

**GO LOCAL — APP_IMPROVEMENTS ALIGNÉ ET SAAS 1B.1 REPRODUCTIBLE LOCALEMENT**

- Alignement idempotent de `20260426103500_create_app_improvements.sql` : **validé**
- Reconstruction locale complète (migrations SaaS incluses) : **PASS**
- Compatibilité staging : **B** (historique distant 8 chiffres ≠ local 14 chiffres — hors mandat)
- **Aucun commit / aucun push**
- **Aucun SaaS 1B.2 / aucune intégration feature**

---

## Infrastructure

Docker Server 29.6.1 ; Supabase local `127.0.0.1` ; staging `qokyobcvplzufshydhih` — **history-only** modifié en R9 ; production non touchée ; aucun `db push`.

---

## Blocage R6 (cause confirmée R7)

| Élément | Valeur |
|--------|--------|
| Fichier | `20260428120000_app_improvements_archive_and_soft_delete.sql` |
| SQLSTATE | `42703` |
| Message | `column "deleted_at" of relation "public.app_improvements" does not exist` |

### Ordre historique

1. `20260412201500_app_improvements.sql` — crée la table **sans** `treated_at` / `deleted_at` ; défaut status `'nouveau'` ; check `nouveau|en_cours|traite|archive` ; **pas** de check `module`.
2. `20260426103500_create_app_improvements.sql` — `CREATE TABLE IF NOT EXISTS` avec `treated_at`, `deleted_at`, défaut `'en_attente'`, checks module/priority/status finaux.
3. `20260426111500_app_improvements_admin_only.sql` — policies admin-only (inchangée R7).
4. `20260428120000_app_improvements_archive_and_soft_delete.sql` — ajoute `archived_at` / `archived_by` / `deleted_by` ; indexes sur `deleted_at` ; **inchangée R7**.

### Pourquoi `CREATE TABLE IF NOT EXISTS` ne suffisait pas

Sur rebuild local, `20260412201500` crée déjà `app_improvements`.  
Le second `CREATE TABLE IF NOT EXISTS` émet `NOTICE 42P07 already exists, skipping` et **ne modifie pas** la structure → `treated_at` / `deleted_at` absentes → échec de l’archive.

Confirmé au reset R7 : même NOTICE sur `20260426103500`, suivi des `ADD COLUMN IF NOT EXISTS` qui ajoutent les colonnes manquantes.

Types dump staging (schema-only) : `treated_at` / `deleted_at` = `timestamp with time zone`.

---

## Correction R7 (chirurgicale)

**Seul fichier SQL modifié durant R7 :**  
`supabase/migrations/20260426103500_create_app_improvements.sql`

Ajouts idempotents après le `CREATE TABLE IF NOT EXISTS` conservé :

- `ADD COLUMN IF NOT EXISTS treated_at timestamptz null`
- `ADD COLUMN IF NOT EXISTS deleted_at timestamptz null`
- `ALTER COLUMN status SET DEFAULT 'en_attente'`
- `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` pour `status`, `module`, `priority`

Colonnes d’archivage **non** ajoutées prématurément (`archived_at`, `archived_by`, `deleted_by` restent dans `20260428120000`).

Aucun `DROP TABLE` / `DROP COLUMN` / `CASCADE` / `UPDATE` métier / `INSERT`.

### Contrat status (prouvé app + staging)

| | Ancien (`20260412201500`) | Final (`20260426103500` + app) |
|--|---------------------------|--------------------------------|
| Défaut | `nouveau` | `en_attente` |
| Valeurs | `nouveau`, `en_cours`, `traite`, `archive` | `en_attente`, `en_traitement`, `traitee`, `supprimee` |

Sources : `src/app/lib/improvements.ts`, dump staging, migration canonique.

**Staging B :** une conversion de données historiques staging (anciens status → nouveaux) serait nécessaire hors reset vide ; **non exécutée** ici.

---

## Rebuild R7

| Étape | Résultat |
|------|----------|
| Bootstrap → GPS R3 → vues R5 → Horodateur R6 | PASS |
| `20260412201500` (table sans deleted_at) | PASS |
| `20260426103500` (alignement colonnes + contraintes) | **PASS** |
| `20260428120000` (archive / soft-delete) | **PASS** |
| Progression `20260429130000` et au-delà | PASS |
| Six migrations SaaS `20260712220000`…`20260712220500` | **PASS** |
| Nouveau blocage | **aucun** |

Preuve locale post-reset :

- `treated_at`, `deleted_at`, `archived_at`, `archived_by`, `deleted_by` présentes (`timestamptz`)
- défaut status `'en_attente'` ; checks module/priority/status alignés
- policies finales admin-only (migration admin-only)
- `app_improvements` : **0 lignes**
- 7 tables SaaS présentes ; RLS + FORCE RLS ; 0 policies `USING (true)` ;
  tables SaaS vides ; pas de `organization_id` sur tables métier listées

---

## Tests / qualité

| Suite | Résultat |
|------|----------|
| Ciblés (+ test `app-improvements-align`) | **PASS** (ensemble SaaS migrations inclus dans test:ci) |
| `npm run test:ci` | **336 PASS** / 50 fichiers |
| `npm run lint` | **PASS** (0 errors, 37 warnings préexistants ; aucun warning R7) |
| `npm run build` | **PASS** |

---

## Fichiers R7

| Fichier | Rôle |
|--------|------|
| `supabase/migrations/20260426103500_create_app_improvements.sql` | Alignement colonnes + contraintes |
| `src/app/lib/saas/app-improvements-align.migrations.test.ts` | Tests de garde |
| `docs/handoffs/TAGORA-TIME-SAAS1B1B-LOCAL-VALIDATION-2026-07-13.md` | Ce handoff |

Travail R2–R6 **conservé** (42 renommages, bootstrap, GPS, vues, Horodateur, manifeste versions).

`20260428120000` : hash SHA-256 inchangé  
`2ACEB39EEDBA8006E425AACC8CCA2669556B9F0DE4506C22869486D04D818752`

---

## Avancement V1

48 % → **51 %** (R7) → **51 %** (R8) → **51 %** (R9 history partial ; H5 restants)

---

## Prochaine étape unique

**Mandat de réconciliation H5** (GPS / vue terrain / Horodateur / tracking / etc.)  
sans `db push` SaaS H4 tant que Martin n’accorde pas un GO distinct.
