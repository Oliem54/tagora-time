/**
 * Bloc 6E.1 — Contrats génériques des pay plans (types + validateurs purs).
 *
 * Aucune I/O, migration, API ni UI.
 * Aucune logique liée à un employé nommé.
 * Compatible avec de futures tables SQL multi-tenant (organization_uuid).
 */

// ---------------------------------------------------------------------------
// Status & enums
// ---------------------------------------------------------------------------

export type PayPlanTemplateStatus = "draft" | "active" | "archived";

export type PayPlanVersionStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "archived"
  | "cancelled";

export type PayPlanAssignmentStatus =
  | "draft"
  | "active"
  | "suspended"
  | "ended";

/**
 * Kinds de modules de règles — identifiants techniques génériques uniquement.
 * Aucun nom d’employé, marque ou entreprise.
 */
export type PayPlanRuleKind =
  | "fixed_amount_per_unit"
  | "percentage_of_eligible_sales"
  | "percentage_of_gross_profit"
  | "minimum_guarantee"
  | "progressive_profit_tiers"
  | "retroactive_volume_tier"
  | "non_retroactive_volume_tier"
  | "monthly_volume_bonus"
  | "annual_volume_bonus"
  | "account_opening_bonus"
  | "full_price_bonus"
  | "financing_bonus"
  | "extended_warranty_bonus"
  | "margin_threshold"
  | "account_class_rate"
  | "product_category_rate"
  | "company_rate"
  | "sales_channel_rate"
  | "shared_sale_split"
  | "recoverable_advance"
  | "advance_waterfall"
  | "adjustment"
  | "reversal"
  | "credit"
  | "return"
  | "manual_approval"
  | "accounting_confirmation"
  | "training_entry_exclusion";

export const PAY_PLAN_RULE_KINDS: readonly PayPlanRuleKind[] = [
  "fixed_amount_per_unit",
  "percentage_of_eligible_sales",
  "percentage_of_gross_profit",
  "minimum_guarantee",
  "progressive_profit_tiers",
  "retroactive_volume_tier",
  "non_retroactive_volume_tier",
  "monthly_volume_bonus",
  "annual_volume_bonus",
  "account_opening_bonus",
  "full_price_bonus",
  "financing_bonus",
  "extended_warranty_bonus",
  "margin_threshold",
  "account_class_rate",
  "product_category_rate",
  "company_rate",
  "sales_channel_rate",
  "shared_sale_split",
  "recoverable_advance",
  "advance_waterfall",
  "adjustment",
  "reversal",
  "credit",
  "return",
  "manual_approval",
  "accounting_confirmation",
  "training_entry_exclusion",
] as const;

export type PayPlanScopeKind =
  | "organization"
  | "company"
  | "product_category"
  | "account_class"
  | "sales_channel"
  | "employee";

/** Classe de compte = code configurable (ex. donnée "golf"), jamais une union nominative. */
export type PayPlanAccountClass = {
  account_class_id: string;
  account_class_code: string;
  display_name: string;
  organization_uuid: string;
  is_active: boolean;
};

export type PayPlanApprovalRequirement =
  | "none"
  | "admin"
  | "accounting"
  | "admin_or_accounting"
  | "admin_then_accounting";

export type PayPlanProcessingFrequency =
  | "biweekly"
  | "monthly"
  | "per_sale"
  | "custom";

export type PayPlanConflictResolution =
  | "block_and_require_admin_review"
  | "resolved_keep_assignment"
  | "resolved_end_assignment"
  | "resolved_manual";

export const DEFAULT_OVERLAP_BEHAVIOR: PayPlanConflictResolution =
  "block_and_require_admin_review";

export type PayPlanEntryMode = "official" | "training";

export type PayPlanCalculationState =
  | "not_eligible"
  | "blocked_conflict"
  | "blocked_conditions"
  | "provisional"
  | "pending_approval"
  | "pending_accounting"
  | "payable"
  | "applied_to_advance"
  | "paid"
  | "reversed";

export type PayPlanAdjustmentKind =
  | "positive_adjustment"
  | "negative_reversal"
  | "credit"
  | "return"
  | "accounting_correction";

/**
 * Permissions génériques — résolues par organisation.
 * `commission_accounting` est une permission, pas obligatoirement un app_role global.
 */
