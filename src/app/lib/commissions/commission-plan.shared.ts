/**
 * Bloc 6A — Contrat métier et modèles internes du Livre de commissions simplifié.
 *
 * Couche pure (types + mapping + validateurs). Aucune I/O, migration, ni UI.
 *
 * Précision plan actif :
 * - Un seul PLAN PRINCIPAL actif par employé à une date donnée.
 * - Ce plan peut contenir plusieurs catégories, lignes, modes et origines.
 * - La contrainte n’implique PAS une seule commission / catégorie / ligne.
 *
 * Mapping UI → moteur :
 * - target_type (cible) et commission_basis (base de calcul) restent indépendants.
 * - Ne jamais déduire commission_basis depuis target_type.
 *
 * Le moteur legacy (RuleType, CommissionBasis, etc.) est préservé et consommé
 * via mapPayModeToEngineRule — sans remplacer les types existants.
 */

import {
  DEFAULT_COMMISSION_BASIS,
  type CommissionBasis,
  type RuleType,
} from "@/app/lib/commissions/commissions.shared";

// ---------------------------------------------------------------------------
// Catégories (catalogue org — clés stables; libellés UI ailleurs)
// ---------------------------------------------------------------------------

export type CommissionCategoryKey =
  | "vehicles"
  | "batteries"
  | "parts"
  | "service_parts"
  | "accessories"
  | "service"
  | "other";

/** Clés V1 visibles dans l’assistant (ordre d’affichage par défaut). */
export const COMMISSION_CATEGORY_V1_KEYS: readonly CommissionCategoryKey[] = [
  "vehicles",
  "batteries",
  "parts",
  "service_parts",
  "accessories",
  "service",
  "other",
] as const;

export const COMMISSION_CATEGORY_V1_LABELS: Record<CommissionCategoryKey, string> = {
  vehicles: "Véhicules",
  batteries: "Batteries",
  parts: "Pièces",
  service_parts: "Pièces de service",
  accessories: "Accessoires",
  service: "Service",
  other: "Autre produit ou service",
};

// ---------------------------------------------------------------------------
// Origine commerciale du client / revendeur
// ---------------------------------------------------------------------------

/**
 * Origines stockées.
 * - existing / employee_developed : visibles V1
 * - company_developed : architecture future; traité comme existing en V1 simple
 */
export type ClientCommercialOrigin =
  | "existing"
  | "employee_developed"
  | "company_developed";

export const CLIENT_COMMERCIAL_ORIGIN_V1_VISIBLE: readonly ClientCommercialOrigin[] = [
  "existing",
  "employee_developed",
] as const;

export const CLIENT_COMMERCIAL_ORIGIN_LABELS: Record<ClientCommercialOrigin, string> = {
  existing: "Client ou revendeur existant de l’entreprise",
  employee_developed: "Client ou revendeur développé par l’employé",
  company_developed: "Client ou revendeur développé directement par l’entreprise",
};

/**
 * Origine effective pour le calcul V1.
 * company_developed → existing (sauf config future différente).
 */
export function resolveClientOriginForV1Plan(
  origin: ClientCommercialOrigin
): "existing" | "employee_developed" {
  if (origin === "employee_developed") return "employee_developed";
  return "existing";
}

// ---------------------------------------------------------------------------
// Admissibilité (explicite — pas un taux 0 % silencieux)
// ---------------------------------------------------------------------------

export type CommissionEligibility = "eligible" | "not_eligible";

// ---------------------------------------------------------------------------
// Modes de rémunération visibles V1 (pas de paliers dans l’assistant)
// ---------------------------------------------------------------------------

export type CommissionPayMode = "none" | "per_unit" | "percentage" | "fixed";

export const COMMISSION_PAY_MODE_V1_VALUES: readonly CommissionPayMode[] = [
  "none",
  "per_unit",
  "percentage",
  "fixed",
] as const;

