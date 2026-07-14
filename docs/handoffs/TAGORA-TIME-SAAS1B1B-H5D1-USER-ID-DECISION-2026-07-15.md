# TAGORA TIME — SaaS 1B.1B H5-D1 — Audit transition `horodateur_events.user_id`

**Décision finale (ce mandat) :**  
`H5-D1 TERMINÉ — AUDIT USER_ID DOCUMENTÉ, DÉCISION MARTIN REQUISE`

| Champ | Valeur |
|-------|--------|
| Agent exécutant | Martin |
| Agent donneur | Martin |
| Projet | TAGORA Time uniquement |
| Poste | Maison |
| Branche | `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13` |
| HEAD audit | `f9aa4346b79d38de58e0980d2ca109d25f7ab25a` |
| Feature protégée | `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b` |
| Staging (lecture seule) | `qokyobcvplzufshydhih` |
| Production | **INTERDITE** — `qcgvzdlfsxybrmloijpt` (jamais ciblée) |
| Avancement V1 | **51 %** (inchangé) |
| Portée | Audit lecture seule + documentation + test documentaire |
| Hors portée | H5-D2, DROP `user_id`, code applicatif, DDL/DML staging, H5-E/F, H4 |

---

## 1. Contexte H5-D (cinq migrations)

| Version | Fichier | Classement R10 | Rôle |
|---------|---------|----------------|------|
| `20260418140000` | `horodateur_phase1_schema.sql` | R5 | Ajoute `employee_id` / `actor_user_id`, backfill, recrée vue, **DROP `user_id`** |
| `20260418141000` | `horodateur_phase1_rls.sql` | R2 | Policies RLS sur `employee_id` ↔ `chauffeurs.auth_user_id` |
| `20260408190000` | `horodateur.sql` | R3 | Schéma / index legacy (`idx_horodateur_events_user_date`) |
| `20260420110000` | `horodateur_events_canonical_minimal.sql` | R3 | Colonnes canoniques + index legacy `user_id` |
| `20260420112000` | `horodateur_core_guardrails_minimal.sql` | R5 | Garde-fous index / tables satellites |

**Aucune migration SQL nouvelle créée dans H5-D1.**  
**Aucun DROP `user_id` exécuté.**

---

## 2. Sources analysées (lecture)

### Migrations H5-D
- `supabase/migrations/20260418140000_horodateur_phase1_schema.sql`
- `supabase/migrations/20260418141000_horodateur_phase1_rls.sql`
- `supabase/migrations/20260408190000_horodateur.sql`
- `supabase/migrations/20260420110000_horodateur_events_canonical_minimal.sql`
- `supabase/migrations/20260420112000_horodateur_core_guardrails_minimal.sql`

### Application / UI / diagnostic
- `src/app/lib/horodateur-v1/repository.ts`
- `src/app/lib/horodateur-v1/service.ts`
- `src/app/lib/horodateur-v1/types.ts`
- `src/app/direction/terrain/page.tsx`
- `scripts/diagnose-horodateur-employee.mjs`
- `supabase/migrations/20260714160000_h5c_reconcile_direction_terrain_view.sql` (contrat pré-transition)

---

## 3. Rôles techniques des trois colonnes

| Colonne | Rôle canonique recommandé | Preuve |
|---------|---------------------------|--------|
| `employee_id` | Identifiant métier de l’employé (`chauffeurs.id`) | FK staging → `chauffeurs.id` ; lectures primaires repository ; RLS `events_select` |
| `actor_user_id` | Utilisateur ayant effectué l’action | INSERT/UPDATE repository ; Phase1 schéma |
| `user_id` | Compatibilité legacy temporaire (auth user / vue terrain) | Présent staging NOT NULL ; vue Direction terrain ; dual-write insert ; fallback select |

---

## 4. Dépendances code (classées)

### 1 — Lecture canonique `employee_id`
- `repository.ts` `listEventsForEmployee` : `.eq("employee_id", …)` (chemin principal)
- `service.ts` / APIs Direction & Employé : projections, board, exceptions via `employee_id`
- `diagnose-horodateur-employee.mjs` : filtres `employee_id`

### 2 — Lecture fallback `user_id`
- `repository.ts` ~439–449 : si colonne `employee_id` absente → `.eq("user_id", authUserId)`

### 3 — Écriture `user_id`
- `repository.ts` `insertEvent` : `user_id: input.userId` dans payload (dual-write)
- Retry : suppression `user_id` du payload si colonne absente (~613–615)

### 4 — Écriture `employee_id`
- `insertEvent` : `employee_id: input.employeeId` (obligatoire métier)
- Retry si colonne absente (~608–610)

### 5 — Écriture `actor_user_id`
- `insertEvent` : `actor_user_id: input.actorUserId`
- `updateEventOccurredAt` : peut fixer `actor_user_id`

### 6 — Vue / UI
- `direction/terrain/page.tsx` : sélectionne `user_id` depuis **`direction_terrain_positions`** (colonne vue, pas table HE directe)
- H5-C / historique : branche horodateur de la vue = `he.user_id`

