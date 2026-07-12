# SAAS-1 — Test plan

**Statut :** PROPOSÉ / NON IMPLÉMENTÉ  
À exécuter avant/pendant SaaS 1B et en préparation SaaS 2.

---

## 1. Fixtures

| Fixture | Description |
|---------|-------------|
| **Tenant A** | Org active « Acme Test » (après multi-tenant réel) ; en 1B legacy : Groupe Oliem = Tenant A de facto |
| **Tenant B** | Deuxième org (créée en test seulement après fondation) |
| **User A only** | Membership uniquement Tenant A |
| **User B only** | Membership uniquement Tenant B |
| **User multi** | Membership A + B ; default A |
| **platform_super_admin** | Ligne `platform_access` active |
| **platform_support expiré** | `expires_at` passé |
| **Membre suspendu** | membership `suspended` |
| **User sans membership** | Auth only |

---

## 2. Cas fondation

| # | Cas | Attendu |
|---|-----|---------|
| F1 | Création organisation | Row + slug unique |
| F2 | Création compagnie interne | FK org ; codes uniques |
| F3 | Deuxième default company | Rejeté |
| F4 | Membership rôle valide | OK |
| F5 | Membership rôle `platform_super_admin` | Rejeté |
| F6 | Org `suspended` | Accès métier refusé |
| F7 | Membre suspendu | 403 |
| F8 | Multi-org + default | Résolution org = default |
| F9 | Switch org vers membership valide | OK |
| F10 | Switch org vers org non membre | Fail closed |
| F11 | Absence org active | Fail closed / pas de data |
| F12 | Client envoie autre `organization_id` | Ignoré / 403 après validation |
| F13 | platform_super_admin sans audit support | Pas d’accès data client silencieux |
| F14 | platform_support expiré | Refus |
| F15 | Invitation expire | Status expired ; token invalide |
| F16 | Dernier owner révocation | Bloqué |

---

## 3. Backfill Groupe Oliem

| # | Cas | Attendu |
|---|-----|---------|
| B1 | Seed org + 2 companies | Codes legacy exacts |
| B2 | Memberships depuis rôles JWT | Mapping admin/direction/employe |
| B3 | IDs `chauffeurs` inchangés | (vérif lot ultérieur) |
| B4 | Re-run seed | Idempotent |
| B5 | Rollback fondation | Tables droppables si pas de FK métier |

---

## 4. Anti-fuite préparatoire (SaaS 2)

Même si RLS métier absente en 1B, préparer les tests :

| # | Cas | Attendu (cible SaaS 2) |
|---|-----|------------------------|
| X1 | User A SELECT table métier Tenant B | 0 rows |
| X2 | User A UPDATE row B | Échec |
| X3 | Service role sans orgId sur route tenant | Refus helper |
| X4 | Cron multi-org | Traite A puis B séparément ; logs |

---

## 5. Types de tests

| Type | Usage |
|------|--------|
| Unit | validators rôles, mapping, token hash |
| Integration DB | migrations 1B sur Postgres vide + staging |
| API | helpers require* (quand codés) |
| Manuel Martin | seed Groupe Oliem visible / pas de régression login actuel |

---

## 6. Critères de sortie tests 1B

- Migrations 1B appliquées staging sans toucher prod  
- Seed + memberships validés  
- Aucune régression login MFA sur rôles JWT existants (dual-run)  
- Aucune table métier ALTER  
- Rapport de contrôle SQL archivé  
