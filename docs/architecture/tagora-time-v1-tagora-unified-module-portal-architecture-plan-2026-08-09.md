# TAGORA — Plan d’architecture du portail unifié des modules

## Identification des agents

- Projet d’exécution Git : TAGORA Time uniquement
- Date : 2026-08-09
- Agent donneur : Martin
- Agent exécutant : Agent Cursor TAGORA Time uniquement
- Branche : main
- Commit de départ : 26231cf0a96803485b2ed574dc6e474014c31fcf
- Nature : plan d’architecture uniquement — aucune implémentation
- Production : non touchée
- Autres dépôts (Mail IA, Stock Premium, Pulse AI) : non touchés

## État officiel de TAGORA Time V1

```text
V1_GLOBAL_CLOSURE_STATUS=CLOSED
V1_FUNCTIONAL_PROGRESS=100%
FUNCTIONAL_DEVELOPMENT=100%
TECHNICAL_STABILIZATION=100%
REAL_V1_BLOCKER_COUNT=0
```

TAGORA Time V1 demeure à **100 %**. Ce chantier est **distinct** et post-V1.

## Statut du portail unifié

```text
UNIFIED_PORTAL_PROGRESS=0%
UNIFIED_PORTAL_ARCHITECTURE_PROGRESS=100%   # ce document (plan seulement)
UNIFIED_PORTAL_IMPLEMENTATION_PROGRESS=0%
UNIFIED_PORTAL_IMPLEMENTATION_STARTED=false
UNIFIED_PORTAL_PRODUCTION_AUTHORIZED=false
```

## Objectif

Définir une entrée centrale de l’écosystème TAGORA permettant :

1. une connexion TAGORA unique;
2. une page « Mon espace TAGORA »;
3. l’affichage des modules autorisés;
4. une navigation cohérente entre modules;
5. une gestion centralisée des organisations, utilisateurs, rôles et abonnements;
6. une séparation stricte des données de chaque module;
7. une base SaaS multi-tenant commercialisable;
8. une intégration progressive sans casser les applications existantes.

**Principe central :** regrouper les accès ≠ fusionner les applications ni les données.
Le portail est une porte d’entrée et une couche d’identité commune.

## Portée

- Architecture cible du portail unifié.
- Audit en lecture seule de TAGORA Time.
- Stratégie d’intégration progressive par phases.
- Décisions à valider par Martin.
- Un seul document d’architecture.

## Hors portée

- Toute implémentation (code, routes, composants, auth, UI).
- Toute migration, seed, SQL, connexion DB.
- Tout déploiement, DNS, Vercel, Supabase.
- Toute lecture ou affichage de secret.
- Toute modification des dépôts Mail IA, Stock Premium ou Pulse AI.
- Tout choix définitif de fournisseur de paiement.
- Toute action de production TAGORA Time.

## Audit de l’existant TAGORA Time

Audit local en lecture seule (dépôt `tagora-time` / worktree contrôlé). Aucun secret lu.

### Page d’entrée actuelle

| Élément | État actuel |
|---|---|
| Racine `/` | Page marketing (`src/app/page.tsx`) |
| Choix portail | `/connexion` : « Je suis un employé » → `/employe/login` ; « Je suis la direction » → `/direction/login` |
| Redirections | `/employe` → login employé ; `/direction` → login direction |

### Authentification

| Élément | État actuel |
|---|---|
| Fournisseur | Supabase Auth (mot de passe) |
| Routes login | `/employe/login`, `/direction/login` |
| MFA | Setup/verify sous `/auth/mfa/*` (surtout direction/admin) |
| Mot de passe | Réinitialisation / nouveau mot de passe |
| SSO / OIDC / SAML | Absent |
| Sélection manuelle du rôle | Oui — l’utilisateur choisit employé vs direction avant connexion |

### Rôles et permissions