export const COMMISSION_PAY_MODE_LABELS: Record<CommissionPayMode, string> = {
  none: "Aucune commission",
  per_unit: "Montant par unité",
  percentage: "Pourcentage des ventes",
  fixed: "Montant fixe",
};

// ---------------------------------------------------------------------------
// Statuts plan / revue origine / ajustement / snapshot vente
// ---------------------------------------------------------------------------

export type CommissionPlanStatus = "draft" | "active" | "ended" | "cancelled";

export type SaleOriginReviewStatus = "pending" | "confirmed" | "rejected";

/**
 * Cycle de vie commission côté vente / entrée (métier).
 * Complète CommissionEntryStatus legacy sans le remplacer.
 */
export type CommissionLifecycleStatus =
  | "eligible"
  | "not_eligible"
  | "calculated_zero"
  | "excluded"
  | "estimated"
  | "pending_validation"
  | "paid"
  | "adjusted"
  | "origin_pending";

export type CommissionAdjustmentKind =
  | "return"
  | "cancellation"
  | "credit_note"
  | "manual";

// ---------------------------------------------------------------------------
// Modèles : plan principal → versions → lignes
// ---------------------------------------------------------------------------

/**
 * Plan principal d’un employé.
 * Un seul plan principal ACTIF par employé à une date donnée.
 * Le plan peut contenir N lignes (catégories × origines × modes).
 */
