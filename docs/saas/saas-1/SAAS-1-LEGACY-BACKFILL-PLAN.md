# SAAS-1 — Legacy backfill plan (Groupe Oliem)

**Statut :** PROPOSÉ / NON IMPLÉMENTÉ  
**Règles :** pas de hard-delete ; IDs métier conservés ; compatible ADR-006.

---

## 1. Cibles de création (données fondation)

| Objet | Valeur proposée |
|-------|-----------------|
| Organization | `display_name` = Groupe Oliem ; `slug` = `groupe-oliem` ; status `active` ; locale `fr-CA` ; currency `CAD` ; timezone `America/Toronto` |
| Company 1 | Oliem Solutions ; `company_code` = `oliem_solutions` ; `is_default` = true (à confirmer Martin) |
| Company 2 | Produits Industriels Titan ; `company_code` = `titan_produits_industriels` |
| Memberships | Pour chaque `auth.users` avec rôle app connu → membership Groupe Oliem |
| Mapping rôles | Voir `SAAS-1-ROLE-MAPPING.md` |
| Settings | Copier défauts Canada / fr-CA |

---

## 2. Mapping employés

| EXISTANT | Action backfill (lots ultérieurs, pas 1B métier) |
|----------|--------------------------------------------------|
| `chauffeurs` | `organization_id` = Groupe Oliem ; conserver `id` |
| `primary_company` / flags can_work_for_* | Lier / dériver `organization_companies` |
| `auth_user_id` | Membership si user existe |

---

## 3. Mapping colonnes compagnie (lots ultérieurs)

| Colonne legacy | Cible |
|----------------|--------|
| `company_context` / `company_key` / `billing_company_context` | `organization_id` + éventuellement `internal_company_id` |
| Valeur `oliem_solutions` / `titan_produits_industriels` | FK ou code vers `organization_companies` |
| `all` / NULL | Règle par table (documenter à l’implémentation ; souvent org-wide) |

Pendant la transition, colonnes texte legacy **coexistent** avec les nouvelles FK.

---

## 4. Stratégie progressive

### Étape A — Fondation seule (SaaS 1B)

- Créer tables fondation  
- Seed org + 2 companies + settings  
- **Aucune** table métier altérée  
- Memberships des users existants (lecture Auth admin / metadata role)  
- **Rollback :** DROP tables fondation (si aucune dépendance métier) ou soft-disable  

### Étape B — `organization_id` nullable (Core d’abord)

- ALTER premières tables Core (`account_requests`, puis `chauffeurs`, …)  
- **Rollback :** DROP COLUMN si encore nullable et non utilisée en prod path  

### Étape C — Backfill déterministe

```text
UPDATE <table>
SET organization_id = '<groupe-oliem-uuid>'
WHERE organization_id IS NULL;
```

- Idempotent  
- **Rollback :** remettre NULL seulement si NOT NULL pas encore appliqué (fenêtre courte)  

### Étape D — Double validation

- SQL : `COUNT(*) FILTER (WHERE organization_id IS NULL) = 0`  
- Code : smoke admin/direction/employé sur org legacy  
- Échantillons compagnie  

### Étape E — Index + FK

- Index `(organization_id)`  
- FK vers `organizations`  
- **Rollback :** drop FK/index (données conservées)  

### Étape F — NOT NULL

- Seulement après preuve complète + GO Martin  
- **Rollback :** difficile ; éviter jusqu’à confiance élevée ; préférer rester nullable une release si doute  

### Étape G — RLS tenant-aware

- **SaaS 2** — hors 1B  

---

## 5. Pourquoi Compensation / finance ne sont pas le premier backfill métier

| Risque | Détail |
|--------|--------|
| Données $ critiques | Accruals, commissions, `temps_titan` |
| Surface service role admin | Contournement RLS déjà large |
| Bugs de filtre | Impact paie / conformité |
| Dépendances | Events → accruals → history ; grants |

Backfill finance **après** Core + pointage/ops stabilisés, avec tests anti-fuite renforcés.

---

## 6. Memberships — algorithme proposé (1B)

1. Lister users Auth (service role Auth Admin — job one-shot audité)  
2. Lire `getUserRole` équivalent depuis `app_metadata.role`  
3. Si rôle reconnu → INSERT membership Groupe Oliem (role mappé), `status=active`  
4. Choisir owner : compte fondateur / premier admin (décision Martin) ; autres admins → `organization_admin`  
5. Users sans rôle → pas de membership métier (ou status invited)  
6. **Ne pas** supprimer users ni chauffeurs  

---

## 7. Vérifications post-backfill fondation

- Exactement 1 org `groupe-oliem`  
- Exactement 2 companies actives avec codes legacy  
- Tout admin/direction/employé connu a un membership  
- ≥ 1 owner actif  
- Aucune ligne platform dans memberships  
