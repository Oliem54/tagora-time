# TAGORA Time — SaaS 1B.1B H4-A — Audit fondation multi-tenant (2026-07-16)

**Agent exécutant :** Martin
**Agent donneur :** Martin
**Projet :** TAGORA Time uniquement (`C:\dev\tagora-time`)
**Poste :** Maison
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`
**HEAD avant H4-A :** `9ac279e62cf4cfd9242fb8e2be94aca2f61665bd`
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`
**Staging (RO) :** `qokyobcvplzufshydhih`
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 avant H4-A (gelé historique) :** 51 %
**Avancement V1 après H4-A (recalculé) :** **55 %** — voir §13.
**Avancement V1 après H4-B1 GO :** **57 %** — voir `TAGORA-TIME-SAAS1B1B-H4B1-TENANT-ROOT-EXECUTION-2026-07-16.md`.
**Avancement V1 après H4-B2 GO :** **59 %** — voir `TAGORA-TIME-SAAS1B1B-H4B2-ORGANIZATION-IDENTITIES-EXECUTION-2026-07-16.md`.

**Écriture staging / migration apply / repair / db push réel :** **aucune**.
**Migration SQL nouvelle :** **aucune**.
**H4-A = dernier audit global fondation H4.** Aucune chaîne H4-A1/A2/A3. Aucun élargissement SaaS 1B.2.

---

## 0. Directive priorité V1 fonctionnelle rapide

Objectif : livrer une V1 fonctionnelle sans contourner sécurité, validation ni isolation SaaS.

- H4-A est l’**audit final** de la fondation H4.
- Les décisions non bloquantes sont classées **REPORT APRÈS V1**.
- Les durcissements sécurité minimaux nécessaires à l’isolation sont **dans H4-B**, pas reportés.
- Aucune production ; aucun `--include-all` ; aucun H5-F5 avant H4 ; aucune intégration feature avant H4 + H5-F5.

---

## 1. Recadrage

RECADRAGE CURSOR VALIDÉ — TAGORA TIME EST LE SEUL PROJET ACTIF.

---

## 2. Six migrations H4 (SHA-256 LF)

| Migration | SHA-256 |
|-----------|---------|
| `20260712220000_saas1_organizations.sql` | `EA4A486D7FC3686E9792D6986C23B45A6D0AAEA8EE89669118A7E38D17153186` |
| `20260712220100_saas1_organization_companies.sql` | `6F3F12245CBB825E8E541201F1D134C2B4D88A164942EC9C885C73A3E754AC19` |
| `20260712220200_saas1_organization_settings.sql` | `7D19617344F6114A84845855EAF096F1E378E9F776322539E295375F67E94398` |
| `20260712220300_saas1_organization_memberships.sql` | `BAF21D05A6FAF9651EA767F705C83AF2B78E31828515E24EDB58177C9DEF512F` |
| `20260712220400_saas1_organization_invitations.sql` | `FA63050919FEB281E677BDFABFCC9071581B4C8E8B76D8F2AF16BF4623D04A47` |
| `20260712220500_saas1_platform_access.sql` | `3E9544F09CE34E7D70542C6E5AC65AAAB7944F9CE1190F80BB144D61867BD657` |

| Migration | Tables | Fonctions | Triggers | Indexes (créés) | Seed/backfill | Biz ALTER |
|-----------|--------|-----------|----------|-----------------|---------------|-----------|
| 220000 | organizations | set_saas_foundation_updated_at | trg_organizations_updated_at | 3 | non | non |
| 220100 | organization_companies | — | trg_organization_companies_updated_at | 4 | non | non |
| 220200 | organization_settings | — | trg_organization_settings_updated_at | 0 (+PK) | non | non |
| 220300 | organization_memberships | enforce_organization_has_owner | enforce_owner + updated_at | 4 | non | non |
| 220400 | organization_invitations | — | updated_at | 3 | non | non |
| 220500 | platform_access, platform_access_audit | — | trg_platform_access_updated_at | 4+3 | non | non |

**Totaux :** 7 tables · 2 fonctions · 7 triggers · ~30 index locaux (PK inclus) · 0 seed · 0 backfill · 0 ALTER métier.

---

## 3. Contrat RLS / grants (SQL)

Pour les **7 tables** :

- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- **0** policy created (fail-closed)
- **0** `USING (true)` / `WITH CHECK (true)`
- `REVOKE ALL` anon + authenticated
- `GRANT` service_role : CRUD opérationnel ; audit : `SELECT, INSERT` **intenus** dans le SQL

**Constats locaux après reset :**

- 7 tables présentes, **vides**, RLS+FORCE = true, policy_count = 0
- Fonctions INVOKER, `proconfig` vide (pas de `search_path`) → durcir en H4-B1
- EXECUTE fonctions encore visible pour PUBLIC/anon/authenticated → durcir en H4-B1
- `platform_access_audit` : append-only DB non garanti via defaults → durcir en H4-B3