### 7 — RLS (migrations historiques)
- Phase1 RLS : politiques basées `employee_id`
- Staging actuel : policy `events_select` sur `employee_id` + policies legacy permissives `horodateur_events_*`

### 8 — Tests
- Types / operational-state / schedule-gate : `employee_id`
- Tests migrations Phase1 / H5-C : contrat `he.user_id` pré-transition

### 9 — Migrations historiques
- Phase1 : backfill puis **DROP `user_id`** (local déjà sans colonne ; staging encore avec)
- Canonical minimal : index `idx_horodateur_events_user_occurred_at_legacy`

### 10 — Script diagnostic
- `scripts/diagnose-horodateur-employee.mjs` : lit `employee_id` / `actor_user_id` ; pas de dépendance exclusive `user_id`

**Note :** `repository.ts` ~1431 `user_id` concerne `sms_alerts_log`, hors table `horodateur_events`.

---

## 5. Inventaire staging (lecture seule)

**Confirmé :** project linked = `qokyobcvplzufshydhih` (staging). Production `qcgvzdlfsxybrmloijpt` listée mais **non linked**.

### Colonnes inventoriées (`horodateur_events`)

| Colonne | Type | Nullable | Default (info_schema) |
|---------|------|----------|------------------------|
| `user_id` | uuid | **NO** | NULL |
| `employee_id` | bigint | **NO** | NULL |
| `actor_user_id` | uuid | YES | NULL |
| `actor_role` | enum | NO | `'employe'` |
| `source_kind` | enum | NO | `'employe'` |
| `status` | enum | NO | `'normal'` |
| `work_date` | date | YES | NULL |
| `week_start_date` | date | YES | NULL |
| `requires_approval` | boolean | NO | false |
| `exception_code` | enum | YES | NULL |
| `related_event_id` | uuid | YES | NULL |

### Autres objets
- **FK :** `horodateur_events_employee_id_fkey` → `chauffeurs(id)` ; **pas de FK** sur `user_id` ni `actor_user_id`
- **Index `user_id` :** `idx_horodateur_events_user_occurred_at_legacy` `(user_id, occurred_at DESC)`
- **Index `employee_id` :** plusieurs (`…_employee_occurred_at`, `…_work_date`, `…_pending`, `…_week_start`, …)
- **Triggers :** `trg_horodateur_events_recompute_current_state`, `trg_horodateur_events_recompute_shift` (fonctions de recomputation ; pas de dépendance DDL directe listée sur colonne `user_id`)
- **Vue dépendante :** `direction_terrain_positions` — branche horodateur filtre `he.user_id IS NOT NULL`
- **Policies :** `events_select` = `employee_id` ; `horodateur_events_select/insert/update/delete` = permissives historiques
- **RLS :** activé (policies ci-dessus)

---

## 6. Matrice agrégée staging (nombres uniquement)

Table **vide** au moment de l’audit (aucune donnée personnelle possible).

| Métrique | Valeur |
|----------|--------|
| Total `horodateur_events` | 0 |
| `user_id` non null | 0 |
| `employee_id` non null | 0 |
| `actor_user_id` non null | 0 |
| `user_id` null et `employee_id` non null | 0 |
| `user_id` non null et `employee_id` null | 0 |
| Les deux présents | 0 |
| Les trois présents | 0 |
| `user_id` ↔ `chauffeurs.auth_user_id` | 0 |
| `user_id` sans chauffeur | 0 |
| `employee_id` ↔ `chauffeurs.id` | 0 |
| `employee_id` orphelin | 0 |
| Conflits `user_id` / `employee_id` | 0 |
| `actor_user_id` = `user_id` | 0 |
| `actor_user_id` ≠ `user_id` | 0 |
| `work_date` null | 0 |
| `week_start_date` null | 0 |
| Échecs potentiels contraintes Phase1 (`employee_id` / `actor` null) | 0 / 0 |
| Lignes vue Direction terrain (agrégat HE vide) | 0 |
| Références croisées (non applicable — 0 lignes) | 0 |

**Limite :** table vide ⇒ preuves de données non conflictuelles **vacuous**.  
La **dépendance schéma** (vue, NOT NULL, dual-write, index) **bloque** quand même un DROP immédiat.

---

## 7. Matrice d’impact suppression `user_id`

| Objet | user_id | employee_id | actor_user_id | Impact suppression `user_id` |
|-------|---------|-------------|---------------|------------------------------|
| Colonne HE staging | Oui (NOT NULL) | Oui (NOT NULL) | Oui (nullable) | DDL + dual-write app cassés sans migration vue/app |
| Index legacy `…_user_occurred_at_legacy` | Oui | — | — | DROP index requis avec colonne |
| Index employee_* | — | Oui | — | Intact |
| Vue `direction_terrain_positions` | Oui (`he.user_id`) | Non (contrat H5-C) | Non | **Casserait** la branche horodateur tant que vue non migrée |
| Policy `events_select` | Non | Oui | Non | Intact |
| Policies legacy `USING (true)` | Indifférent | Indifférent | Indifférent | Intact (mais dette H5-E) |
| Triggers recompute | Indirect | Oui (état/shift) | Indirect | Intact si employee_id reste |
| `insertEvent` / fallback read | Oui | Oui | Oui | App encore dépendante dual-write + fallback |
| Page Direction terrain | Via vue | Via `chauffeur_id` vue | Non | Dépend encore du contrat `user_id` de la vue |
| Diagnostic script | Non exclusif | Oui | Lecture | Intact |

