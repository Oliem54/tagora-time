import type { AccrualDraft } from "@/app/lib/commissions/accruals.shared";
import type { CompensationCalculationContext } from "@/app/lib/commissions/compensation-calculation-context.shared";
import type {
  CalculationLineResult,
  CompensationCalculationResult,
} from "@/app/lib/commissions/compensation-calculation.shared";

function buildAccrualLabel(
  context: CompensationCalculationContext,
  line: CalculationLineResult
): string {
  const assignee = context.calculation_params.assignee_label?.trim();
  const parts = [line.rule_name];
  if (assignee) parts.push(assignee);
  return parts.join(" — ");
}

export function generateAccrualDraftsFromCalculation(
  context: CompensationCalculationContext,
  calculation: CompensationCalculationResult
): AccrualDraft[] {
  if (calculation.skipped || calculation.lines.length === 0) {
    return [];
  }

  return calculation.lines.map((line) => ({
    compensation_event_id: context.event.id,
    component: line.component,
    rule_name: line.rule_name,
    label: buildAccrualLabel(context, line),
    sales_basis_amount: line.sales_basis_amount,
    calculated_amount: line.calculated_amount,
    status: "estimated" as const,
    period_start: context.calculation_params.period_start ?? null,
    period_end: context.calculation_params.period_end ?? null,
  }));
}
