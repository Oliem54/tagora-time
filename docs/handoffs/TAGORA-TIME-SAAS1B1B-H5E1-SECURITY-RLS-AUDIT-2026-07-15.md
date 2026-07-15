# TAGORA Time — SaaS 1B.1B H5-E1 audit sécurité / RLS / vues (2026-07-15)

**Agent :** Martin
**Agent donneur :** Martin
**Projet :** TAGORA Time uniquement
**Poste :** Maison
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`
**HEAD :** `f29dedbb1db38144ce2c45fe506c1f1c686d038a`
**Feature :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

**Staging (lecture seule) :** `qokyobcvplzufshydhih`
**Production :** **INTERDITE** — `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **51 %** (inchangé)

**Portée :** audit RO uniquement — **aucune** migration, policy, fonction, vue, GRANT modifiés.

**Verdict :** `H5-E1 TERMINÉ — AUDIT SÉCURITÉ/RLS DOCUMENTÉ, H5-E2 REQUIERT GO MARTIN`

---

## 1. Sources historiques

| Version | Fichier | Classement | Note |
|---------|---------|------------|------|
| `20260429120000` | `rls_account_requests_temps_titan.sql` | R2 | Helpers + AR/TT policies ; **pending** |
| `20260429130000` | `security_advisor_view_and_metadata_policies.sql` | R2 | Helpers + AR/TT + **vue terrain** ; **pending** ; **NE PAS REJOUER** |
| `20260418141000` | `horodateur_phase1_rls.sql` | H5-D hist. pending | Policies Phase1 employee_id + Direction terrain |
| `20260714160000` | H5-C | applied | Vue pre-H5-D ; skip local sans `user_id` |
| `20260715120000` | H5-D2 | applied | Vue canonique `auth_user_id` / `employee_id` |

**Conclusion vue :** `20260429130000` contient une définition Direction terrain **supersédée**. Tout rejeu historique risquerait de réécrire la vue hors contrat H5-D2.

---

## 2. Historique staging (RO)

| Lot | Statut |
|-----|--------|
| H5-A/B/C / H5-D2 | applied |
| `20260429120000` / `20260429130000` | **pending** |
| H5-D historiques (`18140000`…) | pending |
| H4 | pending = 6 |
| Repair H5-E1 | **aucun** |

---

## 3. Inventaire RLS (9 tables)

Toutes **existent**, **RLS enabled = true**, **FORCE RLS = false**, owner `postgres`.

| Table | # policies (staging) | Notes |
|-------|----------------------|-------|
| account_requests | 4 | Insert public borné + CRUD Direction/admin |
| temps_titan | 3 | S/I/U Direction/admin ; pas de DELETE |
| horodateur_events | 5 | `events_select` + **4 fail-open public** |
| horodateur_shifts | 1 | `shifts_select` (employé propre seulement) |
| horodateur_current_state | 1 | `state_select` |
| horodateur_exceptions | 1 | `exceptions_select` |
| gps_positions | 6 | own + Direction/employe+terrain |
| sorties_terrain | 1 | **`allow all` public true** |
| chauffeurs | 1 | **`allow all` public true** |
| **Total** | **24** | Toutes **PERMISSIVE** ; 0 restrictive |

### Fail-open / vrai (`USING true` / `WITH CHECK true`)

6 policies touchées (expressions `true`) :

| Policy | Table | Cmd | Roles | Classe |
|--------|-------|-----|-------|--------|
| `allow all ` | chauffeurs | ALL | public | **CRITIQUE** |
| `allow all ` | sorties_terrain | ALL | public | **CRITIQUE** |
| `horodateur_events_select` | horodateur_events | SELECT | public | **CRITIQUE** |
| `horodateur_events_insert` | horodateur_events | INSERT | public | **CRITIQUE** |
| `horodateur_events_update` | horodateur_events | UPDATE | public | **CRITIQUE** |
| `horodateur_events_delete` | horodateur_events | DELETE | public | **CRITIQUE** |

