import type {
  CommissionBasis,
  CommissionRuleRow,
  CommissionTier,
  ObjectiveStatus,
  SalesObjectiveRow,
  TargetType,
} from "@/app/lib/commissions/commissions.shared";
import {
  isValidCommissionRuleCombination,
  normalizeCommissionBasis,
  normalizeRuleType,
} from "@/app/lib/commissions/commissions.shared";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireFiniteNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} doit être un nombre fini.`);
  }
  return parsed;
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

/**
 * Résout la base de commission explicitement.
 * Ne dépend PAS de target_type.
 */
export function resolveCommissionBasis(
  objective: Pick<SalesObjectiveRow, "achieved_amount" | "achieved_sales_count">,
  commissionBasis: CommissionBasis | unknown
): number {
  const basis = normalizeCommissionBasis(commissionBasis);
  if (!basis) {
    throw new Error("Base de calcul de commission inconnue.");
  }

  if (basis === "achieved_amount") {
    return requireFiniteNumber(objective.achieved_amount, "achieved_amount");
  }

  return requireFiniteNumber(objective.achieved_sales_count, "achieved_sales_count");
}

type CalculateRuleInput = Pick<
  CommissionRuleRow,
  | "rule_type"
  | "commission_basis"
  | "fixed_amount"
  | "percentage_rate"
  | "per_unit_amount"
  | "tier_config"
  | "achievement_bonus_amount"
  | "is_active"
>;

/**
 * Calcule la commission pour une règle à partir d'une base déjà résolue.
 * fixed ignore la base. per_unit exige basis = unités + per_unit_amount > 0.
 */
export function calculateRuleCommission(
  rule: CalculateRuleInput,
  salesBasisAmount: number,
  objectiveAchieved: boolean
) {
  if (!rule.is_active) return 0;

  const ruleType = normalizeRuleType(rule.rule_type);
  if (!ruleType) {
    throw new Error("Type de règle de commission inconnu.");
  }

  const commissionBasis = normalizeCommissionBasis(rule.commission_basis);
  if (!commissionBasis) {
    throw new Error("Base de calcul de commission inconnue.");
  }

  if (!isValidCommissionRuleCombination(ruleType, commissionBasis)) {
    throw new Error("Combinaison rule_type / commission_basis invalide.");
  }

  const basis = requireFiniteNumber(salesBasisAmount, "base de commission");
  if (basis < 0) {
    throw new Error("La base de commission ne peut pas être négative.");
  }

  let amount = 0;

  if (ruleType === "fixed") {
    amount = requireFiniteNumber(rule.fixed_amount, "fixed_amount");
  } else if (ruleType === "percentage") {
    const rate = requireFiniteNumber(rule.percentage_rate, "percentage_rate");
    amount = basis * (rate / 100);
  } else if (ruleType === "tier_bonus") {
    for (const tier of parseTierConfig(rule.tier_config)) {
      if (basis >= tier.threshold) {
        amount += tier.bonus_amount;
      }
    }
  } else if (ruleType === "per_unit") {
    if (commissionBasis !== "achieved_sales_count") {
      throw new Error("Le mode par unité exige la base unités réalisées.");
    }
    if (rule.per_unit_amount == null) {
      throw new Error("per_unit_amount est requis pour le mode par unité.");
    }
    const perUnit = requireFiniteNumber(rule.per_unit_amount, "per_unit_amount");
    if (perUnit <= 0) {
      throw new Error("per_unit_amount doit être strictement supérieur à 0.");
    }
    amount = basis * perUnit;
  }

  if (objectiveAchieved && rule.achievement_bonus_amount != null) {
    amount += requireFiniteNumber(rule.achievement_bonus_amount, "achievement_bonus_amount");
  }

  return roundMoney(amount);
}

/**
 * @deprecated Ne pas utiliser pour le choix de base.
 * Wrapper rétrocompatible pour la route de recalcul (bloc 3).
 * Retourne toujours achieved_amount (comportement historique défectueux pour sales_count).
 */
export function salesBasisForObjective(
  objective: Pick<SalesObjectiveRow, "target_type" | "achieved_amount">
) {
  return toNumber(objective.achieved_amount);
}

export function normalizeTargetType(value: unknown): TargetType | null {
  if (value === "amount" || value === "sales_count") return value;
  return null;
}