| Élément | État actuel |
|---|---|
| `AppRole` legacy | `employe` \| `direction` \| `admin` (`src/app/lib/auth/roles.ts`) |
| Permissions modules Time | documents, dossiers, terrain, livraisons, ressources, commissions, admin_finance |
| Source d’autorisation zone | Membership H4 (`organization_memberships`) mappée vers `AppRole` |
| JWT metadata | Encore utilisé pour certaines permissions / finance — dualité à résorber |

### Tenant / organisation / company

| Élément | État actuel |
|---|---|
| Tables H4 | `organizations`, `organization_companies`, `organization_settings`, `organization_memberships`, `organization_invitations`, `platform_access`, `platform_access_audit` |
| Helpers | `tenant-foundation.shared.ts`, `oliem-tenant.shared.ts`, membership server/shared |
| V1 Oliem | `tenantKey=oliem_solution`, `slug=oliem-solution`, companies `oliem_solutions` / `titan_produits_industriels` |
| Convention | `tenantKey` ≠ `organizationId` (UUID) ≠ `companyCode` |
| Org active | Résolue serveur : memberships actives → `is_default` → sinon unique → sinon ambiguë (échec strict) |
| Org switcher UI | Absent |

### Protections et session

| Élément | État actuel |
|---|---|
| Middleware | Headers + MFA AAL2 sur `/api/*` — **pas** un routeur d’auth complet |
| Garde UI principale | `AuthGate` / `AccountAuthGate` + `/api/auth/session-context` |
| Session | Supabase session + cookie applicatif `tagora_app_session` |
| Shell réutilisable | `HeaderTagora`, `AuthenticatedPageHeader`, `MarketingShell`, layouts par zone |

### Limites actuelles pour une connexion commune

1. Deux portails login distincts (employé / direction).
2. Pas de SSO ni d’identité multi-modules.
3. Tenant V1 centré Oliem ; pas encore un portail IdP multi-produit.
4. Pas de sélecteur d’organisation.
5. AuthGate surtout côté client ; middleware non exhaustif pour les pages.
6. Dualité JWT vs memberships.
7. Company (JWT) vs organization (H4) encore partiellement séparés.
8. Aucun catalogue de modules externes.

### Éléments conservables sans refonte complète

- Clients Supabase Auth + flux MFA / reset.
- Pattern `session-context` + memberships H4.
- Catalogue de permissions Time et mapping de rôles.
- Shell UI (`HeaderTagora`, navigation, marketing).
- Fondations SaaS H4 (tables, helpers, conventions).
- Cookie / `useCurrentAccess` comme pont de migration.

```text
EXISTING_ENTRY_PAGE_STATUS=AUDITED
EXISTING_AUTH_ARCHITECTURE_STATUS=AUDITED
EXISTING_ROLE_MODEL_STATUS=AUDITED
EXISTING_TENANT_MODEL_STATUS=AUDITED
EXISTING_ROUTE_GUARDS_STATUS=AUDITED
EXISTING_SESSION_MODEL_STATUS=AUDITED
LOCAL_AUDIT_COMPLETED=true
```

## Principes d’architecture

1. **Porte d’entrée, pas monolithe** — le portail orchestre l’accès ; les modules restent autonomes.
2. **Identité commune, données séparées** — un utilisateur TAGORA ; des bases / périmètres module distincts.
3. **Autorisation serveur obligatoire** — la carte UI n’est jamais la seule barrière.
4. **Multi-tenant strict** — isolation par organisation ; aucun paramètre navigateur comme source de vérité.
5. **Progressivité** — intégration module par module sous GO Martin distinct.
6. **Échec fermé** — ambiguïté org, abonnement expiré, module suspendu → refus.
7. **Moindre privilège** — droits internes Oliem ≠ droits clients SaaS.
8. **Staging ≠ production** — secrets, projets et domaines séparés.
9. **V1 Time intact** — aucune régression du produit fermé à 100 %.
10. **Aucune production sans GO** — ce plan n’autorise aucun déploiement.

## Architecture cible

```text
                    [ app.tagora.ca  — Portail ]
                              |
              Identité commune + session centrale
                              |
              Calcul serveur des entitlements
                              |
        +----------+----------+----------+----------+
        |          |          |          |          |
     Time      Mail IA     Stock     Pulse AI   Admin
   (app/DB)   (app/DB)   Premium    (app/DB)   TAGORA
                          (app/DB)
```

