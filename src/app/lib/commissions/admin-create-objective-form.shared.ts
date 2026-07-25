import {
  COMMISSION_BASIS_LABELS,
  DEFAULT_COMMISSION_BASIS,
  RULE_TYPE_LABELS,
  normalizeCommissionBasis,
  normalizeRuleType,
  type CommissionBasis,
  type RuleType,
  type TargetType,
} from "@/app/lib/commissions/commissions.shared";

export type AdminCreateObjectiveFormState = {
  title: string;
  description: string;
  chauffeur_id: string;
  team_name: string;
  period_start: string;
  period_end: string;
  target_type: TargetType;
  target_amount: string;
  target_sales_count: string;
  rule_name: string;
  rule_type: RuleType;
  commission_basis: CommissionBasis;
  fixed_amount: string;
  percentage_rate: string;
  per_unit_amount: string;
  tier_threshold: string;
  tier_bonus_amount: string;
};

export type AdminCreateObjectiveRulePayload = {
  rule_name: string;
  rule_type: RuleType;
  commission_basis: CommissionBasis;
  fixed_amount?: number | null;
  percentage_rate?: number | null;
  per_unit_amount?: number | null;
  tier_config?: Array<{ threshold: number; bonus_amount: number }>;
};

export type AdminCreateObjectivePayload = {
  title: string;
  description: string;
  chauffeur_id: number | null;
  team_name: string;
  period_start: string;
  period_end: string;
  target_type: TargetType;
  target_amount?: number | null;
  target_sales_count?: number | null;
  achieved_amount: number;
  achieved_sales_count: number;
  publish: boolean;
  rules: AdminCreateObjectiveRulePayload[];
};

export const TARGET_TYPE_FORM_OPTIONS: ReadonlyArray<{
  value: TargetType;
  label: string;
}> = [
  { value: "amount", label: "Montant de ventes" },
  { value: "sales_count", label: "Nombre d’unités vendues" },
];

export const COMMISSION_BASIS_FORM_OPTIONS: ReadonlyArray<{
  value: CommissionBasis;
  label: string;
}> = [
  { value: "achieved_amount", label: COMMISSION_BASIS_LABELS.achieved_amount },
  { value: "achieved_sales_count", label: COMMISSION_BASIS_LABELS.achieved_sales_count },
];

export const RULE_TYPE_FORM_OPTIONS: ReadonlyArray<{
  value: RuleType;
  label: string;
}> = [
  { value: "fixed", label: RULE_TYPE_LABELS.fixed },
  { value: "percentage", label: RULE_TYPE_LABELS.percentage },
  { value: "tier_bonus", label: RULE_TYPE_LABELS.tier_bonus },
  { value: "per_unit", label: RULE_TYPE_LABELS.per_unit },
];

export function emptyAdminCreateObjectiveForm(
  dates: { period_start: string; period_end: string }
): AdminCreateObjectiveFormState {
  return {
    title: "",
    description: "",
    chauffeur_id: "",
    team_name: "",
    period_start: dates.period_start,
    period_end: dates.period_end,
    target_type: "amount",
    target_amount: "",
    target_sales_count: "",
    rule_name: "Commission principale",
    rule_type: "percentage",
    commission_basis: DEFAULT_COMMISSION_BASIS,
    fixed_amount: "",
    percentage_rate: "5",
    per_unit_amount: "",
    tier_threshold: "",
    tier_bonus_amount: "",
  };
}

export function applyTargetTypeChange(
  form: AdminCreateObjectiveFormState,
  nextType: TargetType
): AdminCreateObjectiveFormState {
  if (nextType === "amount") {
    return {
      ...form,
      target_type: "amount",
      target_sales_count: "",
    };
  }
  return {
    ...form,
    target_type: "sales_count",
    target_amount: "",
  };
}

export function applyRuleTypeChange(
  form: AdminCreateObjectiveFormState,
  nextType: RuleType
): AdminCreateObjectiveFormState {
  const next: AdminCreateObjectiveFormState = {
    ...form,
    rule_type: nextType,
    fixed_amount: "",
    percentage_rate: "",
    per_unit_amount: "",
    tier_threshold: "",
    tier_bonus_amount: "",
  };

  if (nextType === "per_unit") {
    return {
      ...next,
      commission_basis: "achieved_sales_count",
    };
  }

  if (nextType === "percentage") {
    return {
      ...next,
      percentage_rate: "5",
    };
  }

  return next;
}

export function applyCommissionBasisChange(
  form: AdminCreateObjectiveFormState,
  nextBasis: CommissionBasis
): AdminCreateObjectiveFormState {
  if (form.rule_type === "per_unit" && nextBasis === "achieved_amount") {
    return {
      ...form,
      commission_basis: "achieved_sales_count",
    };
  }
  return {
    ...form,
    commission_basis: nextBasis,
  };
}

function parseFiniteNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isPositiveFinite(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: number | null): value is number {
  return (
    value != null &&
    Number.isFinite(value) &&
    value > 0 &&
    Number.isInteger(value)
  );
}

function isNonNegativeInteger(value: number | null): value is number {
  return (
    value != null &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isInteger(value)
  );
}

export type AdminCreateObjectiveValidationResult =
  | { ok: true; payload: AdminCreateObjectivePayload }
  | { ok: false; error: string };

