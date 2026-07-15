# TAGORA Time — SaaS 1B.1B H4-A — Audit fondation multi-tenant (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time uniquement (`C:\dev\tagora-time`)  
**Poste :** Maison  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD avant :** `9ac279e62cf4cfd9242fb8e2be94aca2f61665bd`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  
**Staging (RO) :** `qokyobcvplzufshydhih`  
**Production (INTERDITE) :** `qcgvzdlfsxybrmloijpt`  
**Avancement V1 :** **51 %** (inchangé)

**Écriture staging / migration apply / repair / db push réel :** **aucune**.  
**Migration SQL nouvelle :** **aucune**.

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
- Fonctions INVOKER, `proconfig` vide (pas de `search_path`)
- EXECUTE fonctions encore visible pour PUBLIC/anon/authenticated (defaults) → **à durcir avant/avec exécution**
- `platform_access_audit` : service_role conserve des privilèges DML larges via defaults Supabase malgré GRANT SQL limité → **append-only DB non garanti**

Classement :

| Objet | Classe |
|-------|--------|
| Tables + FORCE RLS + 0 policy | fail-closed |
| Revoke client | fail-closed |
| Fonctions sans search_path / EXECUTE large | à durcir avant exécution |
| Audit sans blocage UPDATE/DELETE DB | à durcir avant exécution |
| Membership `organization_id` mutable | à durcir / décision Martin |

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
| H5-F2 `20260412161500` | applied |
| H5-F3R `20260412191500` | applied |
| H5-F4 (`090500`/`140500`/`120500`) | applied |
| H5-E2A→E2D | applied |

Snapshots : `%TEMP%\tagora-time-h4a-staging-*-2026-07-16.txt`, `…-migration-list-…`, SHA fichier list `7BBE1797…5ED8`.

---

## 6. Risques métier / sécurité (résumé)

### Memberships — `organization_id`
`enforce_organization_has_owner` vérifie le dernier owner sur UPDATE seulement si `role` **ou** `status` change. Un UPDATE qui déplace un owner actif vers une autre `organization_id` **sans** changer rôle/statut **n’est pas bloqué** → org source peut perdre son dernier owner.

**Question bloquante Martin :** le membership peut-il changer d’organisation, ou doit-il être **supprimé puis recréé** (recommandé : `organization_id` immuable) ?

Autres scénarios dernier owner (delete / demote / suspend) : **protégés** par le trigger. Insertion premier owner : **OK**. Deux owners : **OK**.

### Invitations
- `token_hash` only (≥32) : OK  
- email lower/trim + `@` : OK  
- accepted consistency : OK  
- revoked consistency : permet `status <> revoked` **avec** `revoked_at` non null  
- pas d’auto `expired` ; pending + `expires_at` passé possible  
- pas de durée max hardcodée  

### Platform access / audit
- Support : `expires_at` obligatoire : OK  
- Super admin : expiration optionnelle ; unicité active/user : OK  
- Plusieurs support actifs : autorisés  
- status active + expires_at passé : possible (pas d’auto-expire)  
- Audit : **pas** d’immutabilité DB réelle pour service_role  

### Organizations / companies / settings
- slug unique si `deleted_at IS NULL` ; timezone SQL = **UTC** ; status défaut **pending**  
- une seule company `is_default` ; **pas** d’exigence d’en avoir une  
- settings 1:1 **non** auto-créés  

---

## 7. Dry-run `db push --linked`

```text
npx supabase db push --linked --dry-run
```

Résultat : **refuse** d’appliquer ; exige `--include-all` et listerait notamment :

- nombreuses H5 historiques pending (dont **`20260425133500` H5-F5**) ;
- les **six H4**.

**Conclusion :** `db push` direct (avec ou sans `--include-all`) = **interdit** pour H4. Aucun `--include-all` utilisé.

---

## 8. Options d’application

| Option | Verdict | Motif |
|--------|---------|-------|
| **A** — push des 6 originales | **NO-GO** | hors-ordre ; exige `--include-all` → risque H5-F5 |
| **B** — 1 forward-only consolidée + repair history-only des 6 | **GO sous conditions** | sûr si SQL isolé + décisions Martin intégrées |
| **C** — 3 forward-only H4-B1/B2/B3 + repair history-only des 6 | **GO recommandé** | atomicité par lot ; rollback plus fin |
| **D** — SQL TX contrôlé + repair | **GO sous conditions** | équivalent à B/C sans fichier forward si gates strictes |

**Recommandation :** **Option C** (forward-only post-`20260715160000`), puis `migration repair --status applied` **uniquement** des six versions `20260712220x00`. Jamais H5-F5. Jamais `--include-all`.

### Découpage recommandé

**H4-B1 — Racine tenant**  
`organizations`, `organization_companies`, `organization_settings`, `set_saas_foundation_updated_at` (+ durcir search_path / EXECUTE fonctions).

**H4-B2 — Identités**  
`organization_memberships`, `organization_invitations`, `enforce_organization_has_owner` (+ immutabilité `organization_id` si GO Martin ; durcir invitations).

**H4-B3 — Plateforme**  
`platform_access`, `platform_access_audit` (+ blocage UPDATE/DELETE audit ; politique expires).

Chaque lot : snapshot DDL, TX+gates, tests RLS role matrix, rollback documenté, **pas** de seed/backfill/org créée.

---

## 9. Décisions Martin requises (non prises)

1. `default_timezone` : garder **UTC** ou passer **America/Toronto** ?  
2. status org défaut : garder **pending** ?  
3. réutilisation slug après soft-delete ?  
4. interdire clés sensibles dans `metadata` ?  
5. exiger exactement une company `is_default` ?  
6. auto-créer `organization_settings` avec org ?  
7. branding uniquement org-level (confirmé SQL) vs overrides compagnie ?  
8. schémas JSON versionnés vs jsonb libre ?  
9. **membership `organization_id` immuable** (recommandé) ?  
10. durée max invitation + auto `expired` ?  
11. durcir `revoked_at` null quand non-revoked ?  
12. conserver email post-acceptation ?  
13. durée max support ; expiration super admin ?  
14. audit via trigger vs service app ; **blocage DB UPDATE/DELETE** ?  
15. politique consultation données client par support ?

---

## 10. Protections

- H5-F5 : **protégé** (pending ; hors périmètre)  
- Feature : **non intégrée**  
- Production : **intacte**  
- Aucune org/membership/invitation/platform_access créée  
- V1 : **51 %**

---

## 11. Rollback futur (après éventuel H4-B*)

- Rollback SQL uniquement sous mandat ; préférer drop contrôlé des objets fondation **vides**  
- `migration repair … reverted` = history-only  
- Ne jamais `--include-all` pour « revenir »

---

## 12. Verdict H4-A

**H4-A TERMINÉ — DÉCISIONS MARTIN REQUISES AVANT TOUTE APPLICATION**

Prochaine étape unique : **recueillir décisions Martin**, puis mandat **H4-B1** (Option C) — sans auto-exécution.