export type PayPlanPermission =
  | "commission_plan_template_manage"
  | "commission_plan_assign"
  | "commission_sale_create"
  | "commission_sale_assign"
  | "commission_sale_reassign"
  | "commission_calculation_review"
  | "commission_approve"
  | "commission_accounting"
  | "commission_payment_confirm"
  | "commission_adjustment_create"
  | "commission_export"
  | "commission_audit_read";

export const PAY_PLAN_PERMISSIONS: readonly PayPlanPermission[] = [
  "commission_plan_template_manage",
  "commission_plan_assign",
  "commission_sale_create",
  "commission_sale_assign",
  "commission_sale_reassign",
  "commission_calculation_review",
  "commission_approve",
  "commission_accounting",
  "commission_payment_confirm",
  "commission_adjustment_create",
  "commission_export",
  "commission_audit_read",
] as const;

// ---------------------------------------------------------------------------
// Core entities (serializable)
// ---------------------------------------------------------------------------

export type GenericPayPlanTemplate = {
  id: string;
  organization_uuid: string;
  template_code: string;
  name: string;
  description: string | null;
  status: PayPlanTemplateStatus;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GenericPayPlanVersion = {
  id: string;
  organization_uuid: string;
  template_id: string;
  version_number: number;
  status: PayPlanVersionStatus;
  effective_from: string;
  effective_to: string | null;
  published_at: string | null;
  published_by: string | null;
  notes: string | null;
  /** Une fois active, la version est immuable. */
  is_immutable: boolean;
};

export type GenericPayPlanRuleValue = {
  /** Montants / taux selon le kind — structure sérialisable. */
  amount?: number | null;
  rate_percent?: number | null;
  currency_code?: string | null;
  min_amount?: number | null;
  max_amount?: number | null;
  /** Paliers : [{ from: number, to: number | null, value: number }] */
  tiers?: Array<{
    from: number;
    to: number | null;
    value: number;
  }> | null;
  split_percent?: number | null;
  advance_annual_amount?: number | null;
  advance_period_divisor?: number | null;
  retroactive?: boolean | null;
  cumulative?: boolean | null;
  metadata?: Record<string, string | number | boolean | null> | null;
};

export type GenericPayPlanRuleCondition = {
  id: string;
  scope_kind: PayPlanScopeKind;
  account_class_code?: string | null;
  product_category_id?: string | null;
  company_id?: string | null;
  sales_channel?: string | null;
  requires_invoice?: boolean;
  requires_delivery?: boolean;
  requires_full_payment?: boolean;
  requires_no_return?: boolean;
  requires_no_credit?: boolean;
  requires_no_dispute?: boolean;
  requires_full_price?: boolean;
  requires_financing?: boolean;
  requires_extended_warranty?: boolean;
  min_margin_percent?: number | null;
};

export type GenericPayPlanRuleModule = {
  id: string;
  organization_uuid: string;
  version_id: string;
  rule_kind: PayPlanRuleKind;
  display_order: number;
  is_active: boolean;
  approval_requirement: PayPlanApprovalRequirement;
  calculation_priority: number;
  conditions: GenericPayPlanRuleCondition[];
  value: GenericPayPlanRuleValue;
};

export type GenericPayPlanScope = {
  organization_uuid: string;
  company_ids: string[];
  product_category_ids: string[];
  account_class_codes: string[];
  sales_channels: string[];
  employee_id: number | null;
  effective_from: string;
  effective_to: string | null;
  priority: number;
};

export type GenericPayPlanAssignmentOverride = {
  id: string;
  assignment_id: string;
  field_key: string;
  value: string | number | boolean | null;
  reason: string | null;
};

export type GenericPayPlanAssignment = {
  id: string;
  organization_uuid: string;
  employee_id: number;
  template_id: string;
  version_id: string;
  status: PayPlanAssignmentStatus;
  processing_frequency: PayPlanProcessingFrequency;
  scope: GenericPayPlanScope;
  overrides: GenericPayPlanAssignmentOverride[];
  created_at: string;
  updated_at: string;
};

export type GenericPayPlanConflictStatus =
  | "open"
  | "under_admin_review"
  | "resolved";

export type GenericPayPlanConflict = {
  id: string;
  organization_uuid: string;
  sale_id: string | null;
  sale_line_id: string | null;
  assignment_ids: string[];
  conflicting_scope_summary: string;
  status: GenericPayPlanConflictStatus;
  reason: string;
  detected_at: string;
  resolution: PayPlanConflictResolution | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
};

export type GenericPayPlanApprovalGate = {
  requirement: PayPlanApprovalRequirement;
  admin_approved: boolean;
  accounting_approved: boolean;
  approved_by_admin: string | null;
  approved_by_accounting: string | null;
};

export type GenericPayPlanTrainingPolicy = {
  visible_to_owner: true;
  visible_to_admin: true;
  visible_to_accounting: true;
  payable: false;
  counts_for_tiers: false;
  counts_for_bonuses: false;
  affects_advance: false;
  included_in_official_export: false;
  user_label: "ENTRAÎNEMENT — NON PAYABLE";
};

export const DEFAULT_TRAINING_POLICY: GenericPayPlanTrainingPolicy = {
  visible_to_owner: true,
  visible_to_admin: true,
  visible_to_accounting: true,
  payable: false,
  counts_for_tiers: false,
  counts_for_bonuses: false,
  affects_advance: false,
  included_in_official_export: false,
  user_label: "ENTRAÎNEMENT — NON PAYABLE",
};

export type GenericPayPlanVersionPolicy = {
  active_version_immutable: true;
  change_requires_new_version: true;
  new_effective_date_required: true;
  employee_migration_explicit: true;
  closed_period_recalculation_forbidden: true;
  historical_configuration_preserved: true;
};

export const DEFAULT_VERSION_POLICY: GenericPayPlanVersionPolicy = {
  active_version_immutable: true,
  change_requires_new_version: true,
  new_effective_date_required: true,
  employee_migration_explicit: true,
  closed_period_recalculation_forbidden: true,
  historical_configuration_preserved: true,
};

/** Représente un changement de version (contrat, pas d’I/O). */
export type GenericPayPlanVersionChangeRequest = {
  organization_uuid: string;
  template_id: string;
  source_version_id: string;
  new_version_number: number;
  new_effective_from: string;
  selected_assignment_ids: string[];
  change_reason: string;
  changed_by: string;
};

export type GenericPayPlanSaleIdentity =
  | {
      kind: "vehicle";
      organization_uuid: string;
      company_id: string;
      stock_number: string;
    }
  | {
      kind: "parts_line";
      organization_uuid: string;
      company_id: string;
      invoice_number: string;
      invoice_line_number: string;
    };

export type GenericPayPlanSplitShare = {
  employee_id: number;
  percent: number;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Pure validators (no I/O)
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEMPLATE_CODE_RE = /^[a-z0-9_]{1,64}$/;

export function isPayPlanRuleKind(value: unknown): value is PayPlanRuleKind {
  return (
    typeof value === "string" &&
    (PAY_PLAN_RULE_KINDS as readonly string[]).includes(value)
  );
}

export function isPayPlanPermission(
  value: unknown
): value is PayPlanPermission {
  return (
    typeof value === "string" &&
    (PAY_PLAN_PERMISSIONS as readonly string[]).includes(value)
  );
}

/** Refuse d’utiliser un identifiant d’employé comme rule kind. */
export function assertRuleKindIsNotEmployeeIdentifier(
  value: string
): ValidationResult {
  if (/^employee[-_]?\d+$/i.test(value) || /^\d+$/.test(value)) {
    return {
      ok: false,
      error: "Un identifiant d’employé ne peut pas servir de rule kind.",
    };
  }
  if (!isPayPlanRuleKind(value)) {
    return { ok: false, error: "Rule kind générique inconnu." };
  }
  return { ok: true };
}

export function validateTemplateName(name: unknown): ValidationResult {
  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, error: "Le modèle doit avoir un nom." };
  }
  if (name.trim().length > 120) {
    return { ok: false, error: "Le nom du modèle est trop long." };
  }
  return { ok: true };
}