Couches :

| Couche | Responsabilité |
|---|---|
| Domaine / DNS | Entrée publique du portail (à confirmer) |
| Portail | Login unique, Mon espace, catalogue, navigation |
| Identité | Utilisateur global, session, MFA, audit connexions |
| Organisation | Multi-tenant, memberships, org active |
| Entitlements | Module × plan × org × utilisateur |
| Modules | Apps séparées, règles métier propres, validation d’accès locale |
| Administration | Console centrale contrôlée |
| Observabilité | Audit, journaux admin, métriques d’accès |

## Domaine central recommandé

| Attribut | Valeur |
|---|---|
| Domaine recommandé | `app.tagora.ca` |
| Statut | **Recommandé uniquement** |
| Réservé / configuré dans ce bloc | **Non** |
| Confirmation Martin | **Requise séparément** |
| Modification DNS dans ce bloc | **Interdite** |

Sous-domaines futurs possibles (non décidés) : `time.*`, `mail.*`, `stock.*`, `pulse.*`, `admin.*` — ou chemins / reverse-proxy selon décision Martin.

## Identité et connexion unique

### Cible

- Identifiant utilisateur global TAGORA (UUID identité centrale).
- Connexion unique (plus de choix manuel employé/direction avant login).
- Session centrale sécurisée.
- MFA configurable (obligatoire selon rôle / politique org).
- Récupération de compte.
- Révocation de session (utilisateur, org, globale).
- Audit des connexions.
- SSO entreprise futur (OIDC/SAML) — optionnel, non choisi ici.
- **Absence de sélection manuelle du rôle après connexion** — le rôle découle des memberships + entitlements.

### Stratégie de transition depuis Time

| Étape | Approche |
|---|---|
| Court terme | Portail central délègue encore à Supabase Auth (ou IdP choisi) |
| Moyen terme | Claims minimaux : `user_id`, `organization_id`, `module_entitlements` |
| Time | Conserve validation locale ; mappe les claims vers `AppRole` / permissions existantes |
| Fin | JWT metadata Time devient dérivé, pas source de vérité |

Décision IdP central (Supabase Auth unifié vs autre) = **GO Martin** (section décisions).

## Organisations et isolation multi-tenant

### Convention officielle `organization_id` logique (clé métier)

Quand une clé métier stable est utilisée (ex. `tenantKey`) :

- `trim()`;
- `lower()`;
- caractères autorisés : `a-z`, `0-9`, `_` uniquement;
- immuable après création;
- jamais dérivée du seul nom affiché;
- cohérente avec `company_context` / `primary_company` du module concerné.

L’identifiant technique DB reste un UUID (`organizations.id`). Ne jamais confondre :

| Concept | Exemple Time V1 | Rôle |
|---|---|---|
| tenantKey / clé métier | `oliem_solution` | Identifiant logique normalisé |
| organizationSlug | `oliem-solution` | Slug DB organisation |
| organizationId | UUID | Clé technique |
| companyCode | `oliem_solutions` | Compagnie opérante (≠ tenant) |

### Règles

- Séparation stricte par organisation.
- Une personne peut appartenir à plusieurs organisations.
- Sélection d’organisation uniquement si nécessaire (sinon org unique / défaut).
- Organisation active contrôlée côté serveur.
- Aucune confiance aux seuls query params / localStorage.
- Permissions vérifiées serveur dans le portail **et** dans chaque module.
- Isolation complète entre clients SaaS.
- Accès support / multi-org Martin : explicite, audité, non automatique pour tous les admins.

## Catalogue des modules

Chaque module expose au minimum :

