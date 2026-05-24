import type {
  CommissionRuleRow,
  CommissionTier,
  ObjectiveStatus,
  SalesObjectiveRow,
  TargetType,
} from "@/app/lib/commissions/commissions.shared";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseTierConfig(raw: unknown): CommissionTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const threshold = toNumber(row.threshold, Number.NaN);
      const bonus_amount = toNumber(row.bonus_amount, Number.NaN);
      if (!Number.isFinite(threshold) || !Number.isFinite(bonus_amount)) return null;
      return { threshold, bonus_amount };
    })
    .filter((item): item is CommissionTier => item !== null)
    .sort((a, b) => a.threshold - b.threshold);
}

export function getTargetValue(objective: Pick<SalesObjectiveRow, "target_type" | "target_amount" | "target_sales_count">) {
  if (objective.target_type === "amount") {
    return toNumber(objective.target_amount);
  }
  return toNumber(objective.target_sales_count);
}

export function getAchievedValue(
  objective: Pick<SalesObjectiveRow, "target_type" | "achieved_amount" | "achieved_sales_count">
) {
  if (objective.target_type === "amount") {
    return toNumber(objective.achieved_amount);
  }
  return toNumber(objective.achieved_sales_count);
}

export function computeProgressPercent(
  objective: Pick<
    SalesObjectiveRow,
    "target_type" | "target_amount" | "target_sales_count" | "achieved_amount" | "achieved_sales_count"
  >
) {
  const target = getTargetValue(objective);
  const achieved = getAchievedValue(objective);
  if (target <= 0) return 0;
  return Math.min(100, Math.round((achieved / target) * 1000) / 10);
}

export function deriveObjectiveStatus(
  objective: Pick<
    SalesObjectiveRow,
    | "status"
    | "target_type"
    | "target_amount"
    | "target_sales_count"
    | "achieved_amount"
    | "achieved_sales_count"
    | "period_end"
  >,
  todayIso: string
): ObjectiveStatus {
  if (objective.status === "draft" || objective.status === "cancelled") {
    return objective.status;
  }

  const target = getTargetValue(objective);
  const achieved = getAchievedValue(objective);

  if (target > 0 && achieved >= target) {
    return "achieved";
  }

  if (objective.period_end < todayIso) {
    return achieved > 0 ? "partially_achieved" : "behind";
  }

  if (achieved > 0 && target > 0 && achieved < target) {
    return "partially_achieved";
  }

  return "active";
}

export function calculateRuleCommission(
  rule: Pick<
    CommissionRuleRow,
    | "rule_type"
    | "fixed_amount"
    | "percentage_rate"
    | "tier_config"
    | "achievement_bonus_amount"
    | "is_active"
  >,
  salesBasisAmount: number,
  objectiveAchieved: boolean
) {
  if (!rule.is_active) return 0;

  let amount = 0;
  const basis = Math.max(0, salesBasisAmount);

  if (rule.rule_type === "fixed") {
    amount = toNumber(rule.fixed_amount);
  } else if (rule.rule_type === "percentage") {
    amount = basis * (toNumber(rule.percentage_rate) / 100);
  } else if (rule.rule_type === "tier_bonus") {
    for (const tier of parseTierConfig(rule.tier_config)) {
      if (basis >= tier.threshold) {
        amount += tier.bonus_amount;
      }
    }
  }

  if (objectiveAchieved && rule.achievement_bonus_amount != null) {
    amount += toNumber(rule.achievement_bonus_amount);
  }

  return roundMoney(amount);
}

export function salesBasisForObjective(
  objective: Pick<SalesObjectiveRow, "target_type" | "achieved_amount">
) {
  if (objective.target_type === "amount") {
    return toNumber(objective.achieved_amount);
  }
  return toNumber(objective.achieved_amount);
}

export function normalizeTargetType(value: unknown): TargetType | null {
  if (value === "amount" || value === "sales_count") return value;
  return null;
}
