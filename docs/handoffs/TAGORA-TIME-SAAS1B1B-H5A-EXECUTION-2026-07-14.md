# TAGORA Time — SaaS 1B.1B H5-A execution (2026-07-14)

**Agent :** Martin
**Poste :** Bureau
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`
**HEAD avant :** `1ead470cae00affd47b51ec1572de346958d86fc`
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

**Staging :** `qokyobcvplzufshydhih`
**Production (interdite) :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **51 %** (inchangé — lots H5/H4 non tous fermés)

---

## Contenu H5-A (plan R10)

| Versions historiques (restent pending) | Catégorie |
|----------------------------------------|-----------|
| `20260412170000` | R1 |
| `20260412181500` | R1 |
| `20260419103000` | R1 |
| `20260419141500` | R1 |
| `20260419164500` | R1 |
| `20260420111000` | R1 |

**Nouvelle migration forward-only :**
`supabase/migrations/20260714140000_h5a_reconcile_foundations_columns.sql`

**SHA-256 fichier :** `1AE4D4F2FAD61F3DDD3BF13779BF3B579A9A4DC1788384D88F44B555E2EBB8E5`

---

## Méthode

1. Tests documentaires R8/R9 rendus portables (fixtures `src/app/lib/saas/fixtures/r9/` + empreinte LF).
2. Inventaire staging RO → colonnes breaks/sorties/temps + indexes téléphone manquants ; vues billing absentes faute de `company_context` (H5-B).
3. `npx supabase db reset --local` → 85 migrations (H5-A incluse).
4. Staging : `db query --linked` du SQL forward-only **dans une transaction** + gates agrégées.
5. Historique : `migration repair 20260714140000 --status applied --linked` **uniquement**.
6. Anciennes H5-A **non** marquées applied. H4 **pending**. Autres H5 **pending**.

---

## Comptes agrégés staging

| Mesure | Avant | Après |
|--------|-------|-------|
| `sorties_terrain` break cols (14) | 0 | 14 |
| `temps_titan` break cols (15) | 0 | 15 |
| `phone_number` | 0 | 1 |
| alert config rows | 0 | 1 |
| H5-A indexes (8) | 6 | 8 |
| billing views | 0 | 0 (gardé : dépend H5-B) |
| `chauffeurs` rows | 2 | 2 |
| `temps_titan` rows | 0 | 0 |

Perte de données : **aucune**.

---

## Snapshots TEMP (hors Git)

| Fichier | SHA-256 |
|---------|---------|
| `%TEMP%\tagora-time-staging-schema-h5a-before-2026-07-14.sql` | `0395B82B2CF263E004BA21E501D712BC512EADADD149812F2E175A8D1BCD3269` |
| `%TEMP%\tagora-time-local-schema-h5a-before-2026-07-14.sql` | `DC952E904EEB75CC19B8F9C5CAEDB1887FEAAD6707F71E3F69C58FF516235064` |
| `%TEMP%\tagora-time-staging-schema-h5a-after-2026-07-14.sql` | `48632899BAAB38DA9A9FC340C4F7E42868CEAE685E05D5F5285174260AEB1507` |

---

## Rollback documenté

```text
npx supabase migration repair 20260714140000 --status reverted --linked
```

Ne retire pas automatiquement le DDL ; mandat inverse distinct requis pour DROP COLUMN (interdit hors GO).

---

## Protections

- H5-B…F : non touchés
- H4 SaaS : pending inchangé
- Production : non ciblée
- Pas de `db push` / `--include-all` / replay historique H5

---

## Décision

**GO H5-A — LOT FONDATIONS ET COLONNES DÉPLOYÉ ET VALIDÉ**

Prochaine étape unique : **GO Martin H5-B** (pas H4, pas feature, pas 1B.2).