| Attribut | Description |
|---|---|
| `module_id` | Identifiant stable (`tagora_time`, `tagora_mail_ia`, …) |
| `name` / `description` | Affichage |
| `icon` | Identité visuelle |
| `destination_url` | URL du module (sous-domaine ou chemin) |
| `status` | `available` \| `maintenance` \| `coming_soon` \| `suspended` |
| `owner_scope` | Organisation propriétaire ou disponibilité globale plateforme |
| `environment` | local / staging / production |
| `required_plan` | Forfait minimal |
| `required_permissions` | Permissions portail / module |
| `display_order` | Ordre des cartes |
| `enabled` | Activation org |

Modules prévus au catalogue :

1. TAGORA Time  
2. TAGORA Mail IA  
3. TAGORA Stock Premium  
4. TAGORA Pulse AI  
5. Administration TAGORA  
6. Futurs modules TAGORA  

La carte absente ou grisée n’est **pas** une autorisation. L’URL directe doit être refusée par le module.

## Rôles, permissions et entitlements

Autorisation calculée serveur selon :

utilisateur × organisation × rôle × permissions × module × abonnement × forfait × environnement × état compte × état organisation × état module.

Couches distinctes :

| Couche | Exemple |
|---|---|
| Platform | Accès interne Oliem / support |
| Organization role | owner, admin, direction, employé (aligné H4 Time) |
| Module permission | droits métier du module |
| Entitlement | module inclus dans le plan / abonnement actif |

Règle : **même libellé de rôle entre modules ≠ mêmes droits**. Chaque module conserve son dictionnaire ; le portail ne traduit que des claims stables.

## Abonnements SaaS

Prévoir (conception seulement) :

- plans et modules inclus;
- limites / quotas par forfait;
- période d’essai;
- activation, suspension, annulation;
- facturation récurrente future;
- marque blanche future;
- licences par utilisateur ou par organisation;
- droits internes Oliem distincts des clients SaaS.

**Aucun système de paiement choisi ou intégré dans ce bloc.**

## Navigation et expérience utilisateur

### Parcours cible

1. Ouverture de `app.tagora.ca` (recommandé, non configuré).
2. Connexion unique.
3. Résolution de l’utilisateur.
4. Sélection automatique ou contrôlée de l’organisation.
5. Calcul serveur des modules autorisés.
6. Affichage de « Mon espace TAGORA ».
7. Lancement d’un module.
8. Revalidation d’accès par le module.
9. Retour au portail (lien / shell commun).
10. Déconnexion globale (stratégie à valider) ou locale module.

### Shell commun

- Cartes des modules autorisés.
- Menu utilisateur : profil, sécurité, organisation active, administration (si droit), déconnexion.
- Comportement mobile.
- États : vide, module indisponible, accès refusé, abonnement requis, maintenance.

### Profils exemples

| Profil | Comportement attendu |
|---|---|
| Employé Time seul | Une carte Time ; pas d’admin |
| Gestionnaire Time + Mail IA | Deux cartes ; rôles distincts par module |
| Vendeur Time + Stock | Cartes Time + Stock ; permissions stock locales |
| Gestionnaire agents Pulse | Carte Pulse (+ autres si entitlements) |
| Martin multi-org | Sélecteur org ; modules selon org active ; audit |
| Client SaaS limité | Modules du plan uniquement |
| Utilisateur suspendu | Refus login / espace vide contrôlé |
| Organisation suspendue | Refus modules ; message clair |
| Abonnement expiré | Accès refusé ou lecture restreinte selon politique |

## Séparation technique des modules

Chaque module conserve :

- dépôt ou application;
- routes;
- base / périmètre de données;
- règles métier;
- autorisations propres;
- cycle de déploiement;
- garde-fous de sécurité.

**Aucune fusion immédiate des bases. Aucune réécriture complète des modules.**

## Sécurité

- Validation serveur des autorisations (portail + module).
- Tokens courts ; cookies HttpOnly lorsque pertinent.
- Protection CSRF.
- Rotation et révocation de sessions.
- MFA selon politique.
- Rate limiting login / APIs sensibles.
- Séparation staging / production et secrets par environnement.
- Aucune transmission de secret par URL.
- Aucune confiance aveugle inter-modules (chaque module revalide).
- Moindre privilège.
- Accès production restreint.
- Journalisation des actions administratives.
- Révocation immédiate d’un module ou d’un utilisateur.

