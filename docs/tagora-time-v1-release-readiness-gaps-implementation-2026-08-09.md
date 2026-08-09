# TAGORA Time — V1 — Préparation de la fermeture des écarts de production

## Identification

- Projet : TAGORA Time uniquement
- Date : 2026-08-09
- Agent donneur : Martin
- Agent exécutant : Agent Cursor TAGORA Time uniquement
- Branche : main
- Commit de départ : d96082ed9e25e7fbedb97cae7660d017bf2a7002
- V1 fonctionnelle et technique : 100 %, fermée
- Production : non touchée

## Objectif et limites

Ce document prépare les procédures nécessaires à la fermeture sécuritaire des
écarts opérationnels restants. Il n’exécute aucune action sur local, staging,
preview ou production. Il ne lit ni n’exécute aucun fichier de seed.

## État V1

```text
V1_GLOBAL_CLOSURE_STATUS=CLOSED
V1_FUNCTIONAL_PROGRESS=100%
FUNCTIONAL_DEVELOPMENT=100%
TECHNICAL_STABILIZATION=100%
REAL_V1_BLOCKER_COUNT=0
```

## Décision H4B et seeds

### Couverture H4B (fichiers Git suivis)

| Lot | Fichier | Portée documentée |
|---|---|---|
| H4B1 | `supabase/migrations/20260716220000_h4b1_tenant_root_foundation.sql` | `organizations`, `organization_companies`, `organization_settings`, triggers/RLS |
| H4B2 | `supabase/migrations/20260716221000_h4b2_organization_identities.sql` | `organization_memberships`, `organization_invitations`, protection dernier owner |
| H4B3 | `supabase/migrations/20260716222000_h4b3_platform_access_audit.sql` | `platform_access`, `platform_access_audit` |

Ordre obligatoire futur : H4B1 → H4B2 → H4B3 → seed tenant/company → seed memberships.

### Seed tenant/company

- Fichier Git : `supabase/migrations/20260809120000_v1_oliem_tenant_company_seed.sql`
- Staging : exécuté exactement **une** fois; postcheck PASS (docs Phase B).
- Production : **besoin conditionnel** — requis seulement si inventaire READ-ONLY
  prouve l’absence du tenant/companies/settings Oliem.
- Ne pas réexécuter automatiquement.
- Ne pas inventer la présence/absence des données production sans preuve.

### Seed memberships

- Script Git : `scripts/seed-v1-oliem-memberships.mjs`
- Action **séparée** du seed tenant/company.
- Dry-run par défaut; write seulement avec `--write` + `--owner-user-id`.
- Production : requise plus tard pour activer les rôles org, après tenant seed
  et sous GO Martin distinct.
- Aucun membership ni Auth user créé par le seed tenant/company staging.

### Ordre futur recommandé des actions production

1. Inventaire READ-ONLY H4B1/B2/B3 + présence tenant Oliem.
2. Backup production validé.
3. Confirmation cible + rollback accepté.
4. GO Martin.
5. Appliquer seulement les H4B manquants (méthode ciblée, jamais `db push` global
   si dérive d’historique).
6. Si nécessaire : seed tenant/company (idempotent / anti-doublon).
7. Smoke tests structurels.
8. Plus tard : membership dry-run puis write contrôlé.
9. Smoke tests rôles / isolation.
10. Rapport + décision GO final / rollback.

### Contrôles avant chaque action

- Cible = production TAGORA Time uniquement (ref documentée
  `qcgvzdlfsxybrmloijpt`; staging `qokyobcvplzufshydhih` exclue).
- Backup `BACKUP_OK`.
- Rollback accepté.
- GO Martin du bloc concerné.
- Inventaire préalable des objets/données ciblés.

### Contrôles après chaque action

- Historique migration / objets schéma attendus.
- Comptages non sensibles (tenant=1, companies attendues, settings).
- Memberships inchangés si hors scope du bloc.
- Aucun secret dans les logs.

### Prévention des doublons / idempotence

- Prefers `IF NOT EXISTS` / `WHERE NOT EXISTS` (modèle seed staging).
- Unique indexes H4B (`slug` actif, `(organization_id, company_code)`, un default
  company, etc.).
