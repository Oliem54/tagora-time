# ADR-004 — Tenant data boundary

**Statut :** accepté (SaaS 0)  
**Date :** 2026-07-12

---

## Objectif

Définir la frontière technique d’isolation des données. **Non implémenté** à ce stade : contrat pour SaaS 1–2.

---

## Règles de schéma

1. **`organization_id` obligatoire** (en fin de migration) sur toute table métier contenant des données client.
2. **FK** vers `organizations(id)` (ON DELETE restreint ou cascade contrôlée — décision fine en SaaS 1 ; pas de hard-delete client silencieux).
3. **Index** `(organization_id)` et indexes composites démarrant par `organization_id` sur les chemins chauds.
4. **Unicités tenant-scoped** : remplacer les UNIQUE globaux ambigus par `UNIQUE (organization_id, …)`.
   - Exemple actuel à revoir : `horodateur_shifts (employee_id, work_date)`, `horodateur_punch_zones.zone_key`, templates `(template_key, channel, audience)`.

### Stratégie colonnes

`nullable → backfill → NOT NULL` (ADR-006). Aucun big-bang NOT NULL sans vérification.

---

## RLS (cible)

Pour chaque table métier :

| Opération | Règle |
|-----------|--------|
| SELECT | `organization_id = current_organization_id()` (+ règles rôle/permission) |
| INSERT | force `organization_id` = org active ; refuse autre org |
| UPDATE | même org ; colonnes sensibles selon rôle |
| DELETE | même org ; soft-delete préféré pour données financières / audit |

**Fail closed :**

- pas d’org dans le contexte → **aucune** ligne
- policy manquante → table inaccessible aux clients JWT (comportement déjà vu sur certaines tables « RLS on / no policy »)

Les policies **rôle-only** actuelles (sans org) sont **insuffisantes** et devront être remplacées ou composées.

---

## Service role

Fichier actuel : `src/app/lib/supabase/admin.ts` (`createAdminSupabaseClient`) — utilisé par **~100+** routes API.

### Règles cibles

1. Service role **autorisé** pour crons / webhooks / jobs internes.
2. Toute requête service role sur données métier **doit** filtrer `organization_id` (sauf job plateforme multi-org explicitement listé et audité).
3. Interdit : `select *` cross-tenant « par commodité ».
4. Secrets : jamais commités ; `SUPABASE_SERVICE_ROLE_KEY` hors client.

---

## Jobs internes

Exemples actuels à reclasser :

- `src/app/api/internal/horodateur/*`
- `src/app/api/internal/ramassages/check-overdue`
- `src/app/api/internal/resend/test`

Cible : auth secret + boucle **par organisation** (ou org passée en paramètre), logs d’exécution.

---

## Audit anti-fuite

À instaurer en SaaS 2+ :

- tests automatiques : user org A ne lit pas org B
- revue PR checklist (`TENANT-SAFE-DEVELOPMENT-CHECKLIST.md`)
- pas de PII / salaires / GPS dans logs applicatifs
- exports et archives ZIP scopés org (`livraisons-ramassages/archives`)

---

## Sensibilité (rappel)

| Niveau | Exemples | Extra contrôles |
|--------|----------|-----------------|
| Critique | `compensation_*`, `commission_*`, `temps_titan` / paie, salaires | module Premium + rôle finance + grants |
| Élevé | `gps_positions`, téléphones, preuves | module GPS / ops + RLS |
| Standard | horaires, livraisons opérationnelles | RLS org + rôle |

---

## Conséquences

- Inventaire table par table : `SAAS-TABLE-INVENTORY.md`
- Aucune table n’est « déjà multi-tenant » tant que `organization_id` + RLS org ne sont pas en place
