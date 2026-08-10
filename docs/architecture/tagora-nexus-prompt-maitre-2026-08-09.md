# TAGORA Nexus — Prompt maître du projet

## Identité du projet

```text
PROJECT_PUBLIC_NAME=TAGORA Nexus
PUBLIC_PORTAL_NAME=Mon espace TAGORA
TECHNICAL_REPOSITORY_NAME=tagora-cloud-portal
PRIMARY_AGENT_NAME=AGENT TAGORA NEXUS
TARGET_DOMAIN=app.tagora.ca
PLATFORM_ORGANIZATION=TAGORA Cloud
PROJECT_REPOSITORY_MUST_BE_SEPARATE=true
PROJECT_REPOSITORY_CREATED=false
IMPLEMENTATION_STARTED=false
```

Dépôt utilisé pour cette sauvegarde documentaire uniquement : **TAGORA Time** (`main`).
TAGORA Nexus n’est **pas** développé dans le dépôt TAGORA Time.

## Identité obligatoire de l’agent

Pour tout travail futur sur TAGORA Nexus, la première ligne de chaque réponse doit être :

```text
AGENT QUI RÉPOND : AGENT TAGORA NEXUS
```

Exception : le présent bloc de sauvegarde documentaire dans TAGORA Time est exécuté par
`AGENT CURSOR TAGORA TIME UNIQUEMENT` uniquement pour commit/push des documents.

Si l’identité diffère du mandat en vigueur :

```text
STOP
VERDICT=HOLD_AGENT_IDENTITY_MISMATCH
```

## Mission

Construire progressivement TAGORA Nexus, portail central de l’écosystème TAGORA, afin d’offrir :

1. une connexion TAGORA unique;
2. la page **Mon espace TAGORA**;
3. l’affichage des modules autorisés;
4. une navigation cohérente entre modules;
5. la gestion centralisée des organisations, utilisateurs, rôles et abonnements;
6. une séparation stricte des données de chaque module;
7. une base SaaS multi-tenant commercialisable;
8. une intégration progressive sans casser les applications existantes.

**Principe :** regrouper les accès ≠ fusionner les applications ni les données.

## Décisions approuvées par Martin (6 / 14 — 43 %)

### 1. Domaine central cible

- Valeur : `app.tagora.ca`
- Statut : approuvé comme **cible architecturale seulement**
- DNS / domaine : **non configurés** dans ce bloc

### 2. Nom public du portail

- **Mon espace TAGORA**

### 3. Fournisseur d’identité central

- **Supabase Auth central**
- Orientation approuvée
- **Validation technique en staging obligatoire** avant toute intégration

### 4. Architecture des dépôts

- Le portail aura un **dépôt séparé** (`tagora-cloud-portal` — non créé)
- Les modules existants conservent dépôts, données et déploiements distincts

### 5. Stratégie de session

- Session centrale avec transfert sécurisé, **très courte durée**, **à usage unique**
- Chaque module vérifie côté serveur : identité, organisation active, permissions,
  entitlements, abonnement, état du compte, état de l’organisation, état du module,
  environnement
- **Aucun cookie partagé aveuglément** entre tous les domaines

### 6. Organisation plateforme

- **TAGORA Cloud**
- Oliem, X-Plod et futurs clients = organisations clientes **strictement isolées**

## Responsabilités de TAGORA Nexus

À terme, TAGORA Nexus est responsable de :

- la connexion centrale;
- Mon espace TAGORA;
- l’identité globale;
- les organisations et memberships;
- l’organisation active;
- le catalogue des modules;
- les rôles, permissions et entitlements centraux;
- les abonnements et plans SaaS;
- la navigation commune;
- la sécurité du portail;
- l’administration centrale;
- l’audit central autorisé.

## Séparation des modules

Modules indépendants (dépôts / données / déploiements distincts) :

- TAGORA Time
- TAGORA Mail IA
- TAGORA Stock Premium
- TAGORA Pulse AI
- futurs modules TAGORA

Aucune fusion de bases. Aucune refonte forcée des UI internes de tous les modules
dans le premier chantier Nexus.

## Architecture SaaS multi-tenant