Ces policies **annulent** l’effet utile des policies plus strictes coexistantes (`events_select`, etc.) pour tout rôle couvert par `public`, car PERMISSIVE OR.

---

## 4. account_requests

| Policy | Cmd | Roles | Évaluation |
|--------|-----|-------|------------|
| `…_insert_pending_public` | INSERT | anon, authenticated | WITH CHECK : status pending ; assigned_* / review_* / invited_* / lock / last_error vides |
| `…_select/update/delete_direction_admin` | S/U/D | authenticated | `is_direction_or_admin()` |

**Insert public borné ?** Oui pour champs **d’assignation/revue**.

**Élévation possible ?** Partielle (pas de rôle assigné via INSERT) :
- `requested_role` / `requested_permissions` / `company` / `message` / `audit_log` **non** verrouillés par la policy → falsification de demande / framing société possible (**MOYEN**).
- Pas de SELECT/UPDATE/DELETE public observé (**OK**).
- Defaults : `assigned_permissions='{}'`, `audit_log='[]'` — check INSERT exige assigned_permissions null ou longueur 0 (array vide OK).

Aucune insertion de test staging.

---

## 5. temps_titan

| Politique | Résultat |
|-----------|----------|
| SELECT/INSERT/UPDATE | Direction/admin via helper |
| DELETE | Absente (volontaire) |
| Policy ALL / anon / public write | Non observée en RLS |
| Filtrage `company_context` | **Absent** — isolation compagnie **non garantie en base** |
| Dépendance H4 | **Oui** (tenant foundation non applied) |

Risque **ÉLEVÉ** : tout `direction`/`admin` global voit/écrit **tout** temps_titan (Oliem↔Titan) tant que H4/tenant non en place.

---

## 6. Horodateur — matrice d’accès *effective* (staging)

Policies Phase1 locale (`*_phase1` Direction+terrain) **non applied** (migration pending). Staging = select employé propre + **fail-open public sur events**.

| Table | Employé propre | Autre employé | Direction terrain | Admin | Anon | Service role |
|-------|----------------|---------------|-------------------|-------|------|--------------|
| horodateur_events | **dangereux** (ouvert public) | **dangereux** | **dangereux** | **dangereux** | **dangereux** | hors RLS / bypass |
| horodateur_shifts | autorisé (select) | refusé* | non prouvable** | non prouvable** | refusé* | hors RLS |
| horodateur_current_state | autorisé (select) | refusé* | non prouvable** | non prouvable** | refusé* | hors RLS |
| horodateur_exceptions | autorisé (select) | refusé* | non prouvable** | non prouvable** | refusé* | hors RLS |

\* sous réserve grants — anon a GRANT large, mais sans policy SELECT → refus RLS.
\*\* pas de policy Direction/terrain applied ; seuls helpers non utilisés ici.

**Dépendance `user_id` obligatoire ?** Non — policies strictes utilisent `employee_id` ↔ `chauffeurs.auth_user_id`. Aligné H5-D2.

---

## 7. Helpers (staging)

| Fonction | Security | search_path config | Source |
|----------|----------|--------------------|--------|
| `current_app_role()` | INVOKER | *(vide)* | `auth.jwt()->app_metadata->>'role'` |
| `is_direction_or_admin()` | INVOKER | vide | rôles `direction`/`admin` |
| `is_direction_user()` | INVOKER | vide | rôle `direction` |
| `has_app_permission(text)` | INVOKER | vide | rôle + `current_app_permissions()` |
| `current_app_permissions()` | INVOKER | vide | **coalesce(app_metadata, user_metadata, [])** (écart H5-E1 corrigé en H5-E2A) |

- **user_metadata :** `current_app_role` / `is_direction_*` / `has_app_permission` ne le lisent pas directement ; **`current_app_permissions` avait encore un fallback user_metadata** (confirmé staging) — **corrigé en H5-E2A**.
- **app_metadata :** oui (**OK** pour confiance JWT serveur).
- **SECURITY DEFINER :** aucun parmi ces helpers.
- **search_path dangereux :** config `proconfig` vide — **MOYEN** (**corrigé en H5-E2A** : `search_path=pg_catalog`).
- EXECUTE accordé à PUBLIC/anon/authenticated/service_role — **MOYEN** (**corrigé en H5-E2A** : PUBLIC/anon révoqués).

