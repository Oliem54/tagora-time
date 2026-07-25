# TAGORA Time — opérations Supabase distantes

## Règles immuables

1. **Production** (`qcgvzdlfsxybrmloijpt`) contient **zéro** version dans `supabase_migrations.schema_migrations`.
2. Production **ne doit jamais** être liée par défaut.
3. **`db push` production est interdit** (politique P5).
4. **`migration repair` production est interdit** sans mandat spécialisé distinct.
5. **Aucune commande Supabase distante directe** (`supabase db push`, `supabase link`, etc.).
6. Toute opération **staging** doit passer par le garde `scripts/guard-supabase-remote.mjs`.
7. Le garde fonctionne en **dry-run par défaut** ; `--execute` uniquement après validations et mandat.
8. Une **confirmation textuelle exacte** est exigée pour `link-staging` et `db-push-staging`.
9. Toute écriture distante exige une **approbation Martin** et un **mandat distinct**.
10. Project ref staging officiel : `qokyobcvplzufshydhih`.
11. Project ref production explicitement interdit : `qcgvzdlfsxybrmloijpt`.
12. En cas de doute : **STOP** — ne pas lier, ne pas pousser, ne pas réparer.
13. Project ref inconnu : refus du garde (code 3) — ne pas forcer le lien.
14. `schema_migrations` vide : refus du garde (code 4) — ne jamais synchroniser à l’aveugle.
15. Les rapports et journaux ne doivent contenir **aucune clé, token, mot de passe, DATABASE_URL**.
16. Séparer strictement **local**, **staging** et **production**.

## Scripts npm protégés

| Script | Rôle |
|--------|------|
| `npm run db:check` | Contrôles locaux (`check-only`, dry-run) |
| `npm run db:link:staging` | Lien staging via garde (dry-run par défaut) |
| `npm run db:push:staging` | Push staging via garde (dry-run par défaut) |
| `npm run db:guard:test` | Tests unitaires du garde (mocks uniquement) |

Les anciens `npm run db:push` et `npm run db:link` **refusent** et redirigent vers ces scripts.

## Confirmations exactes

- Lien staging : `LINK-STAGING-qokyobcvplzufshydhih`
- Push staging : `STAGING-DB-PUSH-qokyobcvplzufshydhih`

Exemple dry-run :

```bash
npm run db:push:staging -- --confirm=STAGING-DB-PUSH-qokyobcvplzufshydhih
```

Exemple exécution réelle (uniquement après mandat explicite) :

```bash
npm run db:push:staging -- --confirm=STAGING-DB-PUSH-qokyobcvplzufshydhih --execute
```

## Procédure STOP

Si le garde refuse, ou si le project ref / l’historique / la branche est inattendu :

1. Arrêter immédiatement.
2. Ne pas relancer avec `--execute`.
3. Ne pas utiliser la CLI Supabase hors garde.
4. Escalader à Martin avec les métadonnées non sensibles du journal du garde.

## Hors périmètre de ce document

- Baseline historique et réconciliation `schema_migrations`
- Durcissement des policies production
- QA F4 / blocs Compensation 6A–6E
