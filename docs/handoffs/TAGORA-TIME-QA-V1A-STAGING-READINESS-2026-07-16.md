# TAGORA Time — QA V1-A — Staging readiness & controlled QA tenant plan (2026-07-16)

**Agent exécutant :** Martin  
**Agent donneur :** Martin  
**Projet :** TAGORA Time (`C:\dev\tagora-time` / Oliem54/tagora-time)  
**Poste :** Bureau  
**Branche :** `feature/sales-book-grants`  
**HEAD :** `0a78c248b96e0c96c20d2dff6af3219d4702e2d9`  
**Checkpoint WIP :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13` @ même SHA  
**Staging :** `qokyobcvplzufshydhih` (● linked)  
**Production INTERDITE :** `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **77 % → 77 %** (préparation read-only uniquement)

**Portée :** lecture seule — **aucune** organisation, membership, invitation, Auth, Storage, migration, seed ou donnée métier créée.

---

## 1. Contexte Git

| Contrôle | Résultat |
|----------|----------|
| Feature active | oui |
| HEAD = origin feature | oui |
| WIP = origin WIP | oui |
| Quatre refs alignées | oui |
| Working tree | propre |
| Intégration H5-F6 | fast-forward (pas de merge commit) |
| WIP conservée | oui |

---

## 2. Migrations staging

| Version | Statut |
|---------|--------|
| `20260716220000` (H4-B1) | applied |
| `20260716221000` (H4-B2) | applied |
| `20260716222000` (H4-B3) | applied |
| `20260716223000` (H5-F5B) | applied |
| `20260425133500` | applied **history-only** (jamais rejouée) |
| H4 pending | **0** |
| H5-F5 pending | **0** |
| Migration QA | **aucune** |

---

## 3. État H4 / H5-F5 (agrégats)

### Tables H4

| Table | Lignes | RLS | FORCE RLS | Policies |
|-------|--------|-----|-----------|----------|
| organizations | **0** | oui | oui | **0** |
| organization_companies | **0** | oui | oui | **0** |
| organization_settings | **0** | oui | oui | **0** |
| organization_memberships | **0** | oui | oui | **0** |
| organization_invitations | **0** | oui | oui | **0** |
| platform_access | **0** | oui | oui | **0** |
| platform_access_audit | **0** | oui | oui | **0** |

Données SaaS inattendues / QA préexistantes : **aucune**.

Rôles membership exacts : `organization_owner` | `organization_admin` | `direction` | `employe`.  
Statuts membership : `active` | `suspended` | `invited`.  
Fonction `enforce_organization_has_owner` : **présente**.  
Accès plateforme : **0** ligne — aucun accès métier implicite.

### Storage H5-F5

| Contrôle | Résultat |
|----------|----------|
| Bucket `photos-dossiers` | présent, **privé** |
| `file_size_limit` | 15728640 (15 MiB) |
| Policies client photos-dossiers | **0** |
| Runtime Option A | routes serveur H5-F5A |

---

## 4. Inventaire Auth anonymisé (staging)

**Totaux :** Auth users = **4** (tous confirmés, aucun banni).  
**Applicatif :** `chauffeurs` = 2 ; `account_requests` = 2 (`active`).  
Aucun UUID / courriel / téléphone affiché.

| Compte anonymisé | Auth | Compte applicatif | Rôle JWT actuel | Actif | Utilisable QA |
|------------------|------|-------------------|-----------------|-------|---------------|
| QA-USER-1 | oui | non classifié ici | `admin` | oui | oui — candidat **organization_owner** (et JWT Admin) |
| QA-USER-2 | oui | non classifié ici | `none` | oui | oui — candidat **employe** membership / non-membre temporaire |
| QA-USER-3 | oui | non classifié ici | `direction` (+ permissions) | oui | oui — candidat **organization_admin** ou Direction |
| QA-USER-4 | oui | non classifié ici | `direction` | oui | oui — candidat membership **direction** |

### Affectation QA recommandée (sans créer de lien)