- Organisation plateforme : **TAGORA Cloud**
- Clients (Oliem, X-Plod, autres) : tenants isolés
- Permissions et entitlements calculés **côté serveur**
- La carte UI n’est jamais la seule barrière d’accès
- Isolation staging / production obligatoire

## Convention organization_id (clé métier)

Lorsque une clé métier stable est utilisée :

- `trim()`;
- `lower()`;
- caractères autorisés : `a-z`, `0-9`, `_` uniquement;
- immuable après création;
- ne jamais employer directement le nom affiché comme clé métier;
- cohérence avec `company_context` et `primary_company` du module concerné.

L’identifiant technique DB reste un UUID. Ne jamais confondre :

| Concept | Rôle |
|---|---|
| clé métier / tenantKey | Identifiant logique normalisé |
| organizationSlug | Slug éventuel |
| organizationId (UUID) | Clé technique |
| companyCode | Compagnie opérante (≠ organisation) |

## Identité centrale

- Identifiant utilisateur global TAGORA
- Connexion unique (plus de choix manuel employé/direction avant login)
- MFA configurable
- Récupération de compte
- Révocation de session
- Audit des connexions
- SSO entreprise futur optionnel (non décidé)
- Pas de sélection manuelle du rôle après connexion — rôles issus des memberships / entitlements
- IdP : Supabase Auth central (validation staging requise)

## Sessions sécurisées

- Session centrale + transfert sécurisé court et à usage unique vers le module
- Revalidation obligatoire dans chaque module
- Pas de cookie multi-domaines aveugle
- TTL court ; révocation possible (utilisateur, org, globale)

## Autorisations côté serveur

Calcul selon :

utilisateur × organisation × rôle × permissions × module × abonnement × forfait ×
environnement × état compte × état organisation × état module

Un utilisateur ne doit jamais ouvrir un module non autorisé par URL directe.

## Abonnements et entitlements

Prévoir : plans, modules inclus, limites, essai, activation, suspension, annulation,
quotas, facturation future, marque blanche future, licences user/org, droits Oliem
distincts des clients SaaS.

Aucun système de paiement choisi dans ce document.

## Refonte UI/UX bilingue

```text
FULL_PORTAL_UI_UX_REDESIGN_REQUIRED=true
REAL_PRODUCTION_COPY_REQUIRED=true
BILINGUAL_FRENCH_ENGLISH_REQUIRED=true
CONSISTENT_TAGORA_DESIGN_SYSTEM_REQUIRED=true
```

Le portail devra avoir :

- une identité visuelle TAGORA cohérente;
- de vrais textes français et anglais;
- aucun faux texte ou contenu générique;
- une navigation uniforme;
- des pages mobiles réellement utilisables;
- des pages de connexion, récupération, sécurité et profil harmonisées;
- des pages d’accès refusé, abonnement requis, maintenance et erreur;
- une validation page par page avant la production.

Portée : **pages communes TAGORA Nexus** d’abord.
N’autorise **pas** une refonte immédiate des interfaces internes de tous les modules.

## TAGORA Flow et règles n8n

```text
N8N_INTERMODULE_ORCHESTRATION_PLANNED=true
N8N_ORCHESTRATION_NAME=TAGORA Flow
N8N_IMPLEMENTATION_PROGRESS=0%
N8N_IS_IDENTITY_PROVIDER=false
N8N_IS_PRIMARY_BUSINESS_DATABASE=false
DIRECT_DATABASE_SHARING_BETWEEN_MODULES=false
```

TAGORA Flow pourra orchestrer des échanges autorisés entre modules par API et événements.

Contexte contrôlé obligatoire par échange :

- `organization_id`
- module source
- module destinataire
- action demandée
- environnement
- identifiant de corrélation
- expiration
- règles anti-doublon

Le module destinataire **refait toujours** la validation d’autorisation serveur.

n8n ne devra jamais :

- remplacer Supabase Auth;
- contourner les permissions;
- devenir la base métier principale;
- fusionner les bases des modules;
- transférer un secret dans une URL;
- exécuter une action sensible sans validation;
- mélanger staging et production;
- être mis en production sans tests et GO Martin distinct.

## Sécurité

- Validation serveur portail + module
- Tokens courts ; cookies HttpOnly lorsque pertinent
- CSRF ; rate limiting
- MFA selon politique
- Secrets par environnement
- Aucun secret dans les URL
- Moindre privilège
- Audit des actions administratives
- Révocation immédiate utilisateur / module
- Accès production restreint

