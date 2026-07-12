# SAAS-1 — Decisions Martin (confirmées)

**Statut :** **CONFIRMÉES** par Martin — 2026-07-12  
**HEAD référence design :** `660ac5c`  
Ces décisions orientent SaaS 1B. **Rien n’est implémenté** dans cette passe documentation.

---

## Décisions confirmées

### 1. Multi-organisation par utilisateur

**Décision :** **Oui** — un utilisateur peut appartenir à plusieurs organisations.

### 2. Mémorisation de l’organisation active

**Décision :** **Oui** — cookie HttpOnly côté serveur.  
Toute org active reçue du client doit être **revalidée en base** :

- utilisateur authentifié ;
- membership **actif** ;
- organisation **active** ;
- rôle autorisé ;
- entitlement requis **lorsque pertinent** (SaaS 3+).

**Fail closed** si l’une de ces conditions échoue.

### 3. Suppression / suspension d’un `organization_owner`

**Décision :**

- plusieurs owners **permis** ;
- **au moins un** owner actif obligatoire ;
- **aucun** retrait du dernier owner ;
- transfert ou présence d’un autre owner **requis** avant suppression/suspension.

### 4. Plusieurs owners

**Décision :** **Oui** (inclus dans §3).

### 5. Paramètres / branding compagnies internes

**Décision :**

- branding principal au niveau **organization** ;
- paramètres opérationnels configurables par **organization_company** ;
- compagnie legacy par défaut : **Oliem Solutions** (`oliem_solutions`).

### 6. Accès plateforme / support

**Décision :**

- séparé de `organization_memberships` ;
- accès **temporaire** ;
- **motif** obligatoire ;
- **expiration** obligatoire ;
- **journalisation** obligatoire ;
- **aucun** accès silencieux aux données client.

`platform_super_admin` / `platform_support` **absents** des memberships clients.

### 7. Compte Auth sans membership

**Décision :** **Oui**, uniquement pendant invitation ou onboarding, **sans aucun accès métier**.

### 8. Premier lot SaaS 1B

**Décision :** **Fondation tenant uniquement.**

Tables concernées :

- `organizations`
- `organization_companies`
- `organization_memberships`
- `organization_invitations`
- `organization_settings`
- `platform_access`
- table / mécanisme d’audit platform access associé

**Aucune** table métier historique ne reçoit `organization_id` dans ce premier lot.

### 9. Compagnie par défaut Groupe Oliem

**Décision :** Oliem Solutions = défaut legacy (`is_default`).

### 10. Dual-run JWT

**Décision :** **Autorisé temporairement** pendant SaaS 1B pour préserver l’application existante.

**JWT :**

- peut servir de **hint** de transition ;
- **ne doit jamais** être la source de vérité tenant ou permissionnelle.

**Critères de sortie du dual-run (suppression obligatoire ensuite) :**

1. Helpers `requireActiveOrganization` / `requireOrganizationMembership` / `requireOrganizationRole` en production sur les chemins métier critiques.  
2. Cookie org active + revalidation DB opérationnels.  
3. Memberships Groupe Oliem backfillés et validés (counts + smoke login).  
4. Feature flag dual-run désactivable ; période de observation sans incident.  
5. GO Martin explicite pour couper le fallback JWT global comme source runtime.  
6. Après coupure : memberships = source runtime officielle des rôles org ; JWT role global retiré progressivement des nouveaux chemins.

---

## Déjà figé (SaaS 0 — inchangé)

- Shared DB + shared schema + RLS stricte (RLS **métier** tenant-aware = **SaaS 2**)  
- Un tenant Groupe Oliem ; compagnies internes ≠ tenants  
- Pas de Stripe avant fondation + RLS + entitlements  
- Pas de nouveau hardcode Oliem/Titan  
- Pas de hard-delete legacy ; IDs conservés  
- Compensation / finance hors premier backfill métier  

---

## État produit

TAGORA Time **n’est pas** multi-tenant implémenté. SaaS 1A = design freeze documentaire uniquement.

## Prochaine phase

Sur ordre explicite Martin uniquement : **SaaS 1B — migrations fondation** (hors production jusqu’à plan dédié).
