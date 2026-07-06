import type { CompensationEvent } from "@/app/lib/commissions/compensation-events.shared";
import {
  evaluateSaleEventEligibility,
  type EligibilityResult,
} from "@/app/lib/commissions/eligibility.server";
import type {
  CalculationRulePhase1,
  CompensationCalculationParams,
} from "@/app/lib/commissions/compensation-calculation.shared";
import { parseCalculationRulesPhase1 } from "@/app/lib/commissions/compensation-calculation.shared";

export type CompensationCalculationContext = {
  event: CompensationEvent & { id: string };
  eligibility: EligibilityResult;
  rules: CalculationRulePhase1[];
  sales_basis_amount: number;
  calculation_params: CompensationCalculationParams;
  is_calculable: boolean;
  rejection_reason: string | null;
};

export type BuildCompensationCalculationContextInput = {
  event: CompensationEvent & { id: string };
  rules?: unknown;
  params?: CompensationCalculationParams;
};

export type BuildCompensationCalculationContextResult =
  | { ok: true; context: CompensationCalculationContext }
  | { ok: false; errors: string[] };

function normalizeSalesBasis(amount: unknown): number {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function validateRules(rules: CalculationRulePhase1[]): string[] {
  const errors: string[] = [];

  for (const [index, rule] of rules.entries()) {
    if (!rule.is_active) continue;
    if (rule.rule_type === "fixed") {
      if (rule.fixed_amount == null || !Number.isFinite(rule.fixed_amount)) {
        errors.push(`Regle ${index + 1}: montant fixe invalide.`);
      } else if (rule.component !== "correction" && rule.fixed_amount < 0) {
        errors.push(`Regle ${index + 1}: montant fixe invalide.`);
      }
    }
    if (rule.rule_type === "percentage" && (rule.percentage_rate == null || rule.percentage_rate < 0)) {
      errors.push(`Regle ${index + 1}: pourcentage invalide.`);
    }
  }

  return errors;
}

export function buildCompensationCalculationContext(
  input: BuildCompensationCalculationContextInput
): BuildCompensationCalculationContextResult {
  if (!input.event.id?.trim()) {
    return { ok: false, errors: ["Compensation event id requis pour le calcul."] };
  }

  const rules = parseCalculationRulesPhase1(input.rules ?? []);
  const ruleErrors = validateRules(rules);
  if (ruleErrors.length > 0) {
    return { ok: false, errors: ruleErrors };
  }

  const eligibility = evaluateSaleEventEligibility(input.event);
  const sales_basis_amount = normalizeSalesBasis(input.event.amount);
  const calculation_params: CompensationCalculationParams = {
    objective_achieved: input.params?.objective_achieved === true,
    period_start: input.params?.period_start ?? null,
    period_end: input.params?.period_end ?? null,
    assignee_label: input.params?.assignee_label ?? null,
  };

  const is_calculable = eligibility.is_eligible;

  return {
    ok: true,
    context: {
      event: input.event,
      eligibility,
      rules,
      sales_basis_amount,
      calculation_params,
      is_calculable,
      rejection_reason: is_calculable ? null : eligibility.rejection_reason,
    },
  };
}
