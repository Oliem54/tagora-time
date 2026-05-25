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

export type RuleType = "fixed" | "percentage" | "tier_bonus";

export type CommissionTier = {
  threshold: number;
  bonus_amount: number;
};

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
  fixed_amount: number | null;
  percentage_rate: number | null;
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
  tier_bonus: "Bonus par palier",
};

export function formatCad(value: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
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