| Rôle QA cible | Compte | Notes |
|---------------|--------|-------|
| organization_owner | QA-USER-1 | JWT `admin` ≠ rôle H4 ; membership H4 = owner |
| organization_admin | QA-USER-3 | JWT `direction` + membership admin |
| direction | QA-USER-4 | JWT `direction` + membership direction |
| employe | QA-USER-2 | JWT sans rôle ; membership employe |
| non membre | **manquant** | 4 comptes seulement ; après bootstrap des 4 memberships, aucun non-membre restant |
| platform_support / platform_super_admin (négatif) | **absent** | `platform_access` = 0 |

**Comptes manquants pour couverture complète :**

1. Un 5ᵉ Auth staging **ou** séquence : tester non-membre **avant** d’attacher le 4ᵉ membership.  
2. Une ligne `platform_access` temporaire (support/super_admin) pour tests négatifs plateforme, puis suppression.

Ne pas réutiliser d’organisation réelle (aucune n’existe).

---

## 5. Contrat tenant QA (à créer en V1-B uniquement)

| Item | Valeur |
|------|--------|
| Nom logique | **TAGORA Time QA V1** |
| Slug | `tagora-time-qa-v1` (format `^[a-z0-9]+(?:-[a-z0-9]+)*$`) |
| Environnement | staging seulement |
| Identifiabilité | slug + `display_name` / `legal_name` contenant « QA V1 » |
| Données client réelles | **interdites** |
| Réversible | oui — plan de suppression ci-dessous |
| Isolé | une seule org QA ; pas d’accès plateforme implicite |

### Colonnes obligatoires (d’après migrations)

**organizations :** `slug`, `legal_name`, `display_name`, `status` (`active`), locale/currency/timezone (defaults OK).  
**organization_companies :** `organization_id`, `legal_name`, `display_name`, `company_code` (ex. `qa_v1`), `status=active`, **un** `is_default=true`.  
**organization_settings :** `organization_id` (+ defaults locale/currency/timezone).  
**organization_memberships :** `organization_id`, `user_id`, `role`, `status=active`, **un seul** `is_default=true` par user (owner: `is_default=true`).

### Ordre de création

1. `organizations` (`status=active`)  
2. `organization_settings`  
3. `organization_companies` (`is_default=true`)  
4. Membership **organization_owner** actif (premier owner)  
5. Memberships `organization_admin`, `direction`, `employe` (actifs)  
6. Optionnel : `platform_access` temporaire pour test négatif  
7. **Aucune** donnée métier / Storage avant QA V1-C  

### Ordre de suppression (rollback)

1. Objets Storage QA éventuels (si créés en V1-C)  
2. Données métier QA éventuelles  
3. `platform_access` / audit QA si créés  
4. `organization_invitations` (si créées)  
5. `organization_memberships` (tous)  
6. `organization_companies`  
7. `organization_settings`  
8. `organizations`  
9. Auth users **créés uniquement pour QA** (pas les 4 comptes staging existants)

### `is_default` / owner

- Un seul membership `is_default=true` par utilisateur.  
- Owner initial : QA-USER-1, `status=active`.  
- Ne jamais suspendre/supprimer le dernier owner actif (`enforce_organization_has_owner`).

---

## 6. Matrice QA multi-rôles (post-bootstrap)

Légende preuve : capture écran / log HTTP status / agrégat SQL — **sans** PII ni URL signée complète.

### Authentification

| Compte | Précondition | Action | Attendu | Preuve | Donnée temp. | Nettoyage |
|--------|--------------|--------|---------|--------|--------------|-----------|
| — | — | Route protégée sans session | 401/redirect login | status | non | — |
| QA-USER-* | session | Connexion / déconnexion | OK | UI | non | session |
| QA-USER-* | session | Session expirée | refus | status | non | — |
| (inactif) | membership suspended | Accès Storage/API | 403 | status | membership | revert status |

### Organisation

| Compte | Précondition | Action | Attendu | Preuve | Nettoyage |
|--------|--------------|--------|---------|--------|-----------|
| Employé | membership actif | resolve org active | org QA | agrégat | — |
| Non membre | auth sans membership | Storage/API métier | 403 | status | — |
| Tout | path autre org | lecture/suppression | 403 | status | — |
| — | org inconnue | resolve | refus | status | — |

*(Changement d’organisation : **non disponible** dans le runtime actuel — une org QA seule.)*

### Utilisateurs

