export type ObjectiveStatus =
  | "draft"
  | "active"
  | "achieved"
  | "partially_achieved"
  | "behind"
  | "cancelled";

export type CommissionEntryStatus =
  | "estimated"
  | "pending_validation"
  | "paid"
  | "cancelled";

export type TargetType = "amount" | "sales_count";

/** Base de calcul de la commission — indépendante du type de cible. */
export type CommissionBasis = "achieved_amount" | "achieved_sales_count";

export type RuleType = "fixed" | "percentage" | "tier_bonus" | "per_unit";

export type CommissionTier = {
  threshold: number;
  bonus_amount: number;
};

export const COMMISSION_BASIS_VALUES: readonly CommissionBasis[] = [
  "achieved_amount",
  "achieved_sales_count",
] as const;

export const RULE_TYPE_VALUES: readonly RuleType[] = [
  "fixed",
  "percentage",
  "tier_bonus",
  "per_unit",
] as const;

/** Défaut rétrocompatible (comportement historique monétaire). */
export const DEFAULT_COMMISSION_BASIS: CommissionBasis = "achieved_amount";

export type SalesObjectiveRow = {
  id: string;
  title: string;
  description: string | null;
  chauffeur_id: number | null;
  team_name: string | null;
  period_start: string;
  period_end: string;
  target_type: TargetType;
  target_amount: number | null;
  target_sales_count: number | null;
  achieved_amount: number;
  achieved_sales_count: number;
  status: ObjectiveStatus;
  company_context: string | null;
  /** Canonical tenant UUID (organizations.id). Authority for team rows. */
  organization_id?: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  chauffeur_label?: string | null;
  progress_percent?: number;
  computed_status?: ObjectiveStatus;
};

export type CommissionRuleRow = {
  id: string;
  objective_id: string;
  rule_name: string;
  rule_type: RuleType;
  /** Base utilisée par percentage / tier_bonus / per_unit. Ignorée pour fixed. */
  commission_basis: CommissionBasis;
  fixed_amount: number | null;
  percentage_rate: number | null;
  /** Montant CAD par unité — requis si rule_type = per_unit. */
  per_unit_amount: number | null;
  tier_config: CommissionTier[];
  achievement_bonus_amount: number | null;
  is_active: boolean;
};

export type CommissionEntryRow = {
  id: string;
  objective_id: string;
  rule_id: string | null;
  chauffeur_id: number | null;
  team_name: string | null;
  label: string;
  period_start: string;
  period_end: string;
  sales_basis_amount: number;
  calculated_amount: number;
  status: CommissionEntryStatus;
  validated_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  objective_title?: string | null;
  assignee_label?: string | null;
};

export type CommissionsSummary = {
  activeObjectives: number;
  achievedObjectives: number;
  behindObjectives: number;
  estimatedCommissions: number;
  pendingValidationCommissions: number;
  paidCommissions: number;
};

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  draft: "Brouillon",
  active: "Actif",
  achieved: "Atteint",
  partially_achieved: "Partiellement atteint",
  behind: "En retard",
  cancelled: "Annulé",
};

export const COMMISSION_STATUS_LABELS: Record<CommissionEntryStatus, string> = {
  estimated: "Estimée",
  pending_validation: "À valider",
  paid: "Payée",
  cancelled: "Annulée",
};

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  fixed: "Montant fixe",
  percentage: "Pourcentage",
  tier_bonus: "Bonus par paliers",
  per_unit: "Montant par unité",
};

export const COMMISSION_BASIS_LABELS: Record<CommissionBasis, string> = {
  achieved_amount: "Montant réalisé",
  achieved_sales_count: "Unités réalisées",
};

export function normalizeCommissionBasis(value: unknown): CommissionBasis | null {
  if (value === "achieved_amount" || value === "achieved_sales_count") return value;
  return null;
}

export function normalizeRuleType(value: unknown): RuleType | null {
  if (
    value === "fixed" ||
    value === "percentage" ||
    value === "tier_bonus" ||
    value === "per_unit"
  ) {
    return value;
  }
  return null;
}

/**
 * Matrice produit :
 * - fixed : toute base (ignorée au calcul)
 * - percentage / tier_bonus : achieved_amount | achieved_sales_count
 * - per_unit : uniquement achieved_sales_count
 */
export function isValidCommissionRuleCombination(
  ruleType: RuleType,
  commissionBasis: CommissionBasis
): boolean {
  if (ruleType === "per_unit") {
    return commissionBasis === "achieved_sales_count";
  }
  if (
    ruleType === "fixed" ||
    ruleType === "percentage" ||
    ruleType === "tier_bonus"
  ) {
    return (
      commissionBasis === "achieved_amount" ||
      commissionBasis === "achieved_sales_count"
    );
  }
  return false;
}

export type CommissionRuleCombinationError =
  | "invalid_rule_type"
  | "invalid_commission_basis"
  | "invalid_combination"
  | "missing_per_unit_amount"
  | "invalid_per_unit_amount";

export type CommissionRuleCombinationResult =
  | { ok: true }
  | { ok: false; error: CommissionRuleCombinationError; message: string };