export type CommissionPlan = {
  id: string;
  organization_id: string;
  employee_id: number;
  /** Libellé métier optionnel (ex. « Plan Marie — 2026 »). */
  title: string | null;
  status: CommissionPlanStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

/**
 * Version immuable d’un plan (dates d’application).
 * Les commissions déjà payées/approuvées ne sont pas modifiées par une nouvelle version.
 */
export type CommissionPlanVersion = {
  id: string;
  plan_id: string;
  version_number: number;
  effective_from: string;
  /** Null = ouvert jusqu’au remplacement. */
  effective_to: string | null;
  created_at: string;
  created_by: string | null;
  change_reason: string | null;
  /** Lignes de cette version (plusieurs catégories / modes / origines). */
  lines: CommissionPlanLine[];
};

/**
 * Une ligne de rémunération dans une version de plan.
 * Ex. : Véhicules + client existant + 50 $/unité
 *       Véhicules + client développé + 100 $/unité
 *       Pièces de service + existant + aucune commission
 */
export type CommissionPlanLine = {
  id: string;
  plan_version_id: string;
  category_key: CommissionCategoryKey;
  /**
   * Origine ciblée par cette ligne.
   * Si same_for_all_clients sur le wizard, deux lignes (existing + employee_developed)
   * peuvent être générées avec les mêmes montants.
   */
  client_origin: "existing" | "employee_developed";
  eligibility: CommissionEligibility;
  pay_mode: CommissionPayMode;
  per_unit_amount: number | null;
  percentage_rate: number | null;
  fixed_amount: number | null;
};

// ---------------------------------------------------------------------------
// Snapshot historique sur la vente (origine figée)
// ---------------------------------------------------------------------------

/**
 * Copie figée au moment de la vente — jamais recalculée si la fiche client change.
 * L’origine n’est PAS saisie manuellement sur chaque vente normale :
 * elle est lue depuis la fiche puis copiée ici.
 */
export type SaleCommissionOriginSnapshot = {
  sale_id: string;
  organization_id: string;
  /** Origine lue sur la fiche au moment de la vente. */
  origin_from_profile: ClientCommercialOrigin | null;
  /** Origine effective utilisée pour le calcul (après résolution V1 / confirmation). */
  origin_effective: "existing" | "employee_developed" | null;
  developed_by_employee_id: number | null;
  origin_review_status: SaleOriginReviewStatus | null;
  origin_confirmed_by: string | null;
  origin_confirmed_at: string | null;
  origin_confirm_reason: string | null;
  captured_at: string;
};

// ---------------------------------------------------------------------------
// Ajustement (retours / crédits après paiement)
// ---------------------------------------------------------------------------

export type CommissionAdjustment = {
  id: string;
  organization_id: string;
  employee_id: number;
  source_sale_id: string | null;
  source_entry_id: string | null;
  kind: CommissionAdjustmentKind;
  /** Montant signé (négatif pour récupération). */
  amount: number;
  period_start: string;
  period_end: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

// ---------------------------------------------------------------------------
// Mapping UI (pay_mode) → moteur legacy (rule_type + commission_basis)
// ---------------------------------------------------------------------------

export type EngineRuleMapping =
  | {
      kind: "not_eligible";
      eligibility: "not_eligible";
      rule_type: null;
      commission_basis: null;
      per_unit_amount: null;
      percentage_rate: null;
      fixed_amount: null;
    }
  | {
      kind: "engine_rule";
      eligibility: "eligible";
      rule_type: RuleType;
      commission_basis: CommissionBasis;
      per_unit_amount: number | null;
      percentage_rate: number | null;
      fixed_amount: number | null;
    };

export type MapPayModeInput = {
  pay_mode: CommissionPayMode;
  eligibility?: CommissionEligibility;
  per_unit_amount?: number | null;
  percentage_rate?: number | null;
  fixed_amount?: number | null;
};

export type MapPayModeResult =
  | { ok: true; mapping: EngineRuleMapping }
  | { ok: false; error: string };

/**
 * Traduit un choix d’affaires V1 vers le contrat moteur existant.
 * Ne lit JAMAIS target_type — commission_basis est fixé par le mode de paie.
 */
export function mapPayModeToEngineRule(input: MapPayModeInput): MapPayModeResult {
  const eligibility = input.eligibility ?? deriveEligibilityFromPayMode(input.pay_mode);

  // « Aucune commission » ou non-admissibilité explicite — jamais un simple taux 0 %.
  if (input.pay_mode === "none" || eligibility === "not_eligible") {
    return {
      ok: true,
      mapping: {
        kind: "not_eligible",
        eligibility: "not_eligible",
        rule_type: null,
        commission_basis: null,
        per_unit_amount: null,
        percentage_rate: null,
        fixed_amount: null,
      },
    };
  }

  if (input.pay_mode === "per_unit") {
    const amount = input.per_unit_amount;
    if (amount == null || !Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false,
        error: "Inscrivez un montant supérieur à 0 $ par unité.",
      };
    }
    return {
      ok: true,
      mapping: {
        kind: "engine_rule",
        eligibility: "eligible",
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: amount,
        percentage_rate: null,
        fixed_amount: null,
      },
    };
  }

  if (input.pay_mode === "percentage") {
    const rate = input.percentage_rate;
    if (rate == null || !Number.isFinite(rate) || rate <= 0) {
      return {
        ok: false,
        error: "Inscrivez un pourcentage supérieur à 0.",
      };
    }
    return {
      ok: true,
      mapping: {
        kind: "engine_rule",
        eligibility: "eligible",
        rule_type: "percentage",
        /** Indépendant de target_type — base monétaire des ventes. */
        commission_basis: "achieved_amount",
        per_unit_amount: null,
        percentage_rate: rate,
        fixed_amount: null,
      },
    };
  }

  if (input.pay_mode === "fixed") {
    const fixed = input.fixed_amount;
    if (fixed == null || !Number.isFinite(fixed) || fixed <= 0) {
      return {
        ok: false,
        error: "Inscrivez un montant fixe supérieur à 0 $.",
      };
    }
    return {
      ok: true,
      mapping: {
        kind: "engine_rule",
        eligibility: "eligible",
        rule_type: "fixed",
        /**
         * fixed ignore la base au calcul; on conserve le défaut monétaire
         * pour compatibilité insert / affichage (jamais dérivé de target_type).
         */
        commission_basis: DEFAULT_COMMISSION_BASIS,
        per_unit_amount: null,
        percentage_rate: null,
        fixed_amount: fixed,
      },
    };
  }

  return { ok: false, error: "Mode de rémunération invalide." };
}

export function deriveEligibilityFromPayMode(
  payMode: CommissionPayMode
): CommissionEligibility {
  return payMode === "none" ? "not_eligible" : "eligible";
}

/**
 * Détecte un chevauchement de plans principaux actifs pour un même employé.
 * Ne concerne PAS le nombre de lignes à l’intérieur d’un plan.
 */
export function doPrincipalPlanPeriodsOverlap(a: {
  effective_from: string;
  effective_to: string | null;
}, b: {
  effective_from: string;
  effective_to: string | null;
}): boolean {
  const aFrom = a.effective_from;
  const bFrom = b.effective_from;
  const aTo = a.effective_to ?? "9999-12-31";
  const bTo = b.effective_to ?? "9999-12-31";
  return aFrom <= bTo && bFrom <= aTo;
}

/**
 * Indique si deux lignes du même plan entrent en conflit
 * (même catégorie + même origine effective).
 */
export function doPlanLinesConflict(
  a: Pick<CommissionPlanLine, "category_key" | "client_origin">,
  b: Pick<CommissionPlanLine, "category_key" | "client_origin">
): boolean {
  return a.category_key === b.category_key && a.client_origin === b.client_origin;
}

export function findConflictingPlanLinePairs(
  lines: Array<Pick<CommissionPlanLine, "id" | "category_key" | "client_origin">>
): Array<[string, string]> {
  const conflicts: Array<[string, string]> = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const left = lines[i]!;
      const right = lines[j]!;
      if (doPlanLinesConflict(left, right)) {
        conflicts.push([left.id, right.id]);
      }
    }
  }
  return conflicts;
}

