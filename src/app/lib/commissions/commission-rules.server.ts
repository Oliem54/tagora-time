import {
  calculateRuleCommission,
  parseTierConfig,
  resolveCommissionBasis,
} from "@/app/lib/commissions/calculate.server";
import {
  DEFAULT_COMMISSION_BASIS,
  normalizeCommissionBasis,
  normalizeRuleType,
  validateCommissionRuleCombination,
  type CommissionBasis,
  type CommissionRuleRow,
  type RuleType,
  type SalesObjectiveRow,
} from "@/app/lib/commissions/commissions.shared";

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type ParsedCommissionRuleInput = {
  rule_name: string;
  rule_type: RuleType;
  commission_basis: CommissionBasis;
  fixed_amount: number | null;
  percentage_rate: number | null;
  per_unit_amount: number | null;
  tier_config: CommissionRuleRow["tier_config"];
  achievement_bonus_amount: number | null;
  is_active: boolean;
};

export type ParseCommissionRuleResult =
  | { ok: true; rule: ParsedCommissionRuleInput }
  | { ok: false; error: string };

/**
 * Parse + valide une règle commission (create/update API).
 * N'infère JAMAIS commission_basis depuis target_type.
 *
 * Compatibilité transitoire (avant migration exécutée) :
 * - commission_basis absent/null → DEFAULT_COMMISSION_BASIS (achieved_amount)
 * - aucune règle n'est auto-interprétée comme per_unit
 */
export function parseAndValidateCommissionRuleInput(
  raw: Record<string, unknown>
): ParseCommissionRuleResult {
  const ruleType = normalizeRuleType(raw.rule_type);
  if (!ruleType) {
    // Compat: payloads historiques sans rule_type explicite → fixed
    if (raw.rule_type == null || raw.rule_type === "") {
      // fall through as fixed below
    } else {
      return { ok: false, error: "Type de règle de commission inconnu." };
    }
  }

  const resolvedType: RuleType = ruleType ?? "fixed";

  /**
   * Transitoire jusqu'à migration `commission_basis` :
   * absente/null → achieved_amount (comportement historique monétaire).
   * Ne jamais dériver depuis target_type.
   */
  let commission_basis: CommissionBasis;
  if (raw.commission_basis == null || raw.commission_basis === "") {
    commission_basis = DEFAULT_COMMISSION_BASIS;
  } else {
    const basisFromPayload = normalizeCommissionBasis(raw.commission_basis);
    if (!basisFromPayload) {
      return { ok: false, error: "Base de calcul de commission inconnue." };
    }
    commission_basis = basisFromPayload;
  }

  const combination = validateCommissionRuleCombination({
    rule_type: resolvedType,
    commission_basis,
    per_unit_amount: raw.per_unit_amount,
  });
  if (!combination.ok) {
    return { ok: false, error: combination.message };
  }

  if (resolvedType === "fixed") {
    const fixed_amount = asNumber(raw.fixed_amount);
    if (fixed_amount == null || !Number.isFinite(fixed_amount) || fixed_amount < 0) {
      return { ok: false, error: "Montant fixe invalide." };
    }
    if (raw.per_unit_amount != null && raw.per_unit_amount !== "") {
      return {
        ok: false,
        error: "per_unit_amount doit être null pour une règle fixe.",
      };
    }
    return {
      ok: true,
      rule: {
        rule_name: asText(raw.rule_name) ?? "Commission",
        rule_type: "fixed",
        commission_basis,
        fixed_amount,
        percentage_rate: null,
        per_unit_amount: null,
        tier_config: [],
        achievement_bonus_amount: asNumber(raw.achievement_bonus_amount),
        is_active: raw.is_active !== false,
      },
    };
  }

  if (resolvedType === "percentage") {
    const percentage_rate = asNumber(raw.percentage_rate);
    if (percentage_rate == null || !Number.isFinite(percentage_rate) || percentage_rate < 0) {
      return { ok: false, error: "Taux de pourcentage invalide." };
    }
    if (raw.per_unit_amount != null && raw.per_unit_amount !== "") {
      return {
        ok: false,
        error: "per_unit_amount doit être null pour une règle pourcentage.",
      };
    }
    return {
      ok: true,
      rule: {
        rule_name: asText(raw.rule_name) ?? "Commission",
        rule_type: "percentage",
        commission_basis,
        fixed_amount: null,
        percentage_rate,
        per_unit_amount: null,
        tier_config: [],
        achievement_bonus_amount: asNumber(raw.achievement_bonus_amount),
        is_active: raw.is_active !== false,
      },
    };
  }

  if (resolvedType === "tier_bonus") {
    if (raw.per_unit_amount != null && raw.per_unit_amount !== "") {
      return {
        ok: false,
        error: "per_unit_amount doit être null pour une règle par paliers.",
      };
    }
    const tier_config = parseTierConfig(raw.tier_config);
    if (!Array.isArray(raw.tier_config)) {
      return { ok: false, error: "tier_config invalide." };
    }
    for (const tier of tier_config) {
      if (!Number.isFinite(tier.threshold) || !Number.isFinite(tier.bonus_amount)) {
        return { ok: false, error: "Les paliers doivent contenir des nombres finis." };
      }
    }
    return {
      ok: true,
      rule: {
        rule_name: asText(raw.rule_name) ?? "Commission",
        rule_type: "tier_bonus",
        commission_basis,
        fixed_amount: null,
        percentage_rate: null,
        per_unit_amount: null,
        tier_config,
        achievement_bonus_amount: asNumber(raw.achievement_bonus_amount),
        is_active: raw.is_active !== false,
      },
    };
  }

  // per_unit
  const per_unit_amount = asNumber(raw.per_unit_amount);
  if (per_unit_amount == null || !Number.isFinite(per_unit_amount) || per_unit_amount <= 0) {
    return {
      ok: false,
      error: "per_unit_amount doit être un nombre strictement supérieur à 0.",
    };
  }
  if (commission_basis !== "achieved_sales_count") {
    return {
      ok: false,
      error: "Le mode par unité exige commission_basis = achieved_sales_count.",
    };
  }
  if (raw.fixed_amount != null && raw.fixed_amount !== "") {
    return {
      ok: false,
      error: "fixed_amount ne doit pas être utilisé comme substitut de per_unit_amount.",
    };
  }
  if (raw.percentage_rate != null && raw.percentage_rate !== "") {
    return {
      ok: false,
      error: "percentage_rate ne doit pas être utilisé comme substitut de per_unit_amount.",
    };
  }

  return {
    ok: true,
    rule: {
      rule_name: asText(raw.rule_name) ?? "Commission",
      rule_type: "per_unit",
      commission_basis: "achieved_sales_count",
      fixed_amount: null,
      percentage_rate: null,
      per_unit_amount,
      tier_config: [],
      achievement_bonus_amount: asNumber(raw.achievement_bonus_amount),
      is_active: raw.is_active !== false,
    },
  };
}