- Memberships : unique `(organization_id, user_id)`; preserve existing; no DELETE.
- Ne jamais « réparer » en masse l’historique distant non lié.

### Conditions GO / NO-GO

| GO si | NO-GO si |
|---|---|
| Inventaire clair + backup OK + rollback accepté + cible confirmée + GO Martin | Ambiguïté cible, backup invalide, collision données, historique inconnu, absence GO |

### Preuves manquantes (à obtenir plus tard)

1. Résultat inventaire H4B production.
2. Présence/absence seed Oliem production.
3. Preuve backup production validé.
4. Acceptation Martin du plan rollback.
5. Confirmation live non secrète de la cible/deploy.
6. Exécution éventuelle memberships (séparée).

## Procédure future de backup production

### Identification sécuritaire de la cible

- Projet : TAGORA Time — Production DB
- Ref documentée (non secrète) : `qcgvzdlfsxybrmloijpt`
- Interdiction : utiliser staging `qokyobcvplzufshydhih`
- Interdiction : afficher connection string, mots de passe, tokens

### Outil et format recommandés

- Outil : export logique PostgreSQL / outil backup Supabase Dashboard du projet
  production (selon capacité du plan), exécuté hors dépôt Git.
- Format : `.dump` logique ou archive officielle Supabase, + fichier
  `*.sha256.txt`
- Emplacement : stockage sécurisé hors dépôt (ex. coffre organisationnel /
  bucket privé), jamais commit dans Git.

### Nommage

```text
tagora-time-prod-backup-YYYYMMDD-HHMMSS.<ext>
tagora-time-prod-backup-YYYYMMDD-HHMMSS.sha256.txt
```

### Validations obligatoires

1. Fichier non vide; taille > seuil minimal documenté à l’exécution.
2. Liste de restauration lisible / archive ouvrable.
3. SHA256 calculé et stocké à côté du backup.
4. Identifiant backup + horodatage + opérateur consignés dans le rapport.

### Critères

```text
BACKUP_OK=
  - cible production confirmée
  - fichier présent hors dépôt
  - taille valide
  - archive/liste restauration valide
  - SHA256 présent et concordant
  - preuve non secrète consignée

BACKUP_FAILED=
  - toute validation manquante ou ambiguë
```

### Règle d’arrêt

Si `BACKUP_FAILED` : **interdiction absolue** de continuer migrations, seeds,
déploiements ou writes production.

### Responsable / conservation

- Responsable exécution : Martin (ou délégué nommé dans le GO du bloc backup).
- Conservation : selon politique interne Oliem; preuve traçable dans le rapport
  du futur bloc backup.

## Plan de rollback

| Domaine | Déclencheur | Action future | Responsable | Validation | Limite |
|---|---|---|---|---|---|
| Application | Régression critique post-deploy | Redéployer commit `main` connu bon précédent | Martin / ops | Smoke tests PASS sur version antérieure | Pas de force-push; pas de rewrite history |
| Déploiement | Deploy Vercel incorrect / mauvaise cible | Redeploy pin sur SHA validé | Martin / ops | URL prod sert le SHA attendu | Aucun redeploy staging/preview confondu |
| Variables | Mauvaise variable détectée | Restaurer valeurs précédentes hors chat (UI/CLI) | Martin | App boot + auth OK | Ne jamais coller secrets dans Git/chat |
| Migration DB | Migration destructive / schéma cassé | Stop writes; évaluer reverse contrôlé ou restore backup | Martin + DBA | Schéma/app cohérents | Ne pas promettre reverse SQL sans preuve |
| Restauration DB | Corruption / données irréversibles | Restore depuis backup `BACKUP_OK` | Martin + DBA | App + comptages critiques OK | Perte des writes post-backup possible |
| Seeds et données | Doublons / mauvais tenant seed | Stop; inventaire; correctif ciblé ou restore | Martin | Tenant/company invariants OK | Pas de DELETE massif improvisé; memberships séparés |

### Critères de déclenchement

- Auth impossible pour rôles critiques;
- isolation tenant/company rompue;
- erreurs 5xx massives;
- données Oliem absentes/dupliquées après seed;
- mauvaise cible confirmée.

