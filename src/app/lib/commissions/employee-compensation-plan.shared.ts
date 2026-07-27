/**
 * Bloc 6D Phase 1 — Plans de rémunération employés (modèle + résolution pure).
 *
 * Indépendant du moteur de calcul et de l’UI.
 * Réutilise: organization_id (6B), catégories (6B), origines (6A/6C).
 * Les types CommissionPlan* de commission-plan.shared.ts restent le contrat wizard 6A;
 * ce module est le contrat persistant (category_id uuid, versionnement DB).
 */

import {
  normalizeCurrencyCode,
  normalizeOrganizationId,
  isCategorySelectableForNewPlan,
  type CommissionCategoryRow,
} from "@/app/lib/commissions/commission-catalog.shared";
import {
  normalizeClientCommercialOrigin,
  resolveClientOriginForV1Plan,
  type ClientCommercialOrigin,
} from "@/app/lib/commissions/commission-plan.shared";

export type CompensationPlanStatus = "draft" | "active" | "archived";

export type PlanVersionStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "archived"
  | "cancelled";

export type CalculationMethod = "percentage" | "fixed_amount" | "per_unit";

/**
 * Bases officielles auditées (pas d’invention):
 * - net_sales_ex_tax (paramètres org 6B; ≈ net_before_tax métier)
 * - achieved_amount (moteur legacy)
 * - achieved_sales_count (moteur / quantité)
 */
export type PlanCalculationBasis =
  | "net_sales_ex_tax"
  | "achieved_amount"
  | "achieved_sales_count";

export const PLAN_CALCULATION_BASIS_VALUES: readonly PlanCalculationBasis[] = [
  "net_sales_ex_tax",
  "achieved_amount",
  "achieved_sales_count",
] as const;

export type PlanResolutionStatus =
  | "resolved"
  | "missing_plan"
  | "ambiguous"
  | "rejected";

export type CompensationPlan = {
  id: string;
  organization_id: string;
  employee_id: number;
  plan_code: string;
  name: string;
  description: string | null;
  status: CompensationPlanStatus;
  current_version_id: string | null;
};

export type CompensationPlanVersion = {
  id: string;
  organization_id: string;
  plan_id: string;
  version_number: number;
  status: PlanVersionStatus;
  effective_from: string;
  effective_to: string | null;
  published_at: string | null;
  published_by: string | null;
  notes: string | null;
};

export type CompensationPlanRule = {
  id: string;
  organization_id: string;
  plan_version_id: string;
  category_id: string;
  /** null = toutes les origines */
  commercial_origin: ClientCommercialOrigin | null;
  calculation_basis: PlanCalculationBasis;
  calculation_method: CalculationMethod;
  rate_percent: number | null;
  fixed_amount: number | null;
  per_unit_amount: number | null;
  currency_code: string | null;
  min_amount: number | null;
  max_amount: number | null;
  display_order: number;
  is_active: boolean;
};

export type PlanResolutionResult = {
  plan_id: string | null;
  plan_version_id: string | null;
  version_number: number | null;
  resolution_status: PlanResolutionStatus;
  source: "version" | "none";
  requires_review: boolean;
};

const PLAN_CODE_RE = /^[a-z0-9_]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeCalculationMethod(
  value: unknown
): CalculationMethod | null {
  if (
    value === "percentage" ||
    value === "fixed_amount" ||
    value === "per_unit"
  ) {
    return value;
  }
  return null;
}

export function normalizePlanCalculationBasis(
  value: unknown
): PlanCalculationBasis | null {
  if (
    value === "net_sales_ex_tax" ||
    value === "achieved_amount" ||
    value === "achieved_sales_count"
  ) {
    return value;
  }
  return null;
}

/** company_developed conservé; moteur V1 futur → existing. */
export function mapCommercialOriginForPlan(
  origin: ClientCommercialOrigin | null
): "existing" | "employee_developed" | "all" | null {
  if (origin == null) return "all";
  if (origin === "company_developed") {
    return resolveClientOriginForV1Plan(origin);
  }
  if (origin === "existing" || origin === "employee_developed") return origin;
  return null;
}

