# SAAS-1 — Migration sequence (design only)

**Statut :** PROPOSÉ / NON IMPLÉMENTÉ  
**Aucun fichier SQL créé dans cette passe.**  
Convention : `YYYYMMDDHHMMSS_description.sql` (ADR-007)  
**Interdit :** `migration repair` comme méthode normale.

Les timestamps ci-dessous sont **indicatifs** (jour de gel + séquence). Les timestamps réels seront fixés au moment de l’implémentation 1B.

---

## 1. Séquence SaaS 1B — fondation uniquement

| Ordre | Nom proposé | Contenu | Dépendances |
|-------|-------------|---------|-------------|
| 1 | `20260712180000_saas1_organizations.sql` | Table `organizations` + indexes + check status | Aucune |
| 2 | `20260712180100_saas1_organization_companies.sql` | `organization_companies` + uniques | 1 |
| 3 | `20260712180200_saas1_organization_settings.sql` | settings 1:1 | 1 |
| 4 | `20260712180300_saas1_organization_memberships.sql` | memberships + checks rôles | 1 |
| 5 | `20260712180400_saas1_organization_invitations.sql` | invitations + token_hash | 1 |
| 6 | `20260712180500_saas1_platform_access.sql` | `platform_access` + `platform_access_audit` | auth.users |
| 7 | `20260712180600_saas1_seed_groupe_oliem.sql` | Seed org + 2 companies + settings (**données**, pas métier) | 1–3 |
| 8 | `20260712180700_saas1_backfill_memberships.sql` | Script/migration contrôlée memberships depuis metadata rôles | 4, 7 |

Notes :

- **Transactions :** chaque migration atomique  
- **Idempotence :** `CREATE TABLE IF NOT EXISTS` ; seed via `INSERT … ON CONFLICT DO NOTHING` sur slug  
- **RLS :** enable + policies **minimales deny-by-default** pour JWT clients sur tables fondation dès 1B (accès via service role seed/admin seulement) **ou** policies membership read — détail à trancher en 1B implémentation ; isolation métier complète = SaaS 2  
- **Pas d’ALTER** tables métier dans 1B  

---

## 2. Validations par migration

| Migration | Contrôles |
|-----------|-----------|
| organizations | PK, slug unique, status check |
| companies | FK org, unique (org, code), une default max |
| memberships | FK user/org, unique (org,user), rôle ∈ liste, pas de platform role |
| invitations | expires_at, token_hash NOT NULL |
| platform_access | expires_at NOT NULL si support |
| seed | count org=1 slug, companies=2 |
| memberships backfill | count admins/direction/employe vs Auth sample |

---

## 3. Rollback réaliste 1B

| Étape | Rollback |
|------|----------|
| Avant seed utilisé en prod | `DROP TABLE` dans l’ordre inverse (audit → invitations → memberships → settings → companies → organizations) |
| Après memberships backfill | DELETE memberships seed ; conserver tables si déjà référencées |
| Jamais | DELETE `auth.users` / `chauffeurs` |

---

## 4. Tests migrations (plan)

- CI : apply sur Postgres vide **pour les nouvelles migrations 1B** (elles doivent s’appliquer seules)  
- **Limite legacy :** une base neuve complète historique reste non fidèle (tables legacy hors CREATE) — ADR-007 baseline  
- Stratégie interim :  
  - tester 1B sur staging lié après backup  
  - tester 1B sur Postgres vide (fondation only)  
  - ne pas prétendre `db reset` total = prod  

---

## 5. Séquence ultérieure (hors 1B — aperçu)

| Plus tard | Exemple |
|-----------|---------|
| 1C | `…_saas1_account_requests_organization_id.sql` nullable |
| 1D | `…_saas1_chauffeurs_organization_id.sql` nullable + backfill |
| … | index / FK / NOT NULL après preuves |
| SaaS 2 | policies tenant-aware métier |

---

## 6. Données de backfill 1B

Uniquement :

- Organisation Groupe Oliem  
- 2 compagnies internes  
- settings  
- memberships users existants  

**Pas** de backfill `compensation_*` / `temps_titan` / livraisons.