---

## 8. Options A / B / C

### OPTION A — Conserver `user_id` sans dépréciation formelle
- **Avantages :** zéro friction staging / app actuelle ; H5-C inchangé.
- **Risques :** dual-identité permanente (`user_id` vs `employee_id`) ; dette multi-tenant.
- **Dette :** index legacy + dual-write + confusion acteur vs employé.
- **Verdict :** acceptable court terme, **insuffisant** comme contrat durable.

### OPTION B — Déprécier sans supprimer (recommandé)
- `employee_id` canonique ; `actor_user_id` acteur ; `user_id` legacy temporaire.
- Continuer lectures fallback ; **ne pas** DROP ; **ne pas** fortifier NOT NULL nouveau.
- Mesurer periodiquement agrégats (surtout après données réelles).
- Suppression uniquement sous mandat **H5-D2** + GO Martin distinct.
- **Compatibilité :** maximale avec staging + H5-C + repository actuel.
- **Verdict :** **recommandation par défaut confirmée par l’audit.**

### OPTION C — Supprimer dans H5-D2 (futur uniquement)
Conditions minimales **non toutes remplies pour un GO immédiat** :
| Critère | Statut H5-D1 |
|---------|--------------|
| Zéro ligne `employee_id` non résolue | OK (0 lignes) mais vacuous |
| Zéro conflit user/employee | OK vacuous |
| Aucune route exclusive `user_id` | Presque — fallback + vue terrain restent |
| Aucun INSERT obligatoire `user_id` | **NON** — staging `user_id` NOT NULL + insert écrit `user_id` |
| Vue Direction compatible `employee_id` | **NON** — H5-C / staging utilisent `he.user_id` |
| RLS entièrement `employee_id` | Partiel (`events_select` OK ; legacy permissive hors scope) |
| Rollback documenté + tests + migration forward-only + GO Martin | **Pas démarré** (volontairement) |

Même si C devenait techniquement sûr plus tard : **ne pas supprimer dans H5-D1** ; ouvrir H5-D2 séparément.

---

## 9. Recommandation technique

**OPTION B — DÉPRÉCIER `user_id` SANS LE SUPPRIMER IMMÉDIATEMENT.**

Contrat recommandé :
1. `employee_id` = identifiant canonique employé  
2. `actor_user_id` = acteur de l’événement  
3. `user_id` = compatibilité legacy temporaire  
4. Nouvelles écritures : `employee_id` + `actor_user_id` obligatoires (déjà) ; `user_id` maintenu tant que consommateurs non migrés  
5. Suppression : **mandat H5-D2** distinct uniquement  

---

## 10. Critères GO H5-D2 (futurs — non demandés maintenant)

Avant tout DROP / migration destructive :
1. Agrégats staging (et prod après mandat) : 0 conflit, 0 orphelin `employee_id`, couverture `actor_user_id` définie  
2. Vue Direction terrain migrée vers join `employee_id` / `auth_user_id` **ou** équivalent validé  
3. App : fin du dual-write obligatoire `user_id` ; fallback documenté puis retiré  
4. Index legacy retiré avec la colonne  
5. Migration forward-only + tests + rollback documenté  
6. **GO Martin écrit** pour H5-D2 uniquement  
7. H5-E / H5-F / H4 toujours hors portée de D2 sauf mandat séparé  

---

## 11. Rollback futur (si H5-D2 DROP)

- Ne pas recréer `user_id` sans mandat restauration  
- Rollback préféré : `migration repair` history-only + restore snapshot DDL / backup  
- Ne jamais `TRUNCATE` ni `CASCADE` destructif hors procédure écrite  

---

## 12. Protections explicites

| Domaine | Statut H5-D1 |
|---------|--------------|
| H5-E / H5-F | Non démarrés |
| H4 SaaS | Non touché |
| Feature `sales-book-grants` | Intact |
| Staging écriture | Aucune |
| Production | Interdite |
| Secrets / PII dans ce doc | Absents |

---

## 13. Décision requise de Martin

Choisir formellement :
- **B (recommandé)** : déprécier, conserver colonne, planifier H5-D2 plus tard ;  
- **A** : conserver sans plan de dépréciation ;  
- **C différé** : autoriser préparation H5-D2 **sans exécution DROP** tant que critères section 10 non verts.

**Prochaine étape unique après validation Martin :**  
mandater **H5-D2 (plan/exécution contrôlée)** ou **suivre le lot H5 suivant autorisé** — **pas** de DROP auto, **pas** H5-E, **pas** H4.

---

*Document H5-D1 — 2026-07-15 — lecture seule — V1 51 %.*
