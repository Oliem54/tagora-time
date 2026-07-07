import type { CompensationComponent } from "@/app/lib/commissions/commissions.shared";

/** Statut mémoire Sprint 4 — aligné legacy `estimated`. */
export type AccrualDraftStatus = "estimated";

/** Workflow finance Phase 1 Sprint 5. */
export type AccrualWorkflowStatusPhase1 =
  | "draft"
  | "calculated"
  | "under_review"
  | "validated";

export const ACCRUAL_WORKFLOW_STATUS_PHASE1_LABELS: Record<
  AccrualWorkflowStatusPhase1,
  string
> = {
  draft: "Brouillon",
  calculated: "Calculée",
  under_review: "En revue",
  validated: "Validée",
};

const ACCRUAL_WORKFLOW_STATUS_PHASE1_VALUES: AccrualWorkflowStatusPhase1[] = [
  "draft",
  "calculated",
  "under_review",
  "validated",
];

export function isAccrualWorkflowStatusPhase1(
  value: unknown
): value is AccrualWorkflowStatusPhase1 {
  return (
    typeof value === "string" &&
    ACCRUAL_WORKFLOW_STATUS_PHASE1_VALUES.includes(value as AccrualWorkflowStatusPhase1)
  );
}

export type AccrualDraft = {
  compensation_event_id: string;
  component: CompensationComponent;
  rule_name: string;
  label: string;
  sales_basis_amount: number;
  calculated_amount: number;
  status: AccrualDraftStatus;
  period_start: string | null;
  period_end: string | null;
};

export type Accrual = {
  id: string;
  compensation_event_id: string;
  component: CompensationComponent;
  rule_name: string;
  label: string;
  sales_basis_amount: number;
  calculated_amount: number;
  status: AccrualWorkflowStatusPhase1;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AccrualStatusHistoryEntry = {
  id: string;
  accrual_id: string;
  from_status: AccrualWorkflowStatusPhase1 | null;
  to_status: AccrualWorkflowStatusPhase1;
  changed_at: string;
  changed_by: string | null;
  reason: string | null;
};