/**
 * Valide le formulaire Admin et construit un payload POST propre
 * (aucun champ incompatible).
 */
export function validateAndBuildAdminCreateObjectivePayload(
  form: AdminCreateObjectiveFormState,
  publish: boolean
): AdminCreateObjectiveValidationResult {
  const title = form.title.trim();
  if (!title) {
    return { ok: false, error: "Le titre de l’objectif est requis." };
  }
  if (!form.period_start || !form.period_end) {
    return { ok: false, error: "La période de l’objectif est requise." };
  }
  if (!form.chauffeur_id && !form.team_name.trim()) {
    return {
      ok: false,
      error: "Assignez un employé ou une équipe.",
    };
  }

  const targetType =
    form.target_type === "sales_count" || form.target_type === "amount"
      ? form.target_type
      : null;
  if (!targetType) {
    return { ok: false, error: "Le type de cible est invalide." };
  }

  let target_amount: number | null | undefined;
  let target_sales_count: number | null | undefined;

  if (targetType === "amount") {
    const amount = parseFiniteNumber(form.target_amount);
    if (!isPositiveFinite(amount)) {
      return {
        ok: false,
        error: "Le montant cible doit être un nombre supérieur à zéro.",
      };
    }
    target_amount = amount;
  } else {
    const count = parseFiniteNumber(form.target_sales_count);
    if (!isPositiveInteger(count)) {
      return {
        ok: false,
        error:
          "Le nombre d’unités cible doit être un entier supérieur à zéro (sans décimale).",
      };
    }
    target_sales_count = count;
  }

  const ruleType = normalizeRuleType(form.rule_type);
  if (!ruleType) {
    return { ok: false, error: "Le mode de rémunération est invalide." };
  }

  const basis = normalizeCommissionBasis(form.commission_basis);
  if (!basis) {
    return { ok: false, error: "La base de calcul est invalide." };
  }

  if (ruleType === "per_unit" && basis !== "achieved_sales_count") {
    return {
      ok: false,
      error:
        "Le montant par unité exige la base « Unités réalisées ». La base « Montant réalisé » n’est pas disponible pour ce mode.",
    };
  }

  const rule_name = form.rule_name.trim() || "Commission principale";
  const rule: AdminCreateObjectiveRulePayload = {
    rule_name,
    rule_type: ruleType,
    commission_basis: basis,
  };

  if (ruleType === "fixed") {
    const fixed_amount = parseFiniteNumber(form.fixed_amount);
    if (!isPositiveFinite(fixed_amount)) {
      return {
        ok: false,
        error: "Le montant fixe doit être un nombre supérieur à zéro.",
      };
    }
    rule.fixed_amount = fixed_amount;
  } else if (ruleType === "percentage") {
    const percentage_rate = parseFiniteNumber(form.percentage_rate);
    if (!isPositiveFinite(percentage_rate)) {
      return {
        ok: false,
        error: "Le pourcentage doit être un nombre supérieur à zéro.",
      };
    }
    rule.percentage_rate = percentage_rate;
  } else if (ruleType === "tier_bonus") {
    const threshold = parseFiniteNumber(form.tier_threshold);
    const bonus_amount = parseFiniteNumber(form.tier_bonus_amount);
    if (basis === "achieved_sales_count") {
      if (!isNonNegativeInteger(threshold)) {
        return {
          ok: false,
          error:
            "Le seuil du palier doit être un entier positif ou zéro (unités).",
        };
      }
    } else if (!isNonNegativeFinite(threshold)) {
      return {
        ok: false,
        error: "Le seuil du palier doit être un montant valide (zéro ou plus).",
      };
    }
    if (!isPositiveFinite(bonus_amount)) {
      return {
        ok: false,
        error: "Le bonus du palier doit être un montant supérieur à zéro.",
      };
    }
    rule.tier_config = [{ threshold: threshold as number, bonus_amount }];
  } else {
    // per_unit
    const per_unit_amount = parseFiniteNumber(form.per_unit_amount);
    if (!isPositiveFinite(per_unit_amount)) {
      return {
        ok: false,
        error: "Le montant par unité doit être un nombre supérieur à zéro.",
      };
    }
    rule.commission_basis = "achieved_sales_count";
    rule.per_unit_amount = per_unit_amount;
  }

  const payload: AdminCreateObjectivePayload = {
    title,
    description: form.description.trim(),
    chauffeur_id: form.chauffeur_id ? Number(form.chauffeur_id) : null,
    team_name: form.team_name.trim(),
    period_start: form.period_start,
    period_end: form.period_end,
    target_type: targetType,
    achieved_amount: 0,
    achieved_sales_count: 0,
    publish,
    rules: [rule],
  };

  if (targetType === "amount") {
    payload.target_amount = target_amount ?? null;
  } else {
    payload.target_sales_count = target_sales_count ?? null;
  }

  return { ok: true, payload };
}

/** Messages / libellés ne doivent pas exposer les identifiants techniques bruts. */
export function formCopyExposesTechnicalIds(text: string): boolean {
  return /(achieved_amount|achieved_sales_count|sales_count|per_unit_amount|tier_config|rule_type|commission_basis|target_type|fixed_amount|percentage_rate)\b/.test(
    text
  );
}