export function validateTemplateCode(code: unknown): ValidationResult {
  if (typeof code !== "string" || !TEMPLATE_CODE_RE.test(code)) {
    return {
      ok: false,
      error: "Code de modèle invalide (a-z, 0-9, _, max 64).",
    };
  }
  return { ok: true };
}

export function validateActiveVersionHasEffectiveDate(
  version: Pick<GenericPayPlanVersion, "status" | "effective_from">
): ValidationResult {
  if (version.status !== "active" && version.status !== "scheduled") {
    return { ok: true };
  }
  if (
    typeof version.effective_from !== "string" ||
    !DATE_RE.test(version.effective_from)
  ) {
    return {
      ok: false,
      error: "Une version active ou planifiée exige une date d’entrée en vigueur.",
    };
  }
  return { ok: true };
}

export function validateActiveVersionImmutable(
  version: Pick<GenericPayPlanVersion, "status" | "is_immutable">,
  attemptingMutation: boolean
): ValidationResult {
  if (
    attemptingMutation &&
    (version.status === "active" || version.is_immutable)
  ) {
    return {
      ok: false,
      error:
        "Une version active est immuable : créez une nouvelle version.",
    };
  }
  return { ok: true };
}

export function validateAssignmentIdentity(
  assignment: Pick<
    GenericPayPlanAssignment,
    "employee_id" | "organization_uuid" | "version_id"
  >
): ValidationResult {
  if (
    !Number.isInteger(assignment.employee_id) ||
    assignment.employee_id <= 0
  ) {
    return { ok: false, error: "L’affectation exige un employé valide." };
  }
  if (
    typeof assignment.organization_uuid !== "string" ||
    assignment.organization_uuid.trim().length === 0
  ) {
    return {
      ok: false,
      error: "L’affectation exige une organisation.",
    };
  }
  if (
    typeof assignment.version_id !== "string" ||
    assignment.version_id.trim().length === 0
  ) {
    return { ok: false, error: "L’affectation exige une version de plan." };
  }
  return { ok: true };
}