export function canEditPlanVersion(
  version: Pick<CompensationPlanVersion, "status">
): boolean {
  return version.status === "draft";
}

/**
 * Plage [effective_from, effective_to) — effective_to exclusif.
 * Null effective_to = ouvert.
 */
export function doPlanVersionPeriodsOverlap(
  a: Pick<CompensationPlanVersion, "effective_from" | "effective_to" | "status">,
  b: Pick<CompensationPlanVersion, "effective_from" | "effective_to" | "status">
): boolean {
  const applicable = (s: string) =>
    s === "active" || s === "scheduled" || s === "archived";
  if (!applicable(a.status) || !applicable(b.status)) return false;
  const aTo = a.effective_to ?? "9999-12-31";
  const bTo = b.effective_to ?? "9999-12-31";
  return a.effective_from < bTo && b.effective_from < aTo;
}

export function isPlanVersionApplicableOnDate(
  version: Pick<
    CompensationPlanVersion,
    "status" | "effective_from" | "effective_to"
  >,
  eventDate: string
): boolean {
  if (version.status === "draft" || version.status === "cancelled") return false;
  if (version.effective_from > eventDate) return false;
  if (version.effective_to != null && !(eventDate < version.effective_to)) {
    return false;
  }
  return true;
}

export function canTransitionPlanVersionStatus(
  from: PlanVersionStatus,
  to: PlanVersionStatus
): boolean {
  if (from === to) return true;
  if (from === "draft") return to === "scheduled" || to === "active" || to === "cancelled";
  if (from === "scheduled") return to === "active" || to === "cancelled";
  if (from === "active") return to === "archived";
  return false;
}

export function validateCompensationPlan(input: {
  organization_id: unknown;
  employee_id: unknown;
  plan_code: unknown;
  name: unknown;
  employee_organization_id?: unknown;
}): { ok: true } | { ok: false; error: string } {
  const org = normalizeOrganizationId(input.organization_id);
  if (!org) return { ok: false, error: "Identifiant d’organisation invalide." };

  const employeeId = Number(input.employee_id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return { ok: false, error: "Identifiant employé invalide." };
  }

  if (input.employee_organization_id !== undefined) {
    const empOrg = normalizeOrganizationId(input.employee_organization_id);
    if (!empOrg || empOrg !== org) {
      return { ok: false, error: "Employé hors organisation (cross-tenant)." };
    }
  }

  if (
    typeof input.plan_code !== "string" ||
    !PLAN_CODE_RE.test(input.plan_code.trim().toLowerCase())
  ) {
    return { ok: false, error: "Code de plan invalide." };
  }
  if (typeof input.name !== "string" || input.name.trim() === "") {
    return { ok: false, error: "Nom du plan obligatoire." };
  }
  return { ok: true };
}

export function validateCompensationPlanVersion(input: {
  organization_id: unknown;
  plan_id: unknown;
  version_number: unknown;
  status: unknown;
  effective_from: unknown;
  effective_to?: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (!normalizeOrganizationId(input.organization_id)) {
    return { ok: false, error: "Identifiant d’organisation invalide." };
  }
  if (typeof input.plan_id !== "string" || input.plan_id.trim() === "") {
    return { ok: false, error: "Plan requis." };
  }
  const n = Number(input.version_number);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: "Numéro de version invalide." };
  }
  const statuses: PlanVersionStatus[] = [
    "draft",
    "scheduled",
    "active",
    "archived",
    "cancelled",
  ];
  if (
    typeof input.status !== "string" ||
    !statuses.includes(input.status as PlanVersionStatus)
  ) {
    return { ok: false, error: "Statut de version invalide." };
  }
  if (
    typeof input.effective_from !== "string" ||
    !DATE_RE.test(input.effective_from)
  ) {
    return { ok: false, error: "Date de début invalide." };
  }
  if (
    input.effective_to != null &&
    input.effective_to !== "" &&
    (typeof input.effective_to !== "string" ||
      !DATE_RE.test(input.effective_to) ||
      input.effective_to <= input.effective_from)
  ) {
    return {
      ok: false,
      error: "Date de fin doit être strictement postérieure au début (borne exclusive).",
    };
  }
  return { ok: true };
}