| Compte | Action | Attendu | Note |
|--------|--------|---------|------|
| Owner/Admin | lecture comptes selon UI existante | selon permissions JWT actuelles | H4 n’expose pas encore UI tenant admin complète |
| — | protection dernier owner | contrainte SQL | tester en V1-B/C via tentative refusée |
| Compte maître | si contrat UI | protégé | documenter si UI absente |

### Horodateur / Livraisons / Terrain

| Rôle | Lecture | Écriture | Non membre | Inter-tenant |
|------|---------|----------|------------|--------------|
| Employé | selon JWT permissions | selon permissions | 403 | 403 |
| Direction | oui si permission | oui si permission | 403 | 403 |
| Admin JWT | large surface app | large | 403 sans membership Storage | 403 path |
| Owner/Admin org | membership + permission | idem | — | 403 |

### Documents / Storage

| Parcours | Attendu |
|----------|---------|
| Upload serveur | POST `/api/operation-proofs/upload` après membership |
| Signed URL | durée ≤ 300 s ; pas de journal URL complète |
| Suppression | route serveur + permission |
| 15 MiB / MIME | refus hors contrat |
| Chemin | `<organization_id>/<domain>/<record_id>/…` |
| Public / upload navigateur direct | **interdit** |

### Compensation

| Rôle | Attendu |
|------|---------|
| Admin/Direction (finance) | accès selon helpers existants |
| Employé | pas de données rémunération hors rôle |
| Isolation org | pas de fuite cross-tenant (quand données liées org) |

### Plateforme

| Rôle | Attendu |
|------|---------|
| platform_support sans membership | **aucun** accès métier Storage/API org |
| platform_super_admin sans membership | **aucun** accès métier implicite |
| Audit | append-only si écriture audit en V1-B test |

---

## 7. Plan bootstrap QA V1-B (ne pas exécuter)

### Options

| Option | Description | Évaluation |
|--------|-------------|------------|
| **A** | Script SQL temporaire **hors Git**, `db query --linked -f`, transaction scoped | **recommandée** |
| **B** | Route/outil Admin existant | **indisponible** — aucune UI/API création org/membership trouvée |
| **C** | Migration versionnée de données QA | **rejetée** — données temporaires ne doivent pas polluer l’historique migrations |

### Option recommandée : **A**

**Justification :** H4 fail-closed (service_role seulement) ; pas d’Admin UI tenant ; données QA réversibles ; pas de migration de seed.

### Garde-fous V1-B

- Staging `qokyobcvplzufshydhih` uniquement.  
- Journal agrégats avant/après (counts).  
- Mapping comptes → rôles dans fichier **TEMP hors Git** (pas de push d’UUID).  
- Ordre création / suppression ci-dessus.  
- STOP si H4 counts ≠ 0 inattendus hors tenant QA.  
- Aucune production ; aucun `db push` ; aucune donnée métier avant V1-C.

---

## 8. Risques et STOP

| Risque | Mitigation |
|--------|------------|
| Seulement 4 Auth users | Tester non-membre avant 4ᵉ membership ou créer 5ᵉ Auth QA en V1-B |
| Pas de `employe` JWT | Membership H4 `employe` sur QA-USER-2 ; permissions JWT à ajuster seulement sous mandat |
| Pas de platform_access | Créer/révoquer temporairement en V1-B pour négatifs |
| Confusion JWT role vs membership H4 | Documenter dans chaque cas de test |
| Fuite PII dans rapports | Agrégats / QA-USER-N uniquement |

**STOP si :** production ciblée ; working tree sale ; données H4 non vides non classifiées ; secrets dans Git.

---

## 9. Confirmations de non-écriture

| Action | Statut |
|--------|--------|
| Organisation créée | **non** |
| Membership créé | **non** |
| Invitation créée | **non** |
| Utilisateur créé | **non** |
| Objet Storage | **non** |
| Migration / SQL appliqué | **non** |
| Production | **non** |

---

## 10. Verdict

**READY QA V1-A — STAGING ET TENANT QA PLANIFIÉS, BOOTSTRAP CONTRÔLÉ AUTORISABLE**

Prochaine étape unique : **QA V1-B** — bootstrap tenant QA contrôlé (Option A, hors Git) — **ne pas démarrer automatiquement**.
