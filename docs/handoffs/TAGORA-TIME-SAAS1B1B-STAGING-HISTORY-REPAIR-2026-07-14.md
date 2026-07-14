# TAGORA Time — SaaS 1B.1B staging history repair (2026-07-14)

**Agent :** Martin  
**Mandat :** SaaS 1B.1B-R9  
**Date :** 2026-07-14  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD WIP :** `21bcca8c4e86a77259f4008c26e8380518ea897c`  
**HEAD feature :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`  

**Staging :** `qokyobcvplzufshydhih`  
**Production (interdite) :** `qcgvzdlfsxybrmloijpt`  

**Décision :** GO HISTORY — H2/H3 NORMALISÉS, H4/H5 CONSERVÉS PENDING  

**Avancement V1 :** **51 %** (inchangé)

---

## Résumé

Repair **history-only** sur staging :

| Action | Quantité | Résultat |
|--------|----------|----------|
| H2 `--status applied` | **18 / 18** | OK |
| H3 `--status applied` | **2 / 2** (preuve A) | OK |
| Anciennes 8 chiffres `--status reverted` | **14 / 14** | OK |
| H4 marked applied | **0 / 6** | protégé |
| H5 marked applied | **0 / 24** | protégé |
| `db push` / `migration up` | **0** | non exécuté |
| Changement de schéma applicatif | **aucun** | prouvé |
| Donnée métier modifiée | **aucune** | prouvé (history only) |

Total commandes `migration repair` : **34**.

---

## Snapshots

| Snapshot | Chemin | SHA-256 |
|----------|--------|---------|
| Liste avant | `%TEMP%\tagora-time-r9-migration-list-before.txt` | `6EBA392D8DE9B431317E46D3AED3FDCF5CE8BB13DFE45914327678BE53735547` |
| CSV avant | `%TEMP%\tagora-time-r9-schema-migrations-before.csv` | `95E8561242DAC92041EBE61B28B0471F1F021E8AE80B9AE889EFB0B90E927D10` |
| Liste après | `%TEMP%\tagora-time-r9-migration-list-after.txt` | `6CA4BCC86F9A93FBACBF65ED5D71C3A5BB9883B8734F0507E4DD8C33D4851FDD` |
| CSV après | `%TEMP%\tagora-time-r9-schema-migrations-after.csv` | `02875F6AC344CE225C39163A6FC8D937C22925EC8066A9EE3BF81D50E448332E` |
| Journal | `%TEMP%\tagora-time-r9-repair-journal.txt` | (horodatages de chaque repair) |
| Fixtures portables (`src/app/lib/saas/fixtures/r9/`) | liste avant | `CD6A6354DB9BD83E09316C44053B224BC4C4E073D4A897C57A848D8A12F3B3F4` |
| Fixtures portables (`src/app/lib/saas/fixtures/r9/`) | liste après | `D2FF86EF8305736328396AA2DC7A2B8FC3F831269226408EF98F6F259D39CA3D` |
| Fixtures portables (`src/app/lib/saas/fixtures/r9/`) | CSV avant / après | `8AA2BA3831C1CD4C0E50707C7AAAF8564C7907F8485AC8B4D4BA84B4CA976507` / `7C8D7D0661A2127A31354385426CCBC57A09C8AB1AE7F948DD24DDC6A6620532` |

**Avant :** remote = 14 (8 chiffres) + 34 (H1) = 48 ; H2/H3/H4/H5 absents du remote.  
**Après :** remote = **54** (34 H1 + 18 H2 + 2 H3) ; **0** version 8 chiffres ; H4/H5 toujours local-only pending.

Hash document source R8 au moment du mandat :  
`3BFFEE72DB514F9E5EF7E382C724F429CDF98EE32C2047255CA928C08A9C14C2`

---

## H3 — preuve avant applied

| Version | Preuve | Détail |
|---------|--------|--------|
| `20260407000000` | **A COMPLÈTE** | 6 fonctions RBAC présentes (`current_app_role` RETURNS text, `is_admin_user` RETURNS boolean, …) |
| `20260409120000` | **A COMPLÈTE** | 23 tables bootstrap présentes dans dump staging ; 12 fonctions bootstrap présentes ; `public.test` non créé par bootstrap |

H3 laissées pending : **aucune**.

---

## H2 appliquées (18)

`20260410120000`, `20260412201500`, `20260412213000`, `20260416120000`, `20260416193500`, `20260425093500`, `20260425143000`, `20260426103500`, `20260426111500`, `20260428120000`, `20260428150000`, `20260428203500`, `20260428214500`, `20260428220500`, `20260428235500`, `20260429001500`, `20260429140000`, `20260513103000`

## H3 appliquées (2)

`20260407000000`, `20260409120000`

## Anciennes 8 chiffres retirées (14)

`20260408`, `20260410`, `20260411`, `20260412`, `20260416`, `20260418`, `20260419`, `20260420`, `20260421`, `20260425`, `20260426`, `20260428`, `20260429`, `20260513`

## H4 protégées pending (6)

`20260712220000`, `20260712220100`, `20260712220200`, `20260712220300`, `20260712220400`, `20260712220500` — tables SaaS absentes (`organizations` count = 0)

## H5 protégées pending (24)

`20260408190000`, `20260410130000`, `20260410140000`, `20260411101500`, `20260412103000`, `20260412161500`, `20260412170000`, `20260412181500`, `20260412191500`, `20260418140000`, `20260418141000`, `20260419103000`, `20260419141500`, `20260419164500`, `20260420110000`, `20260420111000`, `20260420112000`, `20260421113000`, `20260425090500`, `20260425133500`, `20260425140500`, `20260426120500`, `20260429120000`, `20260429130000`

---

## Preuve d’absence de modification de schéma

Lecture seule post-repair (`supabase db query --linked`) :

| Kind | n |
|------|---|
| tables | 59 |
| views | 4 |
| routines | 27 |
| policies | 80 |
| saas_orgs | 0 |
| rbac_current_app_role | 1 |

Aligné avec stats dump pré-repair (tables 59 / views 4 / functions 27 / policies 80).  
Seul changement autorisé : `supabase_migrations.schema_migrations` (history).

Aucun `db dump` après première écriture.

---

## Commandes exécutées (formes)

```text
npx supabase migration repair <H2> --status applied --linked --yes
npx supabase migration repair <H3> --status applied --linked --yes
npx supabase migration repair <OLD8> --status reverted --linked --yes
```

## Commandes non exécutées

- `db push`, `migration up/down`, `db reset`, `db pull`
- repair sur toute H4/H5
- SQL ALTER/CREATE/DROP métier
- commit / push / merge

---

## Plan de retour arrière (documenté, non exécuté)

Pour chaque H2/H3 appliquée :

```text
npx supabase migration repair <VERSION> --status reverted --linked
```

Pour chaque ancienne 8 chiffres retirée :

```text
npx supabase migration repair <VERSION_8> --status applied --linked
```

---

## Incidents

Aucun.

---

## Prochaine étape unique

**Mandat ultérieur de réconciliation H5** (empreintes partielles : GPS, vue terrain, Horodateur, tracking, …) — toujours sans push SaaS H4 tant que non autorisé séparément.
