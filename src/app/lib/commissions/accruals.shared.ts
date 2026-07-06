import type { AccrualWorkflowStatus, CompensationComponent } from "@/app/lib/commissions/commissions.shared";

export type AccrualDraftStatus = Extract<AccrualWorkflowStatus, "estimated">;

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
