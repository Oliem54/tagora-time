# TAGORA Time — V1 Tenant/Company Phase B — Fermeture finale

## Identification

- Projet : TAGORA Time uniquement
- Date : 2026-08-09
- Agent donneur : Martin
- Agent exécutant : Agent Cursor TAGORA Time uniquement
- Environnement concerné : Supabase staging TAGORA Time (`tagora-time-staging`)
- Production : non touchée
- Base Git : `main` @ `79f97855a388d2bd8137b935b128582b88b7b4e7` (PR #65 mergée)
- Seed Git : `supabase/migrations/20260809120000_v1_oliem_tenant_company_seed.sql`

## Objectif fermé

La Phase B ferme le scoping tenant/company Oliem nécessaire à la V1 en appliquant
sur staging uniquement le seed déterministe tenant + companies + settings, après
preuve que H4B1/H4B2/H4B3 étaient déjà `proven_applied` et que le seed était
`proven_missing`.

Cette fermeture documente l’application unique réussie et validée en lecture seule.
Elle n’autorise pas memberships, Auth users, production, ni déploiement.

## Résultat staging confirmé

Sans secret :

- seed exécuté exactement une fois;
- méthode : `supabase db query --linked -f` (fichier unique; pas de `db push`);
- application réussie;
- postcheck read-only réussi;
- tenant attendu (`slug=oliem-solution`) : 1;
- company attendue (`company_code=oliem_solutions`, default) : 1;
- company Titan (`company_code=titan_produits_industriels`, non-default) : 1;
- relation tenant/company (même `organizations.id` UUID) : 1 org partagée;
- `organization_settings` présents (`fr-CA` / `CAD` / `America/Toronto`);
- `organization_id` UUID résolu par slug; clé métier tenant = `oliem_solution`;
- `company_context` / primary company cohérents (`oliem_solutions` default=true);
- aucun membership créé;
- aucun utilisateur Auth créé;
- aucun autre tenant modifié (`tagora-time-qa-v1` inchangé);
- aucun doublon;
- historique migration `20260809120000` non enregistré via `migration repair`
  (interdit dans les blocs d’application; données seed prouvées en DB).

## Convention officielle organization_id

- `trim()`;
- `lower()`;
- caractères autorisés : `a-z`, `0-9` et `_` pour la clé métier tenant (`tenantKey`);
- immuable après création;
- identifiant logique multi-tenant (`tenantKey=oliem_solution`);
- cohérent avec `company_context` et `primary_company`;
- le nom affiché de l’organisation ne doit jamais servir de clé métier;
- `organizations.id` reste l’UUID technique résolu via `slug=oliem-solution`.

## Sécurité et périmètre

Confirmé :

- aucune deuxième exécution du seed;
- aucune migration globale;
- aucun `db push`;
- aucun `migration repair`;
- aucun utilisateur Auth créé;
- aucun membership créé;
- aucun secret exposé;
- aucun changement Vercel;
- aucune production touchée;
- les trois stashes sont restés intacts;
- WIP commissions non touché.

## Nettoyage final

`supabase/.temp/cli-latest` a été restauré à la version suivie (`v2.90.0`) après
les opérations CLI. Le worktree était propre avant cette fermeture documentaire.

## Verdict

```text
PHASE_B_VERDICT=PASS
V1_TENANT_COMPANY_SCOPING_STATUS=CLOSED
REAL_V1_BLOCKER_COUNT=0
V1_FUNCTIONAL_PROGRESS=100%
FUNCTIONAL_DEVELOPMENT=100%
TECHNICAL_STABILIZATION=100%
```

Cette fermeture rend la V1 techniquement prête pour sa clôture globale, sans
autoriser automatiquement un déploiement production, une migration production
ou une mise en ligne.

## Prochaine étape

```text
NEXT_TAGORA_TIME_BLOCK=TAGORA-TIME-V1-FINAL-GLOBAL-CLOSURE-AND-RELEASE-READINESS-2026-08-09
```

Cette prochaine étape doit être un bloc séparé avec un nouveau GO Martin.