/**
 * Payload insert DB.
 * Avant migration : omet commission_basis / per_unit_amount pour les règles
 * legacy-compatibles (pas per_unit, basis = achieved_amount).
 * Sinon inclut les colonnes (échouera clairement si migration absente).
 */
export function toCommissionRuleInsertPayload(
  rule: ParsedCommissionRuleInput,
  objectiveId: string
): Record<string, unknown> {
  const legacyCompatible =
    rule.rule_type !== "per_unit" &&
    rule.commission_basis === DEFAULT_COMMISSION_BASIS &&
    rule.per_unit_amount == null;

  const base: Record<string, unknown> = {
    objective_id: objectiveId,
    rule_name: rule.rule_name,
    rule_type: rule.rule_type,
    fixed_amount: rule.fixed_amount,
    percentage_rate: rule.percentage_rate,
    tier_config: rule.tier_config,
    achievement_bonus_amount: rule.achievement_bonus_amount,
    is_active: rule.is_active,
  };

  if (legacyCompatible) {
    return base;
  }

  return {
    ...base,
    commission_basis: rule.commission_basis,
    per_unit_amount: rule.per_unit_amount,
  };
}

export type EstimatedCommissionEntryDraft = {
  objective_id: string;
  rule_id: string;
  chauffeur_id: number | null;
  team_name: string | null;
  label: string;
  period_start: string;
  period_end: string;
  /**
   * Limitation sémantique temporaire :
   * stocke la base numérique résolue (montant OU unités), pas toujours un $.
   * calculated_amount reste toujours monétaire (CAD).
   */
  sales_basis_amount: number;
  calculated_amount: number;
  status: "estimated";
};

/**
 * Construit les entrées estimées pour un recalcul.
 * N'utilise PAS salesBasisForObjective.
 * Progression (computeProgressPercent) reste hors de cette fonction.
 */
export function buildEstimatedCommissionEntries(input: {
  objectiveId: string;
  objective: Pick<
    SalesObjectiveRow,
    | "achieved_amount"
    | "achieved_sales_count"
    | "chauffeur_id"
    | "team_name"
    | "period_start"
    | "period_end"
  >;
  rules: CommissionRuleRow[];
  objectiveAchieved: boolean;
  assigneeLabel: string;
}): EstimatedCommissionEntryDraft[] {
  const drafts: EstimatedCommissionEntryDraft[] = [];

  for (const rule of input.rules) {
    if (!rule.is_active) continue;

    const ruleType = normalizeRuleType(rule.rule_type);
    if (!ruleType) {
      throw new Error(`Type de règle inconnu (rule_id=${rule.id}).`);
    }

    /**
     * Transitoire pré-migration : basis absente/null → achieved_amount.
     * Jamais dérivée de target_type.
     */
    const commissionBasis =
      normalizeCommissionBasis(rule.commission_basis) ?? DEFAULT_COMMISSION_BASIS;

    const normalizedRule: CommissionRuleRow = {
      ...rule,
      rule_type: ruleType,
      commission_basis: commissionBasis,
      per_unit_amount: rule.per_unit_amount ?? null,
    };

    const resolvedBasis = resolveCommissionBasis(input.objective, commissionBasis);
    if (!Number.isFinite(resolvedBasis)) {
      throw new Error("Base de commission non finie — refus de persistance.");
    }

    const calculated = calculateRuleCommission(
      normalizedRule,
      resolvedBasis,
      input.objectiveAchieved
    );
    if (!Number.isFinite(calculated)) {
      throw new Error("Montant de commission non fini — refus de persistance.");
    }
    if (calculated <= 0) continue;

    drafts.push({
      objective_id: input.objectiveId,
      rule_id: rule.id,
      chauffeur_id: input.objective.chauffeur_id,
      team_name: input.objective.team_name,
      label: `${rule.rule_name} — ${input.assigneeLabel}`,
      period_start: input.objective.period_start,
      period_end: input.objective.period_end,
      sales_basis_amount: resolvedBasis,
      calculated_amount: calculated,
      status: "estimated",
    });
  }

  return drafts;
}