export function validatePriority(priority: unknown): ValidationResult {
  if (
    typeof priority !== "number" ||
    !Number.isFinite(priority) ||
    !Number.isInteger(priority) ||
    priority < 0
  ) {
    return {
      ok: false,
      error: "La priorité doit être un entier supérieur ou égal à 0.",
    };
  }
  return { ok: true };
}

export function validateSplitPercents(
  shares: GenericPayPlanSplitShare[]
): ValidationResult {
  if (!Array.isArray(shares) || shares.length === 0) {
    return { ok: false, error: "La répartition exige au moins une part." };
  }
  let total = 0;
  for (const share of shares) {
    if (
      !Number.isInteger(share.employee_id) ||
      share.employee_id <= 0 ||
      typeof share.percent !== "number" ||
      !Number.isFinite(share.percent) ||
      share.percent <= 0 ||
      share.percent > 100
    ) {
      return { ok: false, error: "Part de répartition invalide." };
    }
    total += share.percent;
  }
  if (Math.abs(total - 100) > 0.0001) {
    return {
      ok: false,
      error: "La répartition doit totaliser exactement 100 %.",
    };
  }
  return { ok: true };
}

export function validateNumericCoherence(
  value: GenericPayPlanRuleValue
): ValidationResult {
  const nums = [
    value.amount,
    value.rate_percent,
    value.min_amount,
    value.max_amount,
    value.split_percent,
    value.advance_annual_amount,
    value.advance_period_divisor,
  ];
  for (const n of nums) {
    if (n == null) continue;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Valeur numérique incohérente." };
    }
  }
  if (
    value.min_amount != null &&
    value.max_amount != null &&
    value.min_amount > value.max_amount
  ) {
    return {
      ok: false,
      error: "Le minimum ne peut pas dépasser le maximum.",
    };
  }
  if (value.rate_percent != null && value.rate_percent > 100) {
    return { ok: false, error: "Un pourcentage ne peut pas dépasser 100." };
  }
  if (value.tiers) {
    for (const tier of value.tiers) {
      if (
        typeof tier.from !== "number" ||
        !Number.isFinite(tier.from) ||
        tier.from < 0 ||
        typeof tier.value !== "number" ||
        !Number.isFinite(tier.value) ||
        tier.value < 0 ||
        (tier.to != null &&
          (typeof tier.to !== "number" ||
            !Number.isFinite(tier.to) ||
            tier.to < tier.from))
      ) {
        return { ok: false, error: "Palier numérique incohérent." };
      }
    }
  }
  return { ok: true };
}

export function validateTrainingEntryNotPayable(
  entryMode: PayPlanEntryMode,
  calculationState: PayPlanCalculationState
): ValidationResult {
  if (entryMode === "training" && calculationState === "payable") {
    return {
      ok: false,
      error: "Une entrée d’entraînement ne peut pas être payable.",
    };
  }
  if (entryMode === "training" && calculationState === "paid") {
    return {
      ok: false,
      error: "Une entrée d’entraînement ne peut pas être payée.",
    };
  }
  return { ok: true };
}

export type AssignmentOverlapInput = {
  id: string;
  employee_id: number;
  status: PayPlanAssignmentStatus;
  scope: Pick<
    GenericPayPlanScope,
    | "organization_uuid"
    | "company_ids"
    | "product_category_ids"
    | "account_class_codes"
    | "sales_channels"
    | "effective_from"
    | "effective_to"
    | "priority"
  >;
};