---

## 8. GRANT (extrait)

Pour les tables du périmètre : `anon` / `authenticated` / `service_role` disposent typiquement de **SELECT, INSERT, UPDATE, DELETE, TRUNCATE, …** (pattern large PostgREST).

**Effet réel = GRANT ∩ policy.**

| Cible | Lecture | |
|-------|---------|--|
| Grants anon trop larges | Oui | surtout avec fail-open HE/chauffeurs/sorties |
| Grants authenticated trop larges | Oui | idem |
| Grants public (EXECUTE helpers) | Oui | surface EXECUTE |

`service_role` : attendu côté serveur ; hors scope client JWT.

---

## 9. Vue `direction_terrain_positions`

| Contrôle | Staging |
|----------|---------|
| `security_invoker` | **true** |
| Colonnes | **18** |
| Branches | 4 (gps / départ / retour / horodateur) |
| `he.user_id` | **absent** |
| `auth_user_id` / `employee_id` | **présents** (H5-D2) |
| Owner | postgres |

Comparaison :

| Source | Verdict |
|--------|---------|
| Staging actuel | Contrat **H5-D2** |
| H5-C | Historique pré-transition (autre contrat) |
| `29130000` | Définition vue **dangereuse à rejouer** (peut remplacer H5-D2) |
| `29120000` | Pas de vue |

Comportement RLS sous-jacent : vue INVOKER ⇒ fuite via branches GPS/sorties/HE tant que tables sous-jacentes fail-open (**CRITIQUE** lié aux policies).

---

## 10. Multi-tenant (sans H4)

| Observation | |
|-------------|--|
| Filtrage `company_context` dans policies auditées | Quasi **absent** (temps_titan, AR, HE fail-open) |
| Rôle global seul | Dominant (`is_direction_or_admin`) |
| Fuite Oliem↔Titan | **Risque réel** pour temps_titan + tables fail-open |
| Protection code app seule | Insuffisante face RLS fail-open |
| Correctifs avant H4 | Possible : supprimer fail-open ; bornage AR ; Phase1 HE ; **sans** inventer orgs |
| Correctifs après H4 | Isolation company/tenant pour Direction |

---

## 11. Matrice historique / staging / cible

| Objet | 29120000 | 29130000 | Staging | Cible recommandée |
|-------|----------|----------|---------|-------------------|
| current_app_role | app_metadata | app_metadata | app_metadata INVOKER | + search_path set ; forward-only |
| is_direction_or_admin | oui | oui | oui | conserver app_metadata |
| AR policies | définies | redéfinies | proches 2912 | forward-only ; durcir INSERT |
| TT policies | définies | redéfinies | proches 2912 | forward-only ; tenant via H4 |
| direction_terrain_positions | — | **création vue** | **H5-D2** | **ne jamais rejouer 2913 vue** |
| HE policies Phase1 | — | — | partiel + **fail-open** | H5-E2C drop fail-open + Phase1 |
| GRANT | non traités | non | larges | revoir avec policies |
| FORCE RLS | non | non | false | documenter / décider Martin |
| Tenant | non | non | absent | **dépend H4** |

Classements : `29120000` = **nécessite forward-only** (pas rejeu aveugle).
`29130000` = **dangereux à rejouer** (vue) + forward-only partiel (helpers/policies seulement).

---

## 12. Risques classés

### CRITIQUE
1. `horodateur_events_*` public `true` (S/I/U/D).
2. `chauffeurs` / `sorties_terrain` `allow all` public.
3. Vue terrain `security_invoker` exposant données via tables fail-open.
4. GRANT anon large ∩ fail-open.

### ÉLEVÉ
1. Policies permissives redondantes qui neutalisent `events_select`.
2. temps_titan sans filtre compagnie.
3. Phase1 Direction+terrain non applied (trou fonctionnel Direction via RLS stricte).
4. Helpers sans `search_path` explicite.