/**
 * Valide type + base (+ per_unit_amount si per_unit).
 * Ne calcule pas la commission — validateurs partagés uniquement.
 */
export function validateCommissionRuleCombination(input: {
  rule_type: unknown;
  commission_basis: unknown;
  per_unit_amount?: unknown;
}): CommissionRuleCombinationResult {
  const ruleType = normalizeRuleType(input.rule_type);
  if (!ruleType) {
    return {
      ok: false,
      error: "invalid_rule_type",
      message: "Type de règle invalide.",
    };
  }

  const basis = normalizeCommissionBasis(input.commission_basis);
  if (!basis) {
    return {
      ok: false,
      error: "invalid_commission_basis",
      message: "Base de calcul invalide.",
    };
  }

  if (!isValidCommissionRuleCombination(ruleType, basis)) {
    return {
      ok: false,
      error: "invalid_combination",
      message:
        ruleType === "per_unit"
          ? "Le mode par unité exige la base « unités réalisées »."
          : "Combinaison rule_type / commission_basis invalide.",
    };
  }

  if (ruleType === "per_unit") {
    if (input.per_unit_amount == null || input.per_unit_amount === "") {
      return {
        ok: false,
        error: "missing_per_unit_amount",
        message: "Le montant par unité est requis.",
      };
    }
    const amount = Number(input.per_unit_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false,
        error: "invalid_per_unit_amount",
        message: "Le montant par unité doit être un nombre strictement supérieur à 0.",
      };
    }
  }

  return { ok: true };
}

export function formatCad(value: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/**
 * Affichage de sales_basis_amount selon commission_basis.
 * Pré-migration / basis absente ou null → devise (fallback achieved_amount).
 * Ne jamais appliquer formatCad aux bases en unités.
 */
export function formatCommissionBasisDisplay(
  value: number,
  commissionBasis: CommissionBasis | null | undefined
): string {
  const resolved =
    commissionBasis == null
      ? DEFAULT_COMMISSION_BASIS
      : (normalizeCommissionBasis(commissionBasis) ?? DEFAULT_COMMISSION_BASIS);

  if (resolved === "achieved_sales_count") {
    const units = Math.trunc(Number.isFinite(value) ? value : 0);
    return `${units} unité${units === 1 ? "" : "s"}`;
  }

  return formatCad(value);
}

/**
 * Pour un agrégat multi-règles (legacy) : unités seulement si toutes les bases sont units.
 * Sinon devise. Préférer resolveAggregateCommissionBasisKind pour détecter les mixtes.
 */
export function resolveAggregateCommissionBasisForDisplay(
  bases: Array<CommissionBasis | null | undefined>
): CommissionBasis {
  const kind = resolveAggregateCommissionBasisKind(bases);
  if (kind.kind === "uniform") return kind.basis;
  return DEFAULT_COMMISSION_BASIS;
}

export type AggregateCommissionBasisKind =
  | { kind: "none" }
  | { kind: "uniform"; basis: CommissionBasis }
  | { kind: "mixed" };

/**
 * Résout l’unité d’affichage d’un agrégat de bases.
 * - none : aucune règle → fallback monétaire historique
 * - uniform : une seule base (null → achieved_amount)
 * - mixed : ne pas présenter un total unique
 */
export function resolveAggregateCommissionBasisKind(
  bases: Array<CommissionBasis | null | undefined>
): AggregateCommissionBasisKind {
  if (bases.length === 0) return { kind: "none" };
  const resolved = bases.map((basis) =>
    basis == null
      ? DEFAULT_COMMISSION_BASIS
      : (normalizeCommissionBasis(basis) ?? DEFAULT_COMMISSION_BASIS)
  );
  const first = resolved[0]!;
  if (resolved.every((basis) => basis === first)) {
    return { kind: "uniform", basis: first };
  }
  return { kind: "mixed" };
}

export function objectiveStatusTone(
  status: ObjectiveStatus
): "default" | "info" | "success" | "warning" | "danger" {
  if (status === "achieved") return "success";
  if (status === "partially_achieved") return "info";
  if (status === "behind") return "danger";
  if (status === "active") return "warning";
  if (status === "cancelled") return "default";
  return "default";
}

export function commissionStatusTone(
  status: CommissionEntryStatus
): "default" | "info" | "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "pending_validation") return "warning";
  if (status === "estimated") return "info";
  if (status === "cancelled") return "default";
  return "default";
}

export function todayIsoLocal() {
  return new Date().toISOString().slice(0, 10);
}

export function firstDayOfMonthIsoLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function formatChauffeurDisplayLabel(row: {
  id?: unknown;
  nom?: unknown;
  courriel?: unknown;
}): string {
  const id = Number(row.id);
  const nom = String(row.nom ?? "").trim();
  const courriel = String(row.courriel ?? "").trim();

  if (nom && courriel) return `${nom} (${courriel})`;
  if (nom) return Number.isFinite(id) ? `${nom} (#${Math.trunc(id)})` : nom;
  if (courriel) return courriel;
  return Number.isFinite(id) ? `Employé #${Math.trunc(id)}` : "Employé";
}
