# TAGORA Time — SaaS 1B.1B H5-D3 observation post-dépréciation (2026-07-15)

**Agent :** Martin  
**Agent donneur :** Martin  
**Poste :** Maison  
**Branche :** `wip/saas1b1-tenant-foundation-checkpoint-2026-07-13`  
**HEAD :** `5d46a7104e96b52bec1b299f06aec4ac4deeef61`  
**Feature protégée :** `feature/sales-book-grants` @ `6fd6ca09078eedbd133e59aca160f606fa33040b`

**Staging (lecture seule) :** `qokyobcvplzufshydhih`  
**Production :** **INTERDITE** — `qcgvzdlfsxybrmloijpt`

**Avancement V1 :** **51 %** (inchangé)

**Portée :** observation agrégée lecture seule — **aucun** code, migration, DDL/DML staging, événement QA.

**Verdict :** `H5-D3 OBSERVATION INSUFFISANTE — AUCUN ÉVÉNEMENT POST-DÉPLOIEMENT`

---

## 1. Prérequis H5-D2 (confirmés)

| Contrôle | Résultat |
|----------|----------|
| Migration `20260715120000` present + remote **applied** | Oui |
| `user_id` présente | Oui |
| `user_id` nullable | Oui (YES) |
| COMMENT legacy | Oui |
| `employee_id` NOT NULL | Oui |
| `actor_user_id` nullable | Oui |
| Vue sans `he.user_id` ; avec `auth_user_id` | Oui |
| Insert canonique sans dual-write `user_id` | Oui (source repository) |
| Fallback legacy borné | Oui (`42703` / `23502`) |
| H5-E / H5-F / H4 touchés | Non |

Réf. : `docs/handoffs/TAGORA-TIME-SAAS1B1B-H5D2-DEPRECATION-2026-07-15.md`

---

## 2. Historique staging (lecture seule)

| Lot | Statut |
|-----|--------|
| H5-A / H5-B / H5-C | applied |
| H5-D2 `20260715120000` | applied |
| H5-D historiques (`18140000`…) | pending |
| H4 (`20260712220*`) | pending = 6 |
| H1/H2/H3 | inchangées |
| Repair durant H5-D3 | **aucun** |

---

## 3. Période observée

| Élément | Valeur |
|---------|--------|
| Application H5-D2 (approx. UTC) | ~2026-07-14 23:30–23:40 (session GO H5-D2) |
| Snapshot observation (UTC) | 2026-07-14 23:47:50 |
| Durée d’observation disponible | **&lt; 1 heure** (fenêtre courte post-déploiement) |
| Cutoff agrégats post-D2 | `created_at >= 2026-07-15 00:30:00+00` *et* totaux table = 0 |

*Note : indépendamment du cutoff, la table `horodateur_events` est vide (total = 0).*

| Métrique | Valeur |
|----------|--------|
| Total HE (toute période) | **0** |
| Événements avant H5-D2 | **0** |
| Événements post-H5-D2 | **0** |

---

## 4. Matrices agrégées (post-H5-D2)

Toutes les métriques demandées sont à **0** (aucune ligne à évaluer).

| Métrique | Valeur |
|----------|--------|
| Total post-D2 | 0 |
| `employee_id` non null / null / orphelin | 0 / 0 / 0 |
| `actor_user_id` non null / null / null système / null non-système | 0 / 0 / 0 / 0 |
| `user_id` non null / null | 0 / 0 |
| Conflits employee/user | 0 |
| `work_date` / `week_start_date` non null | 0 / 0 |
| `company_context` valide | 0 |
| HE admissibles vue / lignes vue horodateur | 0 / 0 |
| Pertes vue / doublons id | 0 / 0 |
| Vue : `user_id` public null / `chauffeur_id` null / `recorded_at` null | 0 / 0 / 0 |
| Vue : company invalide | 0 |

Aucune donnée personnelle, UUID ou note exposée.

---

## 5. Vue Direction terrain

Parité agrégée : **non prouvable sur données réelles** (0 événement).  
Définition schéma (RO) : branche Horodateur = `c.auth_user_id` + `he.employee_id` ; pas de `he.user_id`.

---

## 6. Indices de fallback / erreurs

| Source | Statut |
|--------|--------|
| Logs applicatifs locaux projet | **non observables** (aucune store logs fiable dans le dépôt) |
| Erreurs 23502 / 42703 / PostgREST | **non observables** |
| Production | **non consultée** (interdite) |
| Journalisation ajoutée | Non (interdit) |

Ne rien inventer : absence d’évènements ≠ preuve de zéro erreur runtime.

---

## 7. Tests exécutés (non destructifs)

- R8 / R9 / R10  
- H5-A / H5-B / H5-C / H5-D1 / H5-D2 / H5-D3  
- repository insert H5-D2 ; operational-state ; schedule-gate ; Phase1 vue / Direction terrain / versions  

Aucun `db reset` (pas de divergence démontrée). Aucune fixture staging.

---

## 8. Porte de stabilisation

| Critère | Statut |
|---------|--------|
| ≥ 1 événement post-H5-D2 | **NON** |
| 100 % `employee_id` | N/A (0 ligne) |
| 0 orphelin / 0 conflit / 0 perte vue | Vacuous (0) |
| Schéma H5-D2 OK | Oui |
| Tests ciblés verts | Oui |
| **H5-D stable sur données réelles** | **NON** |

Ce n’est **pas** un échec technique de H5-D2.  
Cela signifie seulement qu’**aucune preuve réelle** n’est encore disponible.

---

## 9. Protections

| Domaine | Statut |
|---------|--------|
| H5-E / H5-F / H4 | Non démarrés / non touchés |
| Feature / SaaS 1B.2 | Non |
| Staging écriture | Aucune |
| Production | Interdite |
| V1 | 51 % |

---

## 10. Critères manquants pour H5-D3 VALIDÉ

1. Au moins un (idéalement plusieurs) événement(s) Horodateur créés **en usage réel** post-H5-D2 sur staging.  
2. Matrices post-D2 non vacuous : `employee_id` 100 %, 0 orphelin, 0 conflit, parité vue.  
3. Relancer observation H5-D3 (ou équivalent) après trafic.

---

## 11. Prochaine étape unique

Attendre **trafic réel staging** puis **rejouer observation H5-D3** — **pas** H5-E sans nouveau GO Martin ; **pas** DROP `user_id`.