### MOYEN
1. AR INSERT laisse `company` / `requested_*` / `audit_log` libres.
2. FORCE RLS = false partout.
3. EXECUTE helpers pour PUBLIC.
4. Duplication gps own vs policy terrain.

### FAIBLE
1. Noms `allow all ` (espace trailing).
2. Duplication cosmétique de helpers entre migrations pending.

---

## 13. Stratégie H5-E2

**Ne jamais rejouer** `29120000` / `29130000` tels quels.
**Forward-only** uniquement.

### H5-E2A — Helpers — **EXÉCUTÉ**
- Voir `TAGORA-TIME-SAAS1B1B-H5E2A-AUTH-HELPERS-HARDENING-2026-07-15.md`.
- Migration : `20260715130000_h5e2a_harden_authorization_helpers.sql`.
- Objets : cinq helpers ; app_metadata only ; INVOKER ; `search_path=pg_catalog` ; ACL authenticated/service_role.
- Risque : moyen. Rollback : restore snapshots TEMP.
- Dépendance H4 : non. Isolable : **oui**.

### H5-E2B — account_requests / temps_titan — **EXÉCUTÉ**
- Voir `TAGORA-TIME-SAAS1B1B-H5E2B-ACCOUNT-REQUESTS-TEMPS-TITAN-RLS-2026-07-15.md`.
- Migration : `20260715150000_h5e2b_harden_account_requests_temps_titan.sql`.
- INSERT public AR borné (pending only, champs privilégiés interdits, permissions/audit bornés) ; gestion Direction/Admin ; TT Admin ou Direction+terrain S/I/U ; pas DELETE authenticated.
- **Pas** d’isolation company tant que H4 absent (documenté).
- Risque : élevé (réduit). Isolable : oui. Dépend H4 pour tenant : partiel.

### H5-E2C — Horodateur / chauffeurs / sorties — **EXÉCUTÉ**
- Voir `TAGORA-TIME-SAAS1B1B-H5E2C-TERRAIN-RLS-CLOSURE-2026-07-15.md`.
- Migration : `20260715140000_h5e2c_close_terrain_fail_open_policies.sql`.
- DROP policies fail-open HE + `allow all ` ; SELECT Phase1+admin ; sorties CRUD sécurisé.
- Prérequis : H5-D2 / H5-E2A OK.
- Risque : **élevé / bloquant sécurité** (fermé). Isolable : oui.

### H5-E2D — Vue + grants vue — **EXÉCUTÉ**
- Voir `TAGORA-TIME-SAAS1B1B-H5E2D-DIRECTION-TERRAIN-VIEW-GRANTS-2026-07-15.md`.
- Migration : `20260715160000_h5e2d_harden_direction_terrain_view_grants.sql`.
- Contrat 18 colonnes H5-D2 validé ; **aucun** CREATE/DROP VIEW ; REVOKE PUBLIC/anon ; SELECT only authenticated + service_role.
- Isolable après E2B/E2C (sous-jacents + AR/TT durcis).

**Rejeu 29120000 recommandé ?** Non.
**Rejeu 29130000 recommandé ?** Non.
**Forward-only H5-E2 ?** Oui.

Décisions Martin éventuelles : ordre E2A→E2C prioritaire sécurité ; E2B ; FORCE RLS ; portée grants anon ; attendre H4 pour TT company.

---

## 14. Protections

| Domaine | Statut |
|---------|--------|
| H5-E2A | **Exécuté** (helpers) |
| H5-E2B | **Exécuté** (AR/TT policies) |
| H5-E2C | **Exécuté** (fail-open fermés) |
| H5-E2D | **Exécuté** (grants vue) |
| H5-F / H4 | Non touchés |
| Production | Interdite |
| H5-D2 vue | Préservée (définition) |
| V1 | 51 % |

---

## 15. Prochaine étape unique

**H5-F** (mandat Martin distinct) — après clôture H5-E.
Ne pas démarrer H4 ; ne pas intégrer feature ; ne pas toucher production.