### Décisionnaire

Martin (GO/NO-GO rollback). Aucun agent n’exécute un rollback sans GO distinct.

### Ordre d’exécution rollback (futur)

1. Stop nouvelles writes.
2. Isoler la cible (confirmée).
3. Rollback app/deploy si suffisant.
4. Sinon restore DB depuis backup validé.
5. Smoke tests.
6. Rapport + décision reprise ou maintien arrêt.

### Limite honnête

Les migrations forward-only ne sont pas automatiquement réversibles. La
restauration DB depuis backup reste le filet principal.

## Confirmation de la cible production

Checklist future (aucune valeur secrète) :

| Contrôle | Local | Preview | Staging | Production |
|---|---|---|---|---|
| Projet Supabase | — | — | `tagora-time-staging` / ref `qoky...dhih` | `TAGORA Time - Production DB` / ref `qcgv...ijpt` |
| Ref exacte attendue | — | — | `qokyobcvplzufshydhih` | `qcgvzdlfsxybrmloijpt` |
| Branche Git attendue | feature/* | PR branch | `main` ou preview | `main` @ SHA GO |
| Environnement hébergeur | local | Vercel Preview | Preview/staging config | Vercel Production |
| Domaine | localhost | `*.vercel.app` | domaine staging si défini | domaine production canonique |
| Base cible | locale | staging ref | staging ref | production ref |
| Variables | `.env.local` | Preview env | Preview/staging env | Production env (présence seule) |
| Confirmation Martin | N/A | N/A | Oui si write staging | **Obligatoire** avant toute action |

Contrôle final anti-mauvaise-cible :

1. Afficher uniquement refs masquées + noms de projet.
2. Comparer à la table ci-dessus.
3. Exiger confirmation verbale/écrite Martin.
4. Si mismatch → STOP immédiat.

`PRODUCTION_SECRET_EXPOSURE_REQUIRED=false` — seules présence/références.

## Preuves restant à obtenir

1. Inventaire H4B production (présent / manquant / mismatch).
2. État seed Oliem production (présent / absent).
3. Backup production exécuté + `BACKUP_OK` + SHA256.
4. Acceptation formelle du plan rollback par Martin.
5. Confirmation live non secrète cible deploy/DB.
6. (Plus tard) dry-run puis write memberships sous GO.

`REMAINING_EVIDENCE_COUNT=6`

## Séquence future recommandée

1. prévol Git;
2. confirmation humaine de la cible;
3. validation non secrète des variables;
4. backup réel et validation;
5. décision migrations et seeds;
6. confirmation rollback;
7. GO Martin distinct;
8. exécution contrôlée;
9. smoke tests;
10. décision GO final ou rollback;
11. rapport et checkpoint.

## Sécurité du présent bloc

Confirmé :

- aucune commande Supabase;
- aucune requête SQL;
- aucun seed lu ou exécuté;
- aucune migration;
- aucun backup exécuté;
- aucun déploiement;
- aucun changement Vercel;
- aucun changement DNS;
- aucune variable ou valeur secrète consultée;
- aucune production modifiée;
- trois stashes intacts.

## Verdict

```text
PRODUCTION_PREFLIGHT_ALLOWED_AFTER_DOCUMENTATION=true
PRODUCTION_RELEASE_STATUS=CONDITIONAL_GO_PENDING_CONTROLLED_PREFLIGHT
REMAINING_EVIDENCE_COUNT=6

V1_GLOBAL_CLOSURE_STATUS=CLOSED
V1_FUNCTIONAL_PROGRESS=100%
FUNCTIONAL_DEVELOPMENT=100%
TECHNICAL_STABILIZATION=100%
REAL_V1_BLOCKER_COUNT=0
```

Ce statut n’autorise **aucune** production. Il autorise seulement la préparation
d’un futur prévol contrôlé avec un **nouveau GO Martin**.

## Prochaine étape

```text
NEXT_TAGORA_TIME_BLOCK=TAGORA-TIME-V1-CONTROLLED-PRODUCTION-GO-NOGO-PREFLIGHT-2026-08-09
```

Un nouveau GO Martin reste obligatoire avant ce prévol et avant toute action
production.
