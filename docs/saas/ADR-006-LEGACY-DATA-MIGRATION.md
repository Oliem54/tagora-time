# ADR-006 — Legacy data migration

**Statut :** accepté (SaaS 0)  
**Date :** 2026-07-12

---

## Objectif

Décrire comment les données **existantes** (mono-tenant de fait) basculent dans le modèle multi-tenant **sans** hard-delete et **sans** perdre les IDs.

**Aucune migration exécutée dans SaaS 0.**

---

## Organisation legacy

| Champ | Valeur proposée |
|-------|-----------------|
| Nom | Groupe Oliem |
| Slug | `groupe-oliem` (provisoire) |
| Rôle | Tenant unique recevant le backfill de la base actuelle |
| Compagnies internes | Oliem Solutions ; Produits Industriels Titan |

Toutes les lignes métier actuelles sans `organization_id` seront rattachées à cette organisation après création (SaaS 1).

---

## Mapping compagnies

| Valeur legacy (`company_context` / `primary_company` / …) | `internal_companies` |
|----------------------------------------------------------|----------------------|
| `oliem_solutions` | Oliem Solutions |
| `titan_produits_industriels` | Produits Industriels Titan |
| `all` / null (selon table) | Règle par table documentée à l’implémentation (souvent « org-wide » ou compagnie primaire employé) |

Les colonnes texte legacy peuvent coexister temporairement avec `internal_company_id` pendant la transition.

---

## Conservation des IDs

- Conserver les UUID / bigint existants (`chauffeurs.id`, `compensation_events.id`, etc.).
- Pas de rebuild d’IDs pour « faire propre ».
- Les FKs actuelles restent valides ; on **ajoute** `organization_id`.

---

## Stratégie progressive

```
1. Créer organizations + org legacy
2. ADD COLUMN organization_id NULL
3. Backfill SET organization_id = '<groupe-oliem-id>'
4. Vérifications (counts, orphelins, samples)
5. SET NOT NULL + FK + indexes
6. Ensuite seulement : RLS org-aware (SaaS 2)
```

Ordre de backfill recommandé (dépendances) :

1. `chauffeurs` / comptes liés  
2. configs (`gps_bases`, effectifs directories, punch zones)  
3. événements ops (horodateur, livraisons, GPS)  
4. finance (commissions, compensation, temps/paie)  
5. journaux d’audit  

---

## Vérifications

- `COUNT(*)` avant/après  
- `COUNT(*) FILTER (WHERE organization_id IS NULL) = 0` avant NOT NULL  
- Échantillon cross-check compagnies  
- Smoke tests app sur tenant legacy  

---

## Rollback

- Garder `organization_id` nullable jusqu’à validation Martin  
- Rollback = remettre policies précédentes + laisser colonne (pas de DROP destructif précipité)  
- **Absence de hard-delete** des lignes métier pendant la bascule  

---

## Données QA

Les événements QA-S9-TEST annulés restent dans le tenant legacy (traçabilité). Le simulateur reste staging-only.

---

## Conséquences

- Un futur client ≠ Groupe Oliem démarre avec org **vide**, compagnies à configurer, **sans** enum plateforme Oliem/Titan.
- Scripts type `bootstrap-founder-admin.mjs` ne font pas partie du chemin client final.
