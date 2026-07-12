# ADR-007 — Migration strategy

**Statut :** accepté (SaaS 0)  
**Date :** 2026-07-12

---

## Constat actuel (réel)

- **76** fichiers sous `supabase/migrations/`
- Historique **collisionné** : nombreux fichiers au format `YYYYMMDD_HHMMSS_*.sql` interprétés incorrectement par le CLI (préfixe avant le premier `_`)
- Staging (`qokyobcvplzufshydhih`) : tracking réparé manuellement (S9) ; Compensation appliquée de façon ciblée
- Tables **legacy** (`chauffeurs`, `livraisons_planifiees`, `temps_titan`, `dossiers`, …) : souvent **sans CREATE TABLE** dans l’historique → base neuve **non reproductible** fidèlement
- `migration repair` a été utilisé en urgence S9 — **ne doit pas** devenir la méthode courante

Production (`qcgvzdlfsxybrmloijpt`) : hors scope de toute expérimentation.

---

## Décisions

### 1. Convention unique

Tous les **nouveaux** fichiers de migration : **`YYYYMMDDHHMMSS_description.sql`** (timestamp compact Supabase, sans underscore dans la partie version).

### 2. Interdiction repair comme routine

`supabase migration repair` = **exception documentée**, validation Martin, jamais un réflexe de pipeline.

### 3. Baseline

Avant ou pendant SaaS 1, établir une stratégie de **baseline** :

- dump schéma de référence (staging réconcilié ou prod lecture seule / copie)  
- **ou** migration squashed documentée pour environnements neufs  
Objectif : `supabase db reset` / projet neuf applique un schéma cohérent.

### 4. Base neuve reproductible

Critères de sortie (SaaS 1–2) :

- projet Supabase neuf + migrations → app démarre  
- seed **générique** (pas Oliem/Titan comme logique plateforme)  
- org démo optionnelle séparée du seed plateforme  

### 5. Tests automatiques de migrations

À introduire :

- CI : apply migrations on empty Postgres  
- test smoke tables critiques + RLS enable  
- interdit de merger une migration qui casse le reset local  

### 6. Seed générique

- Remplacer / isoler les seeds qui injectent Titan/Oliem comme défauts universels (`scripts/_comm_seed.sql`, templates `titan_billing_*`)
- Seed démo = tenant « Démo » avec compagnies fictives **ou** org Groupe Oliem uniquement en environnement legacy

---

## Environnements

| Env | Règle |
|-----|--------|
| Local | staging credentials ou local Supabase — jamais prod par défaut |
| Staging | laboratoire migrations + QA |
| Production | migrations uniquement après plan écrit + validation Martin |

---

## Lien SaaS

Les premières migrations **tenant** (SaaS 1) doivent respecter cette ADR.  
Pas de migration tenant dans SaaS 0.

---

## Références

- Dossier : `supabase/migrations/`
- Config : `supabase/config.toml`
- Expérience S9 : réparation tracking + application Compensation ciblée (historique conversation / ops)