| Objet | Classe |
|-------|--------|
| Tables + FORCE RLS + 0 policy | fail-closed |
| Revoke client | fail-closed |
| Fonctions search_path / EXECUTE | à durcir **dans H4-B1** (chemin critique) |
| Audit UPDATE/DELETE | à durcir **dans H4-B3** (chemin critique) |
| Membership `organization_id` | immuable **dans H4-B2** (reco ferme) |

---

## 4. État local (reset)

- Cible : `127.0.0.1` ; `npx supabase db reset --local` **PASS**
- Migrations locales : **92**
- Six H4 appliquées en local
- Sept tables H4 vides ; RLS+FORCE OK ; 0 policy true
- Aucune table métier modifiée par H4

Snapshots hors Git : `%TEMP%\tagora-time-h4a-local-contract-2026-07-16.txt`, `…-local-hashes-2026-07-16.txt`.

---

## 5. État staging (RO)

Project ref linked : **`qokyobcvplzufshydhih`** (≠ production).

| Contrôle | Résultat |
|----------|----------|
| Tables H4 | **absentes** (collision_idx = 0) |
| Fonctions H4 | **absentes** |
| H4 pending | **6** |
| H5-F5 `20260425133500` | **pending** |
| H5-F2 / F3R / F4 | applied |
| H5-E2A→E2D | applied |

Snapshots : `%TEMP%\tagora-time-h4a-staging-*-2026-07-16.txt`.

---

## 6. Risques (chemin critique seulement)

### Bloquant — memberships `organization_id`
Le trigger dernier owner ne protège pas un UPDATE qui déplace un owner actif vers une autre org sans changer `role`/`status`.

**Reco ferme :** `organization_id` **immuable** après INSERT (erreur si UPDATE le change). Transfert = delete + recreate. À appliquer dans **H4-B2**.

### Bloquant — fonctions fondation
Sans `search_path` fixe + REVOKE EXECUTE PUBLIC/anon : surface de détournement.

**Reco ferme :** durcir dans **H4-B1** (même pattern H5-E2A).

### Bloquant — audit append-only
SELECT/INSERT seuls en intention SQL ; DML large encore possible via defaults.

**Reco ferme :** REVOKE UPDATE/DELETE (+ trigger deny si nécessaire) dans **H4-B3**.

### Non bloquant V1 — invitations / platform
Cohérence `revoked_at` stricte, auto-expire, durée max support, schemas JSON : **REPORT APRÈS V1** (app + lots ultérieurs). Les CHECK existants (`token_hash`, support `expires_at`, roles hors memberships) suffisent pour V1.

---

## 7. Dry-run `db push --linked`

```text
npx supabase db push --linked --dry-run
```

Refuse sans `--include-all` ; avec ce flag appliquerait H5 historiques pending (dont **H5-F5**) + 6 H4.

**Conclusion :** `db push` direct = **interdit**. Jamais `--include-all`.

---

## 8. Méthode d’application H4 immédiatement exécutable

| Option | Verdict |
|--------|---------|
| A — push des 6 originales | **NO-GO** |
| B — 1 consolidée + repair history-only | acceptable mais moins granulaire |
| **C — 3 forward-only H4-B1/B2/B3 + repair history-only des 6** | **GO — méthode retenue** |
| D — SQL TX + repair | équivalent, plus opaque |

### Méthode C (exécutable)

1. Créer **exactement 3** migrations forward-only **après** `20260715160000` (ex. `20260716220000` / `221000` / `222000`).
2. Contenu = SQL des 6 fichiers H4 **plus** durcissements minimaux des reco fermes (§9), **sans** seed / backfill / org / ALTER métier.
3. Appliquer chaque lot sur staging via canal contrôlé **scoped** (jamais `db push --include-all`).
4. Après B1+B2+B3 appliqués et prouvés : `migration repair --status applied` **uniquement** sur les six versions `20260712220x00`.
5. **Ne jamais** repair / push `20260425133500` (H5-F5) dans ce flux.
6. Preuves obligatoires par lot : reset local PASS, tables vides, RLS+FORCE, 0 policy client, grants fail-closed, tests ciblés verts.

**Nombre minimal de sous-lots :** **3** (H4-B1, H4-B2, H4-B3). Pas de fusion en un seul lot (rollback plus grossier) sauf interruption technique démontrée.

### Découpage

**H4-B1 — Racine tenant**
`organizations`, `organization_companies`, `organization_settings`, `set_saas_foundation_updated_at` + durcir `search_path` / EXECUTE.

**H4-B2 — Identités**
`organization_memberships`, `organization_invitations`, `enforce_organization_has_owner` + immutabilité `organization_id`.

**H4-B3 — Plateforme**
`platform_access`, `platform_access_audit` + revoke UPDATE/DELETE audit.

---

## 9. Décisions réellement bloquantes (liste courte)

