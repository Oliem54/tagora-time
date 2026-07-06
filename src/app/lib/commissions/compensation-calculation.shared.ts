import type {
  CommissionTier,
  CompensationComponent,
  RuleType,
} from "@/app/lib/commissions/commissions.shared";

export type CalculationRulePhase1 = {
  rule_name: string;
  rule_type: RuleType;
  fixed_amount: number | null;
  percentage_rate: number | null;
  tier_config: CommissionTier[];
  achievement_bonus_amount: number | null;
  is_active: boolean;
  component?: CompensationComponent;
};

export type CompensationCalculationParams = {
  objective_achieved?: boolean;
  period_start?: string | null;
  period_end?: string | null;
  assignee_label?: string | null;
};

export type CalculationLineResult = {
  rule_name: string;
  component: CompensationComponent;
  sales_basis_amount: number;
  calculated_amount: number;
};

export type CompensationCalculationResult = {
  lines: CalculationLineResult[];
  skipped: boolean;
  rejection_reason: string | null;
};

function asNumber(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeCalculationRulePhase1(raw: Record<string, unknown>): CalculationRulePhase1 | null {
  const rule_type =
    raw.rule_type === "percentage" || raw.rule_type === "tier_bonus" || raw.rule_type === "fixed"
      ? raw.rule_type
      : null;
  if (!rule_type) return null;

  const rule_name = asOptionalText(raw.rule_name) ?? "Commission";
  const component =
    raw.component === "bonus" || raw.component === "correction" || raw.component === "commission"
      ? raw.component
      : "commission";

  const tier_config = Array.isArray(raw.tier_config)
    ? raw.tier_config.filter((item) => item && typeof item === "object")
    : [];

  return {
    rule_name,
    rule_type,
    fixed_amount: rule_type === "fixed" ? asNumber(raw.fixed_amount) : null,
    percentage_rate: rule_type === "percentage" ? asNumber(raw.percentage_rate) : null,
    tier_config: tier_config as CommissionTier[],
    achievement_bonus_amount: asNumber(raw.achievement_bonus_amount),
    is_active: raw.is_active !== false,
    component,
  };
}

export function parseCalculationRulesPhase1(raw: unknown): CalculationRulePhase1[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) =>
      item && typeof item === "object" ? normalizeCalculationRulePhase1(item as Record<string, unknown>) : null
    )
    .filter((item): item is CalculationRulePhase1 => item !== null);
}