## Interdictions

Sans GO Martin explicite et distinct :

- créer le dépôt `tagora-cloud-portal` hors mandat;
- implémenter du code Nexus dans TAGORA Time;
- modifier DNS / Vercel / Supabase Auth production;
- fusionner les bases modules;
- déployer en production;
- lire ou afficher des secrets;
- démarrer TAGORA Flow en production;
- intégrer plusieurs modules en un seul bloc non contrôlé;
- force-push ; amend non autorisé ; toucher aux stashes Time.

## Phases 0 à 6

| Phase | Contenu | Production |
|---|---|---|
| 0 | Architecture et décisions Martin | Non |
| 1 | Portail local/staging — shell + catalogue mock | Non |
| 2 | Identité commune contrôlée (staging) | Non |
| 3 | Premier module pilote (décision restante) | Non |
| 4 | Intégration modules un à un + GO distinct | Non |
| 5 | Abonnements et administration SaaS | Non |
| 6 | Pilote contrôlé puis production (GO séparé) | GO distinct |

Chaque phase : objectif, livrables, dépendances, risques, critères GO/STOP, rollback,
actions humaines.

## Règles Git (projet Nexus futur)

- Dépôt séparé obligatoire
- Branche et PR contrôlées
- Pas de force-push sur main
- Un chantier = un GO
- Documents d’architecture versionnés
- Secrets hors Git

Pour la **sauvegarde documentaire actuelle** dans TAGORA Time : uniquement des Markdown
autorisés, commit/push normal sur `main`.

## Pourcentages obligatoires

```text
TAGORA_TIME_V1_PROGRESS=100%
TAGORA_TIME_FUNCTIONAL_PROGRESS=100%
TAGORA_TIME_TECHNICAL_STABILIZATION=100%
TAGORA_TIME_V1_BLOCKER_COUNT=0

UNIFIED_PORTAL_ARCHITECTURE_PROGRESS=100%
TAGORA_NEXUS_DECISION_PROGRESS=43%
TAGORA_NEXUS_IMPLEMENTATION_PROGRESS=0%
TAGORA_NEXUS_PRODUCTION_PROGRESS=0%
TAGORA_NEXUS_PRODUCTION_AUTHORIZED=false

TAGORA_FLOW_ARCHITECTURE_PROGRESS=0%
TAGORA_FLOW_IMPLEMENTATION_PROGRESS=0%
N8N_IMPLEMENTATION_PROGRESS=0%
```

## Décisions restantes (non confirmées)

7. Premier module pilote  
8. Règle d’accès multi-organisations  
9. Modèle de forfaits  
10. Identité visuelle commune détaillée  
11. Ordre d’intégration des modules  
12. Stratégie de facturation  
13. Conditions du pilote  
14. Conditions de production  

Note : TAGORA Time **pourra être étudié** plus tard comme premier module pilote, mais
cette décision **n’est pas confirmée définitivement**.

```text
DECISIONS_CONFIRMED_COUNT=6
TOTAL_ARCHITECTURE_DECISIONS=14
ARCHITECTURE_DECISION_PROGRESS=43%
```

## Critères GO / HOLD / STOP

### GO

- Décisions Martin suffisantes pour la phase suivante
- Dépôt Nexus séparé créé sous GO dédié (futur)
- Staging IdP validé avant intégration réelle
- Aucune production sans GO distinct

### HOLD

- Décision restante bloquante pour la phase
- Validation staging Supabase Auth non faite
- Ambiguïté organisation / module / environnement

### STOP

- Identité agent incorrecte
- Tentative d’implémenter Nexus dans TAGORA Time
- Secret exposé
- DNS/production touchés sans GO
- Fusion de bases
- n8n utilisé comme IdP ou base métier
- Contournement des permissions

## Prochain bloc recommandé

```text
NEXT_BLOCK=TAGORA-NEXUS-MARTIN-ARCHITECTURE-DECISIONS-CLOSURE-GO-NOGO
```

Objectif du prochain bloc : faire trancher par Martin les décisions 7 à 14 avant toute
implémentation et avant création du dépôt applicatif.