export function normalizeCommissionCategoryKey(
  value: unknown
): CommissionCategoryKey | null {
  if (
    value === "vehicles" ||
    value === "batteries" ||
    value === "parts" ||
    value === "service_parts" ||
    value === "accessories" ||
    value === "service" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

export function normalizeClientCommercialOrigin(
  value: unknown
): ClientCommercialOrigin | null {
  if (
    value === "existing" ||
    value === "employee_developed" ||
    value === "company_developed"
  ) {
    return value;
  }
  return null;
}

export function normalizeCommissionPayMode(
  value: unknown
): CommissionPayMode | null {
  if (
    value === "none" ||
    value === "per_unit" ||
    value === "percentage" ||
    value === "fixed"
  ) {
    return value;
  }
  return null;
}

/**
 * Valide une ligne métier avant mapping moteur.
 * Messages destinés aux utilisateurs (pas de jargon technique).
 */
export function validateCommissionPlanLineInput(input: {
  category_key: unknown;
  client_origin: unknown;
  pay_mode: unknown;
  per_unit_amount?: unknown;
  percentage_rate?: unknown;
  fixed_amount?: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (!normalizeCommissionCategoryKey(input.category_key)) {
    return { ok: false, error: "Choisissez une catégorie valide." };
  }
  const origin = normalizeClientCommercialOrigin(input.client_origin);
  if (origin === "company_developed") {
    return {
      ok: false,
      error: "Ce type de client n’est pas configurable dans le parcours simple.",
    };
  }
  if (origin !== "existing" && origin !== "employee_developed") {
    return { ok: false, error: "Choisissez un type de client valide." };
  }
  const payMode = normalizeCommissionPayMode(input.pay_mode);
  if (!payMode) {
    return { ok: false, error: "Choisissez une façon de payer valide." };
  }

  const mapped = mapPayModeToEngineRule({
    pay_mode: payMode,
    per_unit_amount:
      input.per_unit_amount == null || input.per_unit_amount === ""
        ? null
        : Number(input.per_unit_amount),
    percentage_rate:
      input.percentage_rate == null || input.percentage_rate === ""
        ? null
        : Number(input.percentage_rate),
    fixed_amount:
      input.fixed_amount == null || input.fixed_amount === ""
        ? null
        : Number(input.fixed_amount),
  });
  if (!mapped.ok) return mapped;
  return { ok: true };
}