## Administration centrale

Console future (non implémentée) :

- organisations, utilisateurs, memberships;
- rôles, permissions, modules;
- abonnements, plans, quotas;
- invitations, activation / suspension;
- audit;
- accès support contrôlé;
- multi-organisations pour Martin;
- **aucun** accès automatique de tous les administrateurs à toutes les données.

## Modèle conceptuel

Sans SQL exécutable. Entités minimales :

| Entité | Objectif | Identifiants | Relations | Portée | Sensible | Isolation |
|---|---|---|---|---|---|---|
| identities / users | Identité globale | `user_id` | → memberships, sessions | Centrale | email, auth | Global user, données métier filtrées par org |
| organizations | Tenant commercial | UUID + clé métier | → memberships, modules, subs | Centrale | facturation | Racine tenant |
| organization_memberships | Appartenance | `(org_id, user_id)` | rôle, statut, défaut | Centrale | rôle | Par org |
| roles | Rôles portail / org | `role_id` | → role_permissions | Centrale | — | Catalogue + scope |
| permissions | Capacités atomiques | `permission_key` | ← role_permissions | Centrale / module | — | Namespaced par module |
| role_permissions | Liaison | — | rôle ↔ permission | Centrale | — | — |
| modules | Catalogue | `module_id` | → org_modules, plan_modules | Centrale | URLs | — |
| organization_modules | Activation org | `(org_id, module_id)` | statut | Centrale | — | Par org |
| plans | Forfaits | `plan_id` | → plan_modules | Centrale | prix futur | — |
| plan_modules | Modules inclus | — | plan ↔ module | Centrale | — | — |
| subscriptions | Abonnement org | `subscription_id` | org, plan, statut | Centrale | billing | Par org |
| module_entitlements | Droit effectif | dérivé ou matérialisé | user/org/module | Centrale | — | Calcul serveur |
| sessions | Sessions centrales | `session_id` | user | Centrale | tokens | Révocables |
| invitations | Invites org/module | token hash | org, email hash | Centrale | email | Par org |
| audit_events | Traçabilité | `event_id` | acteur, org, action | Centrale | métadonnées | Par org / plateforme |

Données métier Time / Mail / Stock / Pulse restent dans les périmètres modules (responsabilité locale).

## Comparaison des approches

| Approche | Avantages | Risques | Verdict |
|---|---|---|---|
| 1. Monolithe unique | UX unifiée simple | Couplage fort, déploiements risqués, fusion données | Rejeté pour l’écosystème multi-produits |
| 2. Apps séparées + portail mince | Autonomie max | SSO/cookies complexes, UX fragmentée si mal fait | Viable mais incomplet sans contrats forts |
| 3. Micro-frontends | Composition UI avancée | Complexité ops élevée trop tôt | Reporté |
| 4. **Hybride progressive** | Portail + identité communs ; modules séparés ; migration graduelle | Discipline de contrats requise | **Recommandé** |

## Architecture recommandée

```text
RECOMMENDED_ARCHITECTURE=hybrid_progressive_portal_with_separate_modules
RECOMMENDED_CENTRAL_DOMAIN=app.tagora.ca
CENTRAL_DOMAIN_CONFIRMED_BY_MARTIN=false
MODULES_TECHNICALLY_SEPARATED=true
DATABASES_MERGED=false
COMMON_IDENTITY_IMPLEMENTED=false
PORTAL_IMPLEMENTATION_STARTED=false
```

Caractéristiques :

- portail et identité communs;
- modules techniquement séparés;
- contrat d’identité et d’autorisation commun;
- migration graduelle;
- aucune fusion immédiate des bases;
- aucune réécriture complète des modules;
- TAGORA Time comme premier module pilote recommandé (à valider).

## Stratégie d’intégration progressive

### Phase 0 — Architecture et décisions