export type SaleMatchContext = {
  organization_uuid: string;
  employee_id: number;
  company_id: string;
  product_category_id: string;
  account_class_code: string;
  sales_channel: string;
  sale_date: string;
};

function dateInRange(
  date: string,
  from: string,
  to: string | null
): boolean {
  if (date < from) return false;
  if (to != null && date > to) return false;
  return true;
}

function listMatchesOrEmpty(
  allowed: string[],
  value: string
): boolean {
  return allowed.length === 0 || allowed.includes(value);
}

export function assignmentMatchesSale(
  assignment: AssignmentOverlapInput,
  sale: SaleMatchContext
): boolean {
  if (assignment.status !== "active") return false;
  if (assignment.employee_id !== sale.employee_id) return false;
  if (assignment.scope.organization_uuid !== sale.organization_uuid) {
    return false;
  }
  if (
    !dateInRange(
      sale.sale_date,
      assignment.scope.effective_from,
      assignment.scope.effective_to
    )
  ) {
    return false;
  }
  if (!listMatchesOrEmpty(assignment.scope.company_ids, sale.company_id)) {
    return false;
  }
  if (
    !listMatchesOrEmpty(
      assignment.scope.product_category_ids,
      sale.product_category_id
    )
  ) {
    return false;
  }
  if (
    !listMatchesOrEmpty(
      assignment.scope.account_class_codes,
      sale.account_class_code
    )
  ) {
    return false;
  }
  if (
    !listMatchesOrEmpty(assignment.scope.sales_channels, sale.sales_channel)
  ) {
    return false;
  }
  return true;
}

/**
 * Détecte un chevauchement : aucun winner automatique.
 * Retourne les assignment_ids en conflit (0, 1 ou N).
 */
export function detectOverlappingAssignments(
  assignments: AssignmentOverlapInput[],
  sale: SaleMatchContext
): string[] {
  return assignments
    .filter((a) => assignmentMatchesSale(a, sale))
    .map((a) => a.id);
}

export function validateNoSilentWinnerOnOverlap(
  matchingAssignmentIds: string[]
): ValidationResult {
  if (matchingAssignmentIds.length <= 1) return { ok: true };
  return {
    ok: false,
    error:
      "Chevauchement d’affectations : calcul bloqué, revue Admin obligatoire.",
  };
}

export function buildOverlapConflict(input: {
  organization_uuid: string;
  sale_id: string | null;
  sale_line_id: string | null;
  matching_assignment_ids: string[];
  detected_at: string;
}): GenericPayPlanConflict | null {
  if (input.matching_assignment_ids.length <= 1) return null;
  return {
    id: `conflict-${input.detected_at}-${input.matching_assignment_ids.join("-")}`,
    organization_uuid: input.organization_uuid,
    sale_id: input.sale_id,
    sale_line_id: input.sale_line_id,
    assignment_ids: [...input.matching_assignment_ids],
    conflicting_scope_summary: "overlapping_active_assignments",
    status: "open",
    reason: "Plusieurs affectations actives correspondent à la même vente.",
    detected_at: input.detected_at,
    resolution: null,
    resolved_by: null,
    resolved_at: null,
    resolution_notes: null,
  };
}

export function validateVersionChangeRequest(
  request: GenericPayPlanVersionChangeRequest
): ValidationResult {
  if (!DATE_RE.test(request.new_effective_from)) {
    return {
      ok: false,
      error: "La nouvelle version exige une date d’entrée en vigueur.",
    };
  }
  if (request.change_reason.trim().length === 0) {
    return { ok: false, error: "Une raison de changement est obligatoire." };
  }
  if (request.changed_by.trim().length === 0) {
    return { ok: false, error: "L’auteur du changement est obligatoire." };
  }
  if (request.new_version_number < 1) {
    return { ok: false, error: "Numéro de version invalide." };
  }
  return { ok: true };
}

export function saleIdentityKey(identity: GenericPayPlanSaleIdentity): string {
  if (identity.kind === "vehicle") {
    return [
      "vehicle",
      identity.organization_uuid,
      identity.company_id,
      identity.stock_number,
    ].join("|");
  }
  return [
    "parts_line",
    identity.organization_uuid,
    identity.company_id,
    identity.invoice_number,
    identity.invoice_line_number,
  ].join("|");
}
