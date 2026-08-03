# Architecture V1 — Pay plans de compensation génériques

**Statut :** gelé (Bloc 6E.1)
**Branche d’implantation :** `feature/v1-continuation-after-tenant-bridge`
**Contrats TypeScript :** `src/app/lib/commissions/generic-pay-plan-contracts.ts`
**Production :** interdite par ce document

---

## 1. Objectifs

Fournir un générateur de pay plans :

- multi-tenant (UUID d’organisation canonique) ;
- modulaire (modules de règles combinables) ;
- versionné (immuable après activation) ;
- réutilisable (un template → plusieurs employés) ;
- configurable par affectation (overrides) ;
- simple en mode guidé, puissant en mode avancé ;
- sans logique liée à un employé nommé.

Les plans métiers réels (exemples externes de représentants) servent uniquement de **cas d’acceptation** : ils doivent être reproductibles par configuration, jamais par code nominatif.

---

## 2. Principes multi-tenant

- Toute entité porte `organization_uuid`.
- Aucun accès cross-tenant.
- Aucun accès anonyme.
- Les permissions se résolvent dans le périmètre de l’organisation.
- Le bridge tenant UUID / RLS existant reste la source d’autorité pour l’isolation.

---

## 3. Template, version, modules

| Concept | Rôle |
|--------|------|
| **Template** | Modèle réutilisable (nom, description, statut) |
| **Version** | Instantané immuable après activation (`effective_from` obligatoire) |
| **Rule module** | Unité de calcul générique (`PayPlanRuleKind`) + configuration |
| **Condition** | Portées / filtres (classe de compte, catégorie, canal, etc.) |
| **Value** | Paramètres numériques ou structurés du module |

Aucun identifiant technique ne doit contenir un nom d’employé.

---

## 4. Affectation et overrides

| Concept | Rôle |
|--------|------|
| **Assignment** | Lien employé × organisation × version (+ scopes entreprise / produit / classe) |
| **Override** | Valeurs propres à l’affectation ; n’altère pas le template ni la version |
| **Priority** | Entier ≥ 0 ; sert au diagnostic, **pas** à élire un gagnant silencieux |

Confirmations gelées :

- un même template peut être assigné à plusieurs employés ;
- plusieurs plans actifs par employé sont possibles si les portées sont disjointes ;
- la migration d’un employé vers une nouvelle version est **explicite**.

---

## 5. Priorités et conflits

**Comportement par défaut :** `block_and_require_admin_review`

Si deux affectations actives correspondent à la même vente / ligne :

1. aucun plan ne gagne automatiquement ;
2. aucun calcul payable n’est généré ;
3. un conflit est créé ;
4. une revue Admin est obligatoire ;
5. la décision est journalisée ;
6. aucune double commission n’est permise.

---

## 6. Permissions

Permissions génériques (pas obligatoirement un `app_role` global) :

| Permission | Intention |
|------------|-----------|
| `commission_plan_template_manage` | Créer / versionner des templates |
| `commission_plan_assign` | Affecter / suspendre |
| `commission_sale_create` | Créer des ventes |
| `commission_sale_assign` / `commission_sale_reassign` | Attribution / réaffectation |
| `commission_calculation_review` | Revue des calculs |
| `commission_approve` | Approbation métier |
| `commission_accounting` | Profit / marge / confirmation comptable / paie |
| `commission_payment_confirm` | Confirmer le versement payé |
| `commission_adjustment_create` | Ajustements / reprises |
| `commission_export` | Exports officiels |
| `commission_audit_read` | Lecture du journal |

`commission_accounting` peut être attribuée à un Admin, un responsable paie, un comptable, ou tout utilisateur explicitement autorisé — **sans** tous les pouvoirs Admin.

---

## 7. Versionnement

| Règle | Valeur |
|-------|--------|
| Version active immuable | `true` |
| Changement → nouvelle version | `true` |
| Nouvelle date d’entrée en vigueur | `true` |
| Migration employés explicite | `true` |
| Recalcul périodes fermées interdit | `true` |
| Configuration historique préservée | `true` |

---

## 8. Audit

Tout événement significatif (activation, affectation, conflit, override, suppression training) doit être auditable : auteur, horodatage, avant/après lorsque pertinent.

---

## 9. Anti-doublon

Identités génériques :

- **Véhicule :** `organization_uuid + company_id + stock_number`
- **Pièces / accessoires :** `organization_uuid + company_id + invoice_number + invoice_line_number`

Une seule commission principale par identité. Corrections / crédits / retours = mouvements liés. Commission payée verrouillée.

---

## 10. Entraînement

| Règle | Valeur |
|-------|--------|
| Visible employé / Admin / comptabilité | `true` |
| Payable | `false` |
| Compte pour paliers / bonus / avance | `false` |
| Export officiel | `false` |
| Suppression | Admin + audit |

Libellé UI obligatoire : **ENTRAÎNEMENT — NON PAYABLE**

---

## 11. Simplicité UI et mode avancé

- Mode simple par défaut (assistant guidé, langage clair, grandes cibles, une action primaire).
- Mode avancé Admin seulement (priorités, conditions imbriquées, paliers rétroactifs, avances, conflits, versionnement).
- Le mode avancé n’est jamais obligatoire pour un plan simple.

---

## 12. Transition des tables 6D

Décision Martin :

- futures structures : **template / version / assignment / override** ;
- tables 6D actuelles (`employee_compensation_plans` et associées) : **conservées temporairement en lecture seule** pendant la transition ;
- aucune suppression ni migration 6D dans le bloc 6E.1 ;
- le contrat 6E.1 ne remplace pas encore le schéma 6D.

---

## 13. Classes de compte

Les classes sont des **codes configurables** (`account_class_code: string`), pas une union figée aux noms métier.

Exemple de donnée (pas de code) : `account_class_code = "golf"`.

---

## 14. Cas d’acceptation métier (exemples externes)

Deux exemples métier réels (représentants terrain) démontrent que le moteur générique peut couvrir :

- montants fixes par unité, pourcentages, paliers rétroactifs, bonus mensuels/annuels, ouverture de compte, classes de compte, marge, ventes partagées ;
- avances récupérables (/26), waterfall, profit progressif, minimum garanti, bonus additifs, double confirmation Admin + comptabilité.

Ces exemples **ne sont pas** des structures techniques, tables, rule kinds, ni branches de code.

---

## 15. Sous-blocs suivants (6E.2 → 6E.16)

| Bloc | Objet |
|------|--------|
| 6E.2 | Modèle de données tenant UUID |
| 6E.3 | Templates et versions |
| 6E.4 | Modules de règles |
| 6E.5 | Ventes et anti-doublon |
| 6E.6 | Moteur de calcul |
| 6E.7 | Affectations et partage |
| 6E.8 | Ajustements et reprises |
| 6E.9 | Avances récupérables |
| 6E.10 | Périodes et lots de paie |
| 6E.11 | Interface simple guidée |
| 6E.12 | Mode avancé |
| 6E.13 | Tableaux employé / Admin |
| 6E.14 | Exports |
| 6E.15 | Configuration des cas d’acceptation (données) |
| 6E.16 | Preview QA et staging contrôlé |

Chaque bloc : Production interdite sauf GO Martin explicite.
