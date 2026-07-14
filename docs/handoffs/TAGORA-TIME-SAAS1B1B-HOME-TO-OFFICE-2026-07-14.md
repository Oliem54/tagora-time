# TAGORA Time — Handoff maison → bureau — SaaS 1B.1B (2026-07-14)

**Agent :** Martin  
**Poste source :** maison  
**Poste cible :** bureau  
**Projet :** TAGORA Time uniquement (`C:\dev\tagora-time`)

---

## Avertissement

# SAAS 1B.1 REPRODUCTIBLE LOCALEMENT (R7)  
# HISTORIQUE STAGING PARTIELLEMENT NORMALISÉ (R9)  
# 24 H5 + 6 H4 ENCORE PENDING  
# NE PAS MERGER VERS FEATURE  
# NE PAS EXÉCUTER H4/H5 SANS NOUVEAU GO MARTIN

**Avancement V1 TAGORA Time : 51 %**

---

## Identifiants Git (à confirmer après pull bureau)

| Élément | Valeur |
|---------|--------|
| Branche WIP | `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13` |
| HEAD WIP avant commit de fermeture | `21bcca8c4e86a77259f4008c26e8380518ea897c` |
| HEAD WIP final | _(remplacé par le SHA du commit `feat(saas): make tenant foundation reproducible`)_ |
| Feature protégée | `feature/sales-book-grants` |
| HEAD feature (inchangé) | `6fd6ca09078eedbd133e59aca160f606fa33040b` |
| Staging | `qokyobcvplzufshydhih` |
| Production (interdite) | `qcgvzdlfsxybrmloijpt` |

---

## Résumé R2 → R10

| Mandat | Résultat |
|--------|----------|
| R2 | Bootstrap historique + dump staging RO |
| R3 | Correction GPS `company_context` UPDATE |
| R4 | 42 renommages versions 14 chiffres |
| R5 | Vues direction terrain + timezone Toronto |
| R6 | Transition Horodateur / vue avant DROP `user_id` |
| R7 | Alignement `app_improvements` + rebuild local complet |
| R8 | Mapping staging 8→14 + classes H1–H6 |
| R9 | Repair history : 18 H2 + 2 H3 applied ; 14×8 reverted |
| R10 | Plan réconciliation 24 H5 + handoff + commit/push WIP |

### État staging (après R9, vérifié R10 RO)

| Classe | Nombre | État |
|--------|--------|------|
| H1 | 34 | applied |
| H2 | 18 | applied |
| H3 | 2 | applied |
| H4 SaaS | 6 | **pending** |
| H5 | 24 | **pending** |
| Versions 8 chiffres | 0 | retirées |

Schéma applicatif staging **non** modifié en R9/R10 (history-only en R9).

---

## Documents clés

1. `docs/handoffs/TAGORA-TIME-SAAS1B1B-LOCAL-VALIDATION-2026-07-13.md`
2. `docs/handoffs/TAGORA-TIME-SAAS1B1B-MIGRATION-VERSION-MAP-2026-07-13.md`
3. `docs/handoffs/TAGORA-TIME-SAAS1B1B-STAGING-HISTORY-MAP-2026-07-14.md`
4. `docs/handoffs/TAGORA-TIME-SAAS1B1B-STAGING-HISTORY-REPAIR-2026-07-14.md`
5. `docs/handoffs/TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md`
6. `docs/handoffs/TAGORA-TIME-SAAS1B1B-HOME-TO-OFFICE-2026-07-14.md` (ce fichier)
7. `scripts/saas1b1-local-verify.sql`
8. Tests `src/app/lib/saas/*.migrations.test.ts`

---

## Interdictions au bureau

- aucun merge vers `feature/sales-book-grants`
- aucun SaaS 1B.2
- aucun `db push` / `migration up` distant sans GO
- aucun repair hors mandat
- aucune exécution H4 ou H5 sans GO
- aucune production `qcgvzdlfsxybrmloijpt`
- aucun force push / reset --hard / clean destructif / stash

---

## Procédure exacte demain au bureau

```bat
cd C:\dev\tagora-time

git branch --show-current
git status -sb
git status --short -uall
git fetch --prune origin
git rev-parse HEAD
git rev-parse origin/wip/saas1b1-tenant-foundation-checkpoint-2026-07-13
git rev-parse feature/sales-book-grants
git rev-parse origin/feature/sales-book-grants
```

Si le working tree du bureau contient une modification ou un fichier non suivi inattendu :

**STOP.**  
Ne pas pull. Ne pas reset. Ne pas stash. Ne pas clean.

Si le working tree du bureau est propre :

```bat
git switch wip/saas1b1-tenant-foundation-checkpoint-2026-07-13
git pull --ff-only origin wip/saas1b1-tenant-foundation-checkpoint-2026-07-13

git status -sb
git status --short -uall
git rev-parse HEAD
git rev-parse origin/wip/saas1b1-tenant-foundation-checkpoint-2026-07-13
git rev-parse feature/sales-book-grants
git rev-parse origin/feature/sales-book-grants
```

Confirmer :

- HEAD bureau = origin WIP
- feature locale = origin feature
- working tree propre

Ensuite seulement :

```bat
docker version
wsl -l -v
npx supabase status
```

Si nécessaire :

```bat
npx supabase start
```

Puis, seulement après preuve que la cible est **locale** (`127.0.0.1`) :

```bat
npx supabase db reset --local
```

Aucun `--linked`.

Ne pas continuer le développement avant le verdict :

**READY — BUREAU ALIGNÉ SUR LE CHECKPOINT MAISON**

---

## Prochaine étape unique (après alignement bureau)

Ouvrir le plan H5 :

`docs/handoffs/TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md`

Puis obtenir un **GO Martin distinct** pour le premier lot H5-A (seulement).

---

## Fermeture maison

Après push réussi de la WIP :

- HEAD local = origin WIP
- feature intacte
- working tree propre
- dumps / logs hors Git
- maison peut fermer