- **Objectif :** figer les décisions Martin avant code.
- **Livrables :** ce plan ; GO décisions Martin.
- **Dépendances :** audit Time (fait).
- **Risques :** décisions implicites.
- **GO si :** Martin valide/amender les 14 décisions.
- **STOP si :** domaine/IdP/dépôts non tranchés pour démarrer.
- **Rollback :** N/A (doc only).
- **Humain :** validation Martin.

### Phase 1 — Portail local ou staging

- **Objectif :** shell « Mon espace » + catalogue mock.
- **Livrables :** UI portail ; permissions simulées ; aucune connexion intermodule réelle.
- **Dépendances :** Phase 0.
- **Risques :** UX figée trop tôt.
- **GO si :** parcours mock validé.
- **STOP si :** fuite vers production / secrets.
- **Rollback :** retirer app staging.
- **Humain :** revue UX Martin.

### Phase 2 — Identité commune contrôlée (staging)

- **Objectif :** auth centrale, session, org active, claims minimaux.
- **Livrables :** login unique staging ; MFA politique ; audit connexions basique.
- **Dépendances :** Phase 1 ; IdP décidé.
- **Risques :** cookies cross-domain ; comptes dupliqués.
- **GO si :** login + org + révocation OK en staging.
- **STOP si :** fuite session / ambiguïté org.
- **Rollback :** désactiver IdP central ; revenir logins module.
- **Humain :** config IdP staging par Martin.

### Phase 3 — Intégration TAGORA Time (pilote)

- **Objectif :** Time comme premier module derrière le portail.
- **Livrables :** lancement Time depuis Mon espace ; retour portail ; validation serveur Time.
- **Dépendances :** Phase 2 ; Time V1 stable.
- **Risques :** régression Time ; double session.
- **GO si :** employé/direction/admin Time OK via portail staging.
- **STOP si :** régression métier Time ou contournement URL.
- **Rollback :** Time autonome (URLs login actuelles).
- **Humain :** tests métier Martin.

### Phase 4 — Autres modules (un à un)

- Ordre proposé (à valider) : Mail IA → Stock Premium → Pulse AI → Admin TAGORA.
- **GO distinct par module.**
- **STOP** si un module n’a pas de contrat d’auth clair.
- **Rollback** module par module sans impacter les autres.

### Phase 5 — Abonnements et administration SaaS

- Plans, entitlements, quotas, console admin ; facturation future.
- **STOP** si droits Oliem exposés à un client SaaS.
- **Rollback :** entitlements manuels / feature flags.

### Phase 6 — Pilote contrôlé puis production

- Tests sécu, audit, backup, rollback, validation Martin, **GO production séparé**.
- Aucune production dans les phases 0–5 sans GO explicite.

## Matrice des phases

| Phase | Environnement | Code portail | Auth réelle | Modules réels | Production |
|---|---|---|---|---|---|
| 0 | Doc | Non | Non | Non | Non |
| 1 | local/staging | Shell mock | Simulée | Non | Non |
| 2 | staging | Oui | Centrale staging | Non | Non |
| 3 | staging | Oui | Oui | Time | Non |
| 4 | staging | Oui | Oui | +1 module/GO | Non |
| 5 | staging | Oui | Oui | + billing design | Non |
| 6 | pilote/prod | Oui | Oui | Validés | **GO séparé** |

## Risques et mesures de contrôle

| Risque | Mesure |
|---|---|
| Fusion accidentelle des tenants | Clés org immuables ; checks serveur ; tests isolation |
| Comptes en double | Identité globale unique ; mapping legacy documenté |
| Rôles homonymes ≠ sens | Namespaces `module:role` ; pas d’égalité implicite |
| Contournement URL directe | Guard module obligatoire ; deny by default |
| Session centrale trop permissive | Claims minimaux ; TTL court ; revalidation module |
| Fuite inter-organisations | RLS / filtres serveur ; audits ; pas d’org dans l’URL seule |
| Couplage excessif modules | Contrats versionnés ; pas de partage de DB métier |
| Panne portail bloque tout | Modes dégradés : deep-link module d’urgence sous GO |
| Déconnexion globale incomplète | Liste de logout endpoints ; tests multi-domaines |
| Divergence staging/production | Checklists cibles ; secrets séparés |
| Mauvais rattachement utilisateur | Invitations + memberships ; pas d’auto-join |
| Migration précipitée des comptes | Mapping progressif ; dry-run ; GO par vague |
| Conflit abonnement vs permission | Entitlement ∩ permission ; les deux requis |
| Complexité domaines/cookies | Décision Martin cookies 1re partie ; doc matrice |
| Modules internes exposés SaaS | Flag `internal_only` ; entitlements plateforme |
| Déploiement simultané risqué | Un module / un GO / un déploiement |
| Absence de rollback module | Feature flag portail ; URLs legacy Time conservées Phase 3+ |