export function validateCompensationPlanRule(input: {
  organization_id: unknown;
  plan_version_id: unknown;
  category_id: unknown;
  category?: Pick<
    CommissionCategoryRow,
    "organization_id" | "is_active" | "is_visible"
  > | null;
  commercial_origin?: unknown;
  calculation_basis: unknown;
  calculation_method: unknown;
  rate_percent?: unknown;
  fixed_amount?: unknown;
  per_unit_amount?: unknown;
  currency_code?: unknown;
  /** Mode avancé: catégorie masquée mais active autorisée. */
  advanced_mode?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const org = normalizeOrganizationId(input.organization_id);
  if (!org) return { ok: false, error: "Identifiant d’organisation invalide." };
  if (
    typeof input.plan_version_id !== "string" ||
    input.plan_version_id.trim() === ""
  ) {
    return { ok: false, error: "Version de plan requise." };
  }
  if (typeof input.category_id !== "string" || input.category_id.trim() === "") {
    return { ok: false, error: "Catégorie requise." };
  }

  if (input.category) {
    if (normalizeOrganizationId(input.category.organization_id) !== org) {
      return { ok: false, error: "Catégorie hors organisation (cross-tenant)." };
    }
    if (!isCategorySelectableForNewPlan(input.category)) {
      return {
        ok: false,
        error: "Catégorie inactive non sélectionnable pour une nouvelle règle.",
      };
    }
    if (
      !input.advanced_mode &&
      input.category.is_visible === false &&
      input.category.is_active
    ) {
      // Masquée: refusée hors mode avancé; permise si advanced_mode
      return {
        ok: false,
        error: "Catégorie masquée: utilisez la configuration avancée.",
      };
    }
  }

  if (input.commercial_origin != null && input.commercial_origin !== "") {
    if (!normalizeClientCommercialOrigin(input.commercial_origin)) {
      return { ok: false, error: "Origine commerciale invalide." };
    }
  }

  const basis = normalizePlanCalculationBasis(input.calculation_basis);
  if (!basis) return { ok: false, error: "Base de calcul invalide." };

  const method = normalizeCalculationMethod(input.calculation_method);
  if (!method) return { ok: false, error: "Méthode de calcul invalide." };

  const rate =
    input.rate_percent == null || input.rate_percent === ""
      ? null
      : Number(input.rate_percent);
  const fixed =
    input.fixed_amount == null || input.fixed_amount === ""
      ? null
      : Number(input.fixed_amount);
  const perUnit =
    input.per_unit_amount == null || input.per_unit_amount === ""
      ? null
      : Number(input.per_unit_amount);

  if (method === "percentage") {
    if (rate == null || !Number.isFinite(rate)) {
      return { ok: false, error: "Pourcentage requis." };
    }
    if (rate < 0) return { ok: false, error: "Pourcentage négatif refusé." };
    if (rate > 100) {
      return { ok: false, error: "Pourcentage maximal: 100." };
    }
    if (fixed != null || perUnit != null) {
      return { ok: false, error: "Méthode percentage: un seul montant autorisé." };
    }
    if (input.currency_code != null && input.currency_code !== "") {
      return {
        ok: false,
        error: "Devise non applicable pour un pourcentage.",
      };
    }
  }
  if (method === "fixed_amount") {
    if (fixed == null || !Number.isFinite(fixed)) {
      return { ok: false, error: "Montant fixe requis." };
    }
    if (fixed < 0) return { ok: false, error: "Montant négatif refusé." };
    if (rate != null || perUnit != null) {
      return { ok: false, error: "Méthode fixed_amount: un seul montant autorisé." };
    }
    if (!normalizeCurrencyCode(input.currency_code)) {
      return { ok: false, error: "Devise ISO obligatoire pour un montant fixe." };
    }
  }
  if (method === "per_unit") {
    if (perUnit == null || !Number.isFinite(perUnit)) {
      return { ok: false, error: "Montant unitaire requis." };
    }
    if (perUnit < 0) return { ok: false, error: "Montant négatif refusé." };
    if (rate != null || fixed != null) {
      return { ok: false, error: "Méthode per_unit: un seul montant autorisé." };
    }
    if (!normalizeCurrencyCode(input.currency_code)) {
      return {
        ok: false,
        error: "Devise ISO obligatoire pour un montant unitaire.",
      };
    }
  }

  return { ok: true };
}

/**
 * Résout la version applicable à une date.
 * Chevauchement → ambiguous (jamais le « plus récent » silencieux).
 */
export function resolveApplicablePlanVersion(input: {
  organization_id: string;
  employee_id: number;
  event_date: string;
  plan: CompensationPlan | null;
  versions: readonly CompensationPlanVersion[];
  actor_organization_ids?: readonly string[];
}): PlanResolutionResult {
  const missing = (): PlanResolutionResult => ({
    plan_id: null,
    plan_version_id: null,
    version_number: null,
    resolution_status: "missing_plan",
    source: "none",
    requires_review: false,
  });

  const org = normalizeOrganizationId(input.organization_id);
  if (!org || !DATE_RE.test(input.event_date)) {
    return { ...missing(), resolution_status: "rejected", requires_review: true };
  }

  if (input.actor_organization_ids) {
    const allowed = input.actor_organization_ids
      .map((id) => normalizeOrganizationId(id))
      .filter((id): id is string => Boolean(id));
    if (!allowed.includes(org)) {
      return { ...missing(), resolution_status: "rejected", requires_review: true };
    }
  }

  const plan = input.plan;
  if (
    !plan ||
    normalizeOrganizationId(plan.organization_id) !== org ||
    plan.employee_id !== input.employee_id
  ) {
    return missing();
  }

  if (normalizeOrganizationId(plan.organization_id) !== org) {
    return { ...missing(), resolution_status: "rejected", requires_review: true };
  }

  const candidates = input.versions.filter((v) => {
    if (normalizeOrganizationId(v.organization_id) !== org) return false;
    if (v.plan_id !== plan.id) return false;
    return isPlanVersionApplicableOnDate(v, input.event_date);
  });

  if (candidates.length === 0) return missing();
  if (candidates.length > 1) {
    return {
      plan_id: plan.id,
      plan_version_id: null,
      version_number: null,
      resolution_status: "ambiguous",
      source: "none",
      requires_review: true,
    };
  }

  const chosen = candidates[0]!;
  return {
    plan_id: plan.id,
    plan_version_id: chosen.id,
    version_number: chosen.version_number,
    resolution_status: "resolved",
    source: "version",
    requires_review: false,
  };
}

export function detectPlanVersionOverlaps(
  versions: readonly CompensationPlanVersion[]
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < versions.length; i += 1) {
    for (let j = i + 1; j < versions.length; j += 1) {
      const a = versions[i]!;
      const b = versions[j]!;
      if (a.plan_id !== b.plan_id) continue;
      if (doPlanVersionPeriodsOverlap(a, b)) {
        pairs.push([a.id, b.id]);
      }
    }
  }
  return pairs;
}

export function clonePlanVersion(input: {
  source: CompensationPlanVersion;
  source_rules: readonly CompensationPlanRule[];
  new_version_id: string;
  new_version_number: number;
  effective_from: string;
  created_by?: string | null;
}): {
  version: CompensationPlanVersion;
  rules: CompensationPlanRule[];
} {
  const version: CompensationPlanVersion = {
    id: input.new_version_id,
    organization_id: input.source.organization_id,
    plan_id: input.source.plan_id,
    version_number: input.new_version_number,
    status: "draft",
    effective_from: input.effective_from,
    effective_to: null,
    published_at: null,
    published_by: null,
    notes: input.source.notes,
  };

  const rules = input.source_rules.map((rule, index) => ({
    ...rule,
    id: `${input.new_version_id}-rule-${index + 1}`,
    plan_version_id: input.new_version_id,
  }));

  return { version, rules };
}
