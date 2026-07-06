import {
  calculateRuleCommission,
  parseTierConfig,
} from "@/app/lib/commissions/calculate.server";
import type { CompensationCalculationContext } from "@/app/lib/commissions/compensation-calculation-context.shared";
import type {
  CalculationLineResult,
  CompensationCalculationResult,
} from "@/app/lib/commissions/compensation-calculation.shared";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateCompensationFromContext(
  context: CompensationCalculationContext
): CompensationCalculationResult {
  if (!context.is_calculable) {
    return {
      lines: [],
      skipped: true,
      rejection_reason: context.rejection_reason,
    };
  }

  const lines: CalculationLineResult[] = [];
  const basis = context.sales_basis_amount;
  const objectiveAchieved = context.calculation_params.objective_achieved === true;

  for (const rule of context.rules) {
    if (!rule.is_active) continue;

    const component = rule.component ?? "commission";
    const ruleForCalculation = {
      rule_type: rule.rule_type,
      fixed_amount: rule.fixed_amount,
      percentage_rate: rule.percentage_rate,
      tier_config: parseTierConfig(rule.tier_config),
      achievement_bonus_amount: null,
      is_active: true,
    };

    const calculated_amount = calculateRuleCommission(ruleForCalculation, basis, false);

    if (calculated_amount !== 0) {
      lines.push({
        rule_name: rule.rule_name,
        component,
        sales_basis_amount: basis,
        calculated_amount,
      });
    }

    if (objectiveAchieved && rule.achievement_bonus_amount != null && rule.achievement_bonus_amount > 0) {
      lines.push({
        rule_name: `${rule.rule_name} — bonus atteinte`,
        component: "bonus",
        sales_basis_amount: basis,
        calculated_amount: roundMoney(rule.achievement_bonus_amount),
      });
    }
  }

  return {
    lines,
    skipped: false,
    rejection_reason: null,
  };
}