## Décisions requérant Martin

Aucune de ces décisions n’est définitive sans GO Martin :

1. Domaine central final (`app.tagora.ca` ou autre).
2. Nom public du portail (« Mon espace TAGORA » ou autre).
3. Fournisseur d’identité central.
4. Architecture des dépôts (mono-repo portail vs repo dédié).
5. Stratégie des sessions entre domaines (cookie 1re partie, token échangé, BFF).
6. Organisation propriétaire initiale / plateforme.
7. Premier module pilote (recommandation : TAGORA Time).
8. Règle d’accès multi-organisations (sélecteur, défaut, échec strict).
9. Modèle de forfaits.
10. Identité visuelle commune.
11. Ordre d’intégration des modules.
12. Stratégie de facturation (plus tard).
13. Conditions du pilote.
14. Conditions de production.

## Critères GO/STOP

### GO (pour passer à un bloc de décisions Martin puis Phase 1)

- Plan d’architecture publié et lisible.
- Audit Time consigné.
- Architecture hybride recommandée explicite.
- Phases, risques et décisions Martin isolés.
- Aucune implémentation commencée.
- Production non touchée.

### STOP (immédiat)

- Tentative de modifier auth/DNS/production sans GO.
- Fusion de bases modules.
- Exposition de secrets.
- Contournement des guards « carte UI = autorisation ».
- Intégration multi-modules en un seul bloc non contrôlé.

## Rollback conceptuel

| Situation | Rollback |
|---|---|
| Portail staging défaillant | Désactiver déploiement staging ; Time inchangé |
| Identité centrale défaillante | Revenir logins Time `/employe/login` et `/direction/login` |
| Intégration Time échouée | Retirer lien portail→Time ; Time autonome |
| Module N échoue | Désactiver carte + entitlement ; autres modules inchangés |
| Production (futur) | GO rollback distinct ; backups ; pas de force-push |

## Actions humaines requises

1. Martin lit et amende ce plan.
2. Martin tranche les 14 décisions (bloc GO dédié).
3. Aucune réservation DNS dans ce bloc.
4. Aucune config IdP production.
5. Préparer plus tard l’accès staging du futur portail (hors scope ici).
6. Conserver les trois stashes Time intacts (déjà respecté).

## État d’avancement

```text
TAGORA_TIME_V1=100%
UNIFIED_PORTAL_PROGRESS=0%
UNIFIED_PORTAL_ARCHITECTURE_PROGRESS=100%
UNIFIED_PORTAL_IMPLEMENTATION_PROGRESS=0%
PORTAL_IMPLEMENTATION_STARTED=false
PRODUCTION_AUTHORIZED=false
ARCHITECTURE_DEPLOYED=false
DOMAIN_CHANGED=false
AUTHENTICATION_CHANGED=false
DATABASE_CONNECTED=false
SECRET_READ_OR_DISPLAYED=false
MODULES_REMAIN_SEPARATED=true
EACH_FUTURE_PHASE_REQUIRES_DISTINCT_MARTIN_GO=true
```

## Prochain bloc recommandé

```text
NEXT_TAGORA_TIME_BLOCK=TAGORA-TIME-TAGORA-UNIFIED-PORTAL-MARTIN-ARCHITECTURE-DECISION-GO-NOGO
```

Ce prochain bloc devra **uniquement** permettre à Martin de valider ou modifier les décisions d’architecture avant toute implémentation.