| # | Décision | Reco ferme Martin | Lot |
|---|----------|-------------------|-----|
| D1 | `organization_id` membership mutable ? | **NON — immuable** (delete+recreate) | H4-B2 |
| D2 | Durcir fonctions fondation (`search_path`, REVOKE EXECUTE PUBLIC/anon) ? | **OUI** | H4-B1 |
| D3 | Forcer append-only audit en DB (REVOKE UPDATE/DELETE) ? | **OUI** | H4-B3 |
| D4 | Méthode d’application | **Option C — 3 lots** | H4-B* |

Ces reco **engagent** H4-B. Aucune nouvelle phase d’audit requise pour les trancher.

### REPORT APRÈS V1 (non bloquant)

- timezone SQL `UTC` vs `America/Toronto` → garder **UTC** en fondation ; override app/settings plus tard
- status org défaut `pending` → **garder**
- réutilisation slug après soft-delete → comportement SQL actuel (`deleted_at IS NULL`) **OK V1**
- interdiction clés sensibles `metadata` → validation app **après V1**
- exiger exactement une company `is_default` → **non** en DB V1
- auto-créer `organization_settings` → **non** en DDL ; service after V1 si besoin
- branding company-level overrides → **non** V1 (org-level suffit ; déjà décidé SaaS-1)
- schémas JSON versionnés → **après V1**
- durée max invitation + auto `expired` → **après V1** (job app)
- durcir CHECK `revoked_at` strict → **après V1** si non trivial
- conserver email post-acceptation → **oui garder**
- durée max support / expire super admin → CHECK support actuel **OK V1** ; politique max **après V1**
- politique consultation données client par support → runtime/docs **après V1**
- SaaS 1B.2, entitlements, billing, backfill métier → **hors périmètre**

---

## 10. Chemin critique exact jusqu’à V1 fonctionnelle

```text
H4-A audit final ✅
→ H4-B1 racine tenant
→ H4-B2 memberships et invitations
→ H4-B3 accès plateforme et audit
→ H5-F5 Storage isolé par organisation
→ intégration contrôlée avec feature
→ QA fonctionnelle V1
→ pilote V1
```

Tout hors cette liste : **REPORT APRÈS V1**.

---

## 11. Protections

- H5-F5 : **protégé** jusqu’après H4-B1..B3
- Feature : **non intégrée** tant que H4 + H5-F5 non validés
- Production : **intacte**
- Aucune org/membership/invitation/platform_access créée
- Aucune migration SQL créée dans H4-A

---

## 12. Rollback futur (après H4-B*)

- Tables fondation **vides** : drop contrôlé sous mandat
- `migration repair … reverted` = history-only
- Jamais `--include-all`

---

## 13. Matrice V1 recalculée (après H4-A)

Le **51 %** gelé ne crédait plus H5-E ni H5-F2/F3R/F4 fermés, ni le plan H4 exécutable. Recalcul chemin critique → V1 fonctionnelle (somme exacte) :

| Domaine | Poids (pts) | Avancement | Points | Justification |
|---------|------------:|-----------:|-------:|---------------|
| Modules métier V1 existants (dual-run JWT) | 30 | 100 % relatif poids | **30** | App interne opérationnelle ; isolation tenant runtime absente |
| H5 réconciliation non-Storage (A–D, F2/F3R/F4) | 12 | 100 % | **12** | History + lots fermés |
| H5-E sécurité / RLS / helpers | 8 | 100 % | **8** | E2A–E2D fermés |
| Fondation H4 — audit/plan | 2 | 100 % | **2** | H4-A final ; méthode C verrouillée |
| Fondation H4 — apply B1/B2/B3 + repair | 10 | 40 % (B1+B2) | **4** | H4-B1+B2 applied ; B3 pending |
| H5-F5 Storage isolé org | 12 | 0 % | **0** | Attend H4-B3 |
| Intégration feature contrôlée | 12 | 0 % | **0** | Attend H4 + F5 |
| QA fonctionnelle V1 | 8 | 0 % | **0** | Après intégration |
| Pilote V1 | 6 | 0 % | **0** | Après QA |
| **Total après H4-A** | **100** | — | **55** | audit only |
| **Total après H4-B1 GO** | **100** | — | **57** | +2 pts apply B1 |
| **Total après H4-B2 GO** | **100** | — | **59** | +2 pts apply B2 |

**Pourcentage global après H4-A : 55 %** ; **après H4-B1 : 57 %** ; **après H4-B2 : 59 %**.

---

## 14. Prochain mandat exécutable unique

**H4-B1 — EXÉCUTÉ (GO).** Voir handoff H4-B1.
**H4-B2 — EXÉCUTÉ (GO).** Voir handoff H4-B2.

**Prochaine étape :** **H4-B3** (platform_access + audit append-only) — mandat distinct.

---

## 15. Verdict H4-A

**H4-A TERMINÉ — AUDIT FONDATION TENANT DOCUMENTÉ, PLAN D’APPLICATION PRÊT**

Les seules décisions bloquantes sont tranchées par reco fermes (D1–D4).
Pas de H4-A1/A2/A3. Pas de nouvel audit. Pas d’application auto dans ce mandat.

STOP après H4-B1 en prochain mandat distinct.
