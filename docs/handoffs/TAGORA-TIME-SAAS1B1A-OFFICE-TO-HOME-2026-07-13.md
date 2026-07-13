# TAGORA Time — Handoff bureau → maison — SaaS 1B.1A

**Date :** 2026-07-13
**Agent :** Martin
**Projet :** TAGORA Time uniquement

---

> ## SAAS 1B.1 NON VALIDÉ EN BASE LOCALE
> ## BOOTSTRAP HISTORIQUE NON CRÉÉ
> ## NE PAS MERGER VERS FEATURE

---

## A. État Git

| Item | Valeur |
|------|--------|
| Branche WIP | `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13` |
| HEAD de départ (avant ce checkpoint) | `8a41e2c3ca9166393fcd4729692b22632f56ac12` |
| Branche feature protégée | `feature/sales-book-grants` |
| HEAD feature | `6fd6ca09078eedbd133e59aca160f606fa33040b` |
| Working tree avant commit | uniquement 2 fichiers RBAC non suivis (+ ce handoff au moment du commit) |
| Merge vers feature | **aucun** |

---

## B. Baseline RBAC

**Fichier :** `supabase/migrations/20260407000000_rbac_auth_helpers_baseline.sql`

**Six fonctions (CREATE OR REPLACE, idempotentes) :**

- `current_app_role`
- `current_app_permissions`
- `has_app_permission`
- `is_direction_user`
- `is_direction_or_admin`
- `is_admin_user`

**Effet validé au bureau :** la migration Horodateur `20260408_190000_horodateur.sql` franchit désormais cette baseline.

**Test associé :** `src/app/lib/saas/rbac-auth-helpers-baseline.migrations.test.ts`

**Non-régression (bureau) :**

- tests baseline + SaaS : **25 PASS**
- lint : **0 erreur**
- build : **PASS**

---

## C. Blocage historique

**Migration suivante bloquante :**
`20260410_120000_company_activation_and_payroll.sql`

**Cause :** `public.chauffeurs` n’existe pas (pas de `CREATE TABLE` dans les migrations).

**Dette globale (audit) :**

- 77 migrations analysées (avant SaaS 1B.1)
- 41 directement non reproductibles
- environ 8 à 12 cascades supplémentaires

---

## D. Lecture staging

| Item | Valeur |
|------|--------|
| Project ref staging | `qokyobcvplzufshydhih` |
| Production interdite | `qcgvzdlfsxybrmloijpt` |
| Dump | lecture seule, schema `public` uniquement |
| Données métier exportées | **non** |
| Fichier temporaire bureau | `%TEMP%\tagora-time-staging-schema.sql` (~202480 octets) |
| Dump dans Git | **non** (ne jamais le committer) |

Le dump du poste bureau **n’est pas** une source Git. À la maison : ne pas le rechercher dans le dépôt ; refaire un dump local si le bootstrap doit être construit.

---

## E. Tables manquantes (21)

Présentes en staging, absentes des `CREATE TABLE` migrations :

1. `chauffeurs` (**82 colonnes** en staging)
2. `account_requests`
3. `sorties_terrain`
4. `livraisons_planifiees`
5. `temps_titan`
6. `photos_dossier`
7. `dossiers`
8. `notes_dossier`
9. `vehicules`
10. `remorques`
11. `delivery_day_closures`
12. `department_coverage_requirements`
13. `employee_schedules`
14. `employee_usual_schedules`
15. `feedback`
16. `gps_base_events`
17. `horodateur`
18. `horodateur_punch_challenges`
19. `remorque_unavailabilities`
20. `vehicule_unavailabilities`
21. `test`

**La table `test` doit être exclue du futur bootstrap.**

---

## F. Fonctions manquantes (12)

Présentes en staging, absentes des migrations :

1. `approve_horodateur_exception`
2. `reject_horodateur_exception`
3. `recompute_horodateur_current_state`
4. `recompute_horodateur_shift`
5. `trg_recompute_horodateur_current_state`
6. `trg_recompute_horodateur_shift`
7. `trg_recompute_horodateur_shift_from_exception`
8. `horodateur_punch_challenges_touch_updated_at`
9. `set_updated_at`
10. `set_updated_at_gps_bases`
11. `set_admin_improvement_notification_preferences_updated_at`
12. `validate_livraison_planning_guardrails`

---

## G. Divergences dépôt ↔ staging

- `authorization_requests` : présente en migrations, **absente** du dump staging
- `effectifs_calendar_exceptions` : présente en migrations, **absente** du dump staging
- `horodateur_exception_action_tokens` : présente en migrations, **absente** du dump staging
- tables SaaS 1B.1 : absentes du staging — **attendu** (non appliquées)
- `account_request_rate_limits` : présent dans `supabase/account_requests.sql`, **absent** staging

---

## H. Stratégie recommandée

**Futur fichier proposé :**
`supabase/migrations/20260409120000_historical_schema_bootstrap.sql`

**Source :** dump schema-only staging filtré (DDL réel).

**Inclure :** tables historiques requises (sans `test`), types, PK, FK, index, contraintes, fonctions et triggers **strictement nécessaires**.

**Exclure :** données, seeds, table `test`, secrets, auth data, blobs storage, vues recréées plus tard, policies dupliquées, hardcodes Oliem/Titan inutiles.

**Règles :**

- ne modifier aucune migration legacy
- ne pas utiliser `migration repair`
- ne pas créer de stubs minimaux
- ne pas fusionner vers feature avant reconstruction locale complète jusqu’aux migrations SaaS 1B.1

**Bootstrap historique : NON CRÉÉ au bureau.**

---

## I. Reprise maison

### Bannière

```
SAAS 1B.1 NON VALIDÉ EN BASE LOCALE
BOOTSTRAP HISTORIQUE NON CRÉÉ
NE PAS MERGER VERS FEATURE
```

### Étapes

1. Mettre à jour la branche WIP (`git fetch` + checkout WIP + `git pull`)
2. Vérifier Docker / WSL
3. Vérifier ou refaire le lien staging (`qokyobcvplzufshydhih`) seulement si nécessaire — **jamais** la production
4. Refaire un dump schema-only vers `%TEMP%` si le bootstrap doit être construit
5. Ne jamais utiliser le dump du bureau comme fichier Git
6. Créer le bootstrap **seulement** après un **GO Martin** distinct

### Commandes de reprise (référence)

```powershell
cd C:\dev\tagora-time
git fetch origin
git checkout wip/saas1b1-tenant-foundation-checkpoint-2026-07-13
git pull --ff-only origin wip/saas1b1-tenant-foundation-checkpoint-2026-07-13
git status -sb
git rev-parse HEAD
# Feature doit rester : 6fd6ca09078eedbd133e59aca160f606fa33040b
git rev-parse origin/feature/sales-book-grants
```

---

## Interdictions reprises

- aucun bootstrap sans GO Martin
- aucun db push / db reset / migration repair
- aucun SQL d’écriture staging/prod
- aucun merge vers `feature/sales-book-grants`
- aucun commit sur feature pour ce chantier
- aucun backfill / seed Oliem
