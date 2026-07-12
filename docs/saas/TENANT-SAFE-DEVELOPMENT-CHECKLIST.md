# TENANT-SAFE-DEVELOPMENT-CHECKLIST

**Statut :** obligatoire pour tout PR touchant données métier ou auth, à compter de la validation SaaS 0  
**Date :** 2026-07-12

> Le produit n’est **pas encore** multi-tenant. Cette checklist empêche d’aggraver la dette et prépare SaaS 1–2.

---

## Avant merge — cocher tout ce qui s’applique

### Données et schéma

- [ ] Si nouvelle table métier : colonne `organization_id` prévue (ou justification écrite « plateforme pure » / « hors tenant »)
- [ ] Si nouvelle contrainte UNIQUE : elle est **tenant-scoped** `(organization_id, …)` ou justification
- [ ] Aucun nouveau CHECK / enum figé `oliem_solutions` / `titan_produits_industriels`
- [ ] Aucun nouveau hardcode client (noms, emails `@oliem.ca`, adresses, IDs magiques)

### API / serveur

- [ ] Filtre tenant côté API (dès que `organization_id` existe) — **pas** de requête globale « par erreur »
- [ ] `createAdminSupabaseClient` (service role) : justifié + filtre org appliqué (ou job plateforme documenté)
- [ ] Entitlement module vérifié **côté serveur** si la route appartient à un module add-on/Premium (dès SaaS 3)
- [ ] Pas de fuite PII / salaires / commissions / GPS dans logs, erreurs client, exports

### Sécurité

- [ ] RLS tenant-aware prévue ou ticket suivi (pas de nouvelle table métier sans plan RLS)
- [ ] Fail closed si contexte org absent (dès SaaS 1)
- [ ] Tests cross-tenant ajoutés ou mis à jour (dès SaaS 2) : org A ≠ org B

### Produit / UI

- [ ] Décision UI appliquée à **toutes** les pages concernées (pas un one-off)
- [ ] Module non inclus : pas de data derrière une URL directe
- [ ] Simulateur QA / outils staging : gates staging-only conservés
- [ ] Libellés : pas de nouveau « Titan/Oliem » comme marque plateforme

### Migrations

- [ ] Nom de fichier `YYYYMMDDHHMMSS_*.sql`
- [ ] Pas de `migration repair` dans le PR sans validation Martin
- [ ] Seed : pas d’injection Oliem/Titan comme défaut universel

### Confidentialité

- [ ] Salaires / rémunération : accès restreint finance + module
- [ ] Livre de commissions : grants + module Premium respectés
- [ ] GPS : module + rôles respectés

---

## Exceptions

Toute exception doit être :

1. documentée dans le PR ;
2. limitée dans le temps ;
3. approuvée Martin si elle touche isolation, finance, ou hardcode client.
