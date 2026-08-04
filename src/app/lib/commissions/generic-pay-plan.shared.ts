/**
 * Bloc 6F — Helpers purs pour le parcours pay plan générique.
 * Aucune I/O. Compatible avec les tables 6E.2A et events/accruals existants.
 */

import {
  validateTemplateCode,
  validateTemplateName,
  type PayPlanRuleKind,
} from "@/app/lib/commissions/generic-pay-plan-contracts";

export const GENERIC_PAY_PLAN_TRACE_PREFIX = "qa_6f_";

export type GenericPayPlanCalcInput = {
  ruleKind: PayPlanRuleKind | string;
  saleAmount: number;
  ratePercent: number | null;
  fixedAmount: number | null;
  minimumVolume: number | null;
  tierThresholdFrom: number | null;
  tierRatePercent: number | null;
  tierAmount: number | null;
};

export type GenericPayPlanCalcResult =
  | {
      ok: true;
      eligible: true;
      basisAmount: number;
      ratePercent: number | null;
      fixedAmount: number | null;
      calculatedAmount: number;
      explanation: string;
    }
  | {
      ok: true;
      eligible: false;
      basisAmount: number;
      calculatedAmount: 0;
      explanation: string;
    }
  | { ok: false; error: string };

export type GenericPayPlanTrace = {
  template_id: string;
  template_code: string;
  template_name: string;
  version_id: string;
  version_number: number;
  rule_module_id: string;
  rule_kind: string;
  rule_name: string;
  assignment_id: string;
  employee_id: number;
  organization_id: string;
  basis_amount: number;
  rate_percent: number | null;
  fixed_amount: number | null;
  calculated_amount: number;
  event_id: string;
  accrual_id: string;
  processed_at: string;
};

/** Miroir applicatif de public.normalize_pay_plan_code. */
export function normalizePayPlanCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_]{1,64}$/.test(normalized)) return null;
  return normalized;
}

export function validateAndNormalizeTemplateCode(
  value: unknown
): { ok: true; code: string } | { ok: false; error: string } {
  const code = normalizePayPlanCode(value);
  if (!code) {
    return {
      ok: false,
      error: "Code invalide. Utilisez a-z, 0-9 et _ (max 64).",
    };
  }
  const validated = validateTemplateCode(code);
  if (!validated.ok) return validated;
  return { ok: true, code };
}

export function validatePlanDisplayName(
  value: unknown
): { ok: true; name: string } | { ok: false; error: string } {
  const checked = validateTemplateName(value);
  if (!checked.ok) return checked;
  return { ok: true, name: String(value).trim() };
}

export function calculateGenericPayPlanAmount(
  input: GenericPayPlanCalcInput
): GenericPayPlanCalcResult {
  if (!Number.isFinite(input.saleAmount) || input.saleAmount < 0) {
    return { ok: false, error: "Montant de vente invalide." };
  }

  if (
    input.minimumVolume != null &&
    Number.isFinite(input.minimumVolume) &&
    input.saleAmount < input.minimumVolume
  ) {
    return {
      ok: true,
      eligible: false,
      basisAmount: input.saleAmount,
      calculatedAmount: 0,
      explanation: `Vente sous le volume minimum (${input.minimumVolume}).`,
    };
  }

  if (input.ruleKind === "percentage_of_eligible_sales") {
    const rate =
      input.tierRatePercent != null && Number.isFinite(input.tierRatePercent)
        ? input.tierRatePercent
        : input.ratePercent;
    if (rate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      return { ok: false, error: "Taux de commission invalide." };
    }
    if (
      input.tierThresholdFrom != null &&
      Number.isFinite(input.tierThresholdFrom) &&
      input.saleAmount < input.tierThresholdFrom
    ) {
      return {
        ok: true,
        eligible: false,
        basisAmount: input.saleAmount,
        calculatedAmount: 0,
        explanation: `Vente sous le seuil du palier (${input.tierThresholdFrom}).`,
      };
    }
    const calculated = roundMoney((input.saleAmount * rate) / 100);
    return {
      ok: true,
      eligible: true,
      basisAmount: input.saleAmount,
      ratePercent: rate,
      fixedAmount: null,
      calculatedAmount: calculated,
      explanation: `${rate} % de ${input.saleAmount.toFixed(2)} = ${calculated.toFixed(2)}`,
    };
  }

  if (input.ruleKind === "fixed_amount_per_unit") {
    const amount =
      input.tierAmount != null && Number.isFinite(input.tierAmount)
        ? input.tierAmount
        : input.fixedAmount;
    if (amount == null || !Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: "Montant fixe invalide." };
    }
    if (
      input.tierThresholdFrom != null &&
      Number.isFinite(input.tierThresholdFrom) &&
      input.saleAmount < input.tierThresholdFrom
    ) {
      return {
        ok: true,
        eligible: false,
        basisAmount: input.saleAmount,
        calculatedAmount: 0,
        explanation: `Vente sous le seuil du palier (${input.tierThresholdFrom}).`,
      };
    }
    const calculated = roundMoney(amount);
    return {
      ok: true,
      eligible: true,
      basisAmount: input.saleAmount,
      ratePercent: null,
      fixedAmount: calculated,
      calculatedAmount: calculated,
      explanation: `Montant fixe ${calculated.toFixed(2)}`,
    };
  }

  return {
    ok: false,
    error: "Seules les règles pourcentage ou montant fixe sont supportées en V1.",
  };
}

export function encodeGenericPayPlanTrace(trace: GenericPayPlanTrace): string {
  return JSON.stringify(trace);
}

export function decodeGenericPayPlanTrace(
  value: unknown
): GenericPayPlanTrace | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<GenericPayPlanTrace>;
    if (
      typeof parsed.template_id !== "string" ||
      typeof parsed.version_id !== "string" ||
      typeof parsed.rule_module_id !== "string" ||
      typeof parsed.organization_id !== "string" ||
      typeof parsed.calculated_amount !== "number"
    ) {
      return null;
    }
    return parsed as GenericPayPlanTrace;
  } catch {
    return null;
  }
}

export function buildQaExternalReference(suffix: string): string {
  const clean = suffix.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  return `${GENERIC_PAY_PLAN_TRACE_PREFIX}${clean || "run"}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
