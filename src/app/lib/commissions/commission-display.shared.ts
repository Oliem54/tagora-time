import {
  COMMISSION_BASIS_LABELS,
  DEFAULT_COMMISSION_BASIS,
  RULE_TYPE_LABELS,
  formatCad,
  formatCommissionBasisDisplay,
  normalizeCommissionBasis,
  normalizeRuleType,
  resolveAggregateCommissionBasisKind,
  type AggregateCommissionBasisKind,
  type CommissionBasis,
  type CommissionTier,
  type RuleType,
  type TargetType,
} from "@/app/lib/commissions/commissions.shared";

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  amount: "Montant de ventes",
  sales_count: "Nombre d’unités vendues",
};

export function formatTargetTypeLabel(targetType: unknown): string {
  if (targetType === "amount") return TARGET_TYPE_LABELS.amount;
  if (targetType === "sales_count") return TARGET_TYPE_LABELS.sales_count;
  return "Type de cible inconnu";
}

export function formatUnitsCount(value: number): string {
  const units = Math.trunc(Number.isFinite(value) ? value : 0);
  return `${units} unité${units === 1 ? "" : "s"}`;
}

export function formatTargetValue(objective: {
  target_type: unknown;
  target_amount?: number | null;
  target_sales_count?: number | null;
}): string {
  if (objective.target_type === "sales_count") {
    return formatUnitsCount(objective.target_sales_count ?? 0);
  }
  return formatCad(objective.target_amount ?? 0);
}

export function formatAchievedValue(objective: {
  target_type: unknown;
  achieved_amount?: number | null;
  achieved_sales_count?: number | null;
}): string {
  if (objective.target_type === "sales_count") {
    return formatUnitsCount(objective.achieved_sales_count ?? 0);
  }
  return formatCad(objective.achieved_amount ?? 0);
}

export function formatRuleTypeLabel(ruleType: unknown): string {
  const normalized = normalizeRuleType(ruleType);
  if (normalized) return RULE_TYPE_LABELS[normalized];
  if (ruleType == null || ruleType === "") return "Mode non précisé";
  return "Mode inconnu";
}

export function formatCommissionBasisLabel(
  commissionBasis: CommissionBasis | null | undefined
): string {
  if (commissionBasis == null) {
    return COMMISSION_BASIS_LABELS[DEFAULT_COMMISSION_BASIS];
  }
  const normalized = normalizeCommissionBasis(commissionBasis);
  if (!normalized) return COMMISSION_BASIS_LABELS[DEFAULT_COMMISSION_BASIS];
  return COMMISSION_BASIS_LABELS[normalized];
}

export function formatTierThreshold(
  threshold: number,
  commissionBasis: CommissionBasis | null | undefined
): string {
  const resolved =
    commissionBasis == null
      ? DEFAULT_COMMISSION_BASIS
      : (normalizeCommissionBasis(commissionBasis) ?? DEFAULT_COMMISSION_BASIS);
  if (resolved === "achieved_sales_count") {
    return formatUnitsCount(threshold);
  }
  return formatCad(threshold);
}

export type CommissionRuleDisplayInput = {
  rule_type?: unknown;
  commission_basis?: CommissionBasis | null;
  fixed_amount?: number | null;
  percentage_rate?: number | null;
  per_unit_amount?: number | null;
  tier_config?: CommissionTier[] | null;
};

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTierConfig(raw: unknown): CommissionTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const threshold = asFiniteNumber(row.threshold);
      const bonus_amount = asFiniteNumber(row.bonus_amount);
      if (threshold == null || bonus_amount == null) return null;
      return { threshold, bonus_amount };
    })
    .filter((item): item is CommissionTier => item !== null);
}

/**
 * Valeur / détail de rémunération pour consultation (libellés humains).
 */
export function formatCommissionRuleValue(rule: CommissionRuleDisplayInput): string {
  const ruleType = normalizeRuleType(rule.rule_type);
  const basis =
    rule.commission_basis == null
      ? DEFAULT_COMMISSION_BASIS
      : (normalizeCommissionBasis(rule.commission_basis) ?? DEFAULT_COMMISSION_BASIS);

  if (!ruleType) {
    return formatRuleTypeLabel(rule.rule_type);
  }

  if (ruleType === "fixed") {
    const amount = asFiniteNumber(rule.fixed_amount) ?? 0;
    return `${formatCad(amount)} (base ignorée au calcul)`;
  }

  if (ruleType === "percentage") {
    const rate = asFiniteNumber(rule.percentage_rate) ?? 0;
    return `${rate} % sur ${formatCommissionBasisLabel(basis)}`;
  }

  if (ruleType === "tier_bonus") {
    const tiers = normalizeTierConfig(rule.tier_config);
    if (tiers.length === 0) return "Bonus par paliers";
    return tiers
      .map(
        (tier) =>
          `Seuil ${formatTierThreshold(tier.threshold, basis)} → ${formatCad(tier.bonus_amount)}`
      )
      .join(" · ");
  }

  // per_unit — jamais en % ni avec base monétaire
  const perUnit = asFiniteNumber(rule.per_unit_amount) ?? 0;
  const rounded = Number.isInteger(perUnit) ? String(perUnit) : perUnit.toFixed(2);
  return `${rounded} $ par unité réalisée`;
}

export function formatAggregateSalesBasisDisplay(
  value: number,
  kind: AggregateCommissionBasisKind
): string {
  if (kind.kind === "mixed") return "Bases mixtes";
  if (kind.kind === "none") {
    return formatCommissionBasisDisplay(value, null);
  }
  return formatCommissionBasisDisplay(value, kind.basis);
}

export function summarizeObjectiveRulesForDisplay(
  rules: CommissionRuleDisplayInput[]
): {
  basisKind: AggregateCommissionBasisKind;
  basisLabel: string;
  ruleTypeLabel: string;
  ruleValueLabel: string;
} {
  if (rules.length === 0) {
    return {
      basisKind: { kind: "none" },
      basisLabel: formatCommissionBasisLabel(null),
      ruleTypeLabel: "Mode non précisé",
      ruleValueLabel: "—",
    };
  }

  const bases = rules.map((rule) => rule.commission_basis ?? null);
  const basisKind = resolveAggregateCommissionBasisKind(bases);
  const basisLabel =
    basisKind.kind === "mixed"
      ? "Bases mixtes"
      : formatCommissionBasisLabel(
          basisKind.kind === "uniform" ? basisKind.basis : null
        );

  const typeLabels = [...new Set(rules.map((rule) => formatRuleTypeLabel(rule.rule_type)))];
  const ruleTypeLabel = typeLabels.join(" · ");
  const ruleValueLabel = rules.map((rule) => formatCommissionRuleValue(rule)).join(" · ");

  return { basisKind, basisLabel, ruleTypeLabel, ruleValueLabel };
}

/** Détecte un identifiant technique dans un libellé utilisateur. */
export function displayCopyExposesTechnicalIds(text: string): boolean {
  return /(achieved_amount|achieved_sales_count|sales_count|per_unit_amount|tier_config|rule_type|commission_basis|target_type|fixed_amount|percentage_rate|tier_bonus)\b/.test(
    text
  );
}

export type { AggregateCommissionBasisKind, RuleType, CommissionBasis };
