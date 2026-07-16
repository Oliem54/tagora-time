# TAGORA Time — QA V1-B — Controlled staging QA tenant bootstrap (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Bureau  
**Branche :** `feature/sales-book-grants`  
**HEAD avant :** `7616705950a7a1649548023f38375aad9f0d1924`  
**Staging :** `qokyobcvplzufshydhih` (● linked)  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **77 % → 77 %** (infrastructure temporaire — pas une preuve fonctionnelle)

**Portée :** bootstrap scoped hors Git — organisation QA + settings + 3 memberships ; **aucune** donnée métier, invitation, Auth, Storage, migration versionnée, seed, ou code applicatif.

---

## 1. Contexte

| Contrôle | Résultat |
|----------|----------|
| Projet actif unique | TAGORA Time |
| Branche feature | `feature/sales-book-grants` |
| HEAD local = origin (avant) | oui — `7616705950a7a1649548023f38375aad9f0d1924` |
| Working tree avant | propre |
| Staging confirmé | `qokyobcvplzufshydhih` |
| Production ciblée | **non** |
| Méthode | Option A — script SQL temporaire dans `%TEMP%` via `npx supabase db query --linked -f` |
| `db push` / migration / seed | **non utilisés** |

---

## 2. Méthode scoped hors Git

Fichiers **uniquement** dans `%TEMP%` (jamais dans le dépôt) :

| Fichier | Rôle |
|---------|------|
| `tagora-time-qa-v1b-bootstrap-2026-07-16.sql` | Bootstrap transactionnel (single `DO`) |
| `tagora-time-qa-v1b-cleanup-2026-07-16.sql` | Cleanup préparé — **non exécuté** |
| `tagora-time-qa-v1b-identifiers-2026-07-16.txt` | Identifiants techniques locaux — **non imprimé / non joint** |
| `tagora-time-qa-v1b-bootstrap-proof-2026-07-16.txt` | Preuve agrégée |
| Snapshots `*-before.txt` / `*-after.txt` | Baseline et après |

### SHA-256 (scripts)

| Artefact | SHA-256 |
|----------|---------|
| bootstrap SQL | `2E75E4CDC451046239CB42AA7D721CCC442DF0B3ACD4EE408FCC7C30FF61E408` |
| cleanup SQL | `B1F11DD94B13899216811E9B1E1F42A00BCF7BE64935880A5E2EBDDD86A13126` |
| identifiers (contenu non documenté) | `732941FD7C37B28CD1D0B6D95191E809172CED3B997E79594D34606AE6F1195E` |

---

## 3. Tenant QA

| Champ | Valeur |
|-------|--------|
| Nom | TAGORA Time QA V1 |
| Slug | `tagora-time-qa-v1` |
| Statut | `active` |
| Données client réelles | **aucune** |
| `organization_company` | **différée** (runtime H5-F5 / org resolve n’exige pas cette ligne) |

### Memberships créés

| Compte anonymisé | Rôle H4 | `status` | `is_default` |
|------------------|---------|----------|--------------|
| QA-USER-1 | `organization_owner` | `active` | `true` |
| QA-USER-3 | `organization_admin` | `active` | `false` |
| QA-USER-4 | `direction` | `active` | `false` |

### Membership différé

| Compte | Rôle | Statut V1-B |
|--------|------|-------------|
| QA-USER-2 | `employe` (après test non-membre V1-C) | **aucun membership** |

Owner unique actif : **oui**.  
Invitations : **0**.  
`platform_access` / audit : **0**.  
Donnée métier / Storage : **0**.  
Utilisateur Auth créé ou modifié : **non**. Mot de passe modifié : **non**.

---

## 4. Nombres avant / après (agrégats)

| Table / objet | Avant | Après |
|---------------|-------|-------|
| organizations | 0 | **1** |
| organization_settings | 0 | **1** |
| organization_companies | 0 | **0** (différée) |
| organization_memberships | 0 | **3** |
| organization_invitations | 0 | 0 |
| platform_access | 0 | 0 |
| platform_access_audit | 0 | 0 |
| Auth users | 4 | 4 |
| Storage `photos-dossiers` | 0 | 0 |

H4 pending = **0** ; H5-F5 pending = **0** ; migration QA = **aucune**.

---

## 5. Preuve d’isolation

- Une seule organisation (`tagora-time-qa-v1`).
- Aucun membership vers une autre organisation.
- QA-USER-2 demeure non membre.
- Aucun rôle plateforme implicite.
- Auth et Storage inchangés.
- Production non touchée.

Validation locale (psql, transaction `ROLLBACK`) : owner-first, dernier owner, rôle/statut invalides, duplicate membership/slug, QA-USER-2 non membre, cleanup refuse tenant non QA, ordre de purge — **aucune persistance locale**.

Application staging : `npx supabase db query --linked -f "%TEMP%\tagora-time-qa-v1b-bootstrap-2026-07-16.sql"` — **succès** (single `DO`, rollback automatique si assertion échoue).

---

## 6. Cleanup (préparé, non exécuté)

- Script : `%TEMP%\tagora-time-qa-v1b-cleanup-2026-07-16.sql`
- Exécuté pendant V1-B : **non**
- Conditions : slug exact `tagora-time-qa-v1` ; refuse si objets Storage QA ou rôles inattendus ; ne touche jamais Auth / platform_access / autres orgs
- Ordre : invitations → memberships → settings → companies → organisation
- Note H4 : désactivation **brève et transactionnelle** du seul trigger `trg_organization_memberships_enforce_owner` pour permettre la purge du dernier owner (réactivation avant fin du `DO`)

---

## 7. Fichiers versionnés (seul diff Git autorisé)

1. `docs/handoffs/TAGORA-TIME-QA-V1B-TENANT-BOOTSTRAP-2026-07-16.md`
2. `src/app/lib/saas/qa-v1b-tenant-bootstrap.test.ts`

Interdit dans Git : scripts SQL, identifiants, migrations QA, code métier, secrets.

---

## 8. Verdict

**GO QA V1-B — TENANT QA CONTRÔLÉ CRÉÉ, ISOLÉ ET PRÊT POUR QA FONCTIONNELLE**

**Avancement V1 : 77 % → 77 %**

Prochaine étape unique : **QA V1-C** — tests fonctionnels multi-rôles (commencer par refus sans membership pour QA-USER-2) — **ne pas démarrer automatiquement**.

Ne pas créer le membership `employe` maintenant.  
Ne pas exécuter le cleanup.  
Ne toucher ni `main` ni production.
