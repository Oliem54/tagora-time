import type { Accrual, AccrualWorkflowStatusPhase1 } from "@/app/lib/commissions/accruals.shared";
import { ACCRUAL_WORKFLOW_STATUS_PHASE1_LABELS } from "@/app/lib/commissions/accruals.shared";
import type { CompensationSaleEvent } from "@/app/lib/commissions/compensation-engine-api.client";
import {
  COMPENSATION_EVENT_SALE_STATE_LABELS,
  COMPENSATION_EVENT_STATUS_LABELS,
} from "@/app/lib/commissions/compensation-events.shared";
import type { AccrualWorkflowAction } from "@/app/lib/commissions/compensation-engine-api.client";
import { formatCad } from "@/app/lib/commissions/commissions.shared";

export type ProcessingTimelineStepState = "done" | "blocked" | "pending" | "skipped";

export type ProcessingTimelineStep = {
  id: string;
  label: string;
  state: ProcessingTimelineStepState;
  detail?: string | null;
};

export type WorkflowActionDefinition = {
  action: AccrualWorkflowAction;
  label: string;
  tone: "primary" | "success" | "outline";
};

export function formatCompensationEventReference(event: Pick<CompensationSaleEvent, "id" | "external_reference" | "label">) {
  if (event.external_reference?.trim()) return event.external_reference.trim();
  if (event.label?.trim()) return event.label.trim();
  return `#${event.id.slice(0, 8)}`;
}

export function compensationEventStatusLabel(status: CompensationSaleEvent["status"]) {
  return COMPENSATION_EVENT_STATUS_LABELS[status] ?? status;
}

export function compensationSaleStateLabel(state: CompensationSaleEvent["sale_state"]) {
  return COMPENSATION_EVENT_SALE_STATE_LABELS[state] ?? state;
}

export function accrualWorkflowStatusLabel(status: AccrualWorkflowStatusPhase1) {
  return ACCRUAL_WORKFLOW_STATUS_PHASE1_LABELS[status] ?? status;
}

export function accrualWorkflowStatusTone(
  status: AccrualWorkflowStatusPhase1
): "default" | "info" | "success" | "warning" | "danger" {
  if (status === "validated") return "success";
  if (status === "under_review") return "warning";
  if (status === "calculated") return "info";
  return "default";
}

export function eligibilityTone(isEligible: boolean): "success" | "danger" {
  return isEligible ? "success" : "danger";
}

export function getDominantAccrualStatus(accruals: Accrual[]): AccrualWorkflowStatusPhase1 | null {
  if (accruals.length === 0) return null;
  const order: AccrualWorkflowStatusPhase1[] = [
    "draft",
    "calculated",
    "under_review",
    "validated",
  ];
  let dominant: AccrualWorkflowStatusPhase1 = accruals[0]?.status ?? "draft";
  for (const accrual of accruals) {
    if (order.indexOf(accrual.status) > order.indexOf(dominant)) {
      dominant = accrual.status;
    }
  }
  return dominant;
}

export function getWorkflowActionsForStatus(
  status: AccrualWorkflowStatusPhase1
): WorkflowActionDefinition[] {
  if (status === "calculated") {
    return [{ action: "submit_review", label: "Soumettre en revue", tone: "primary" }];
  }
  if (status === "under_review") {
    return [
      { action: "validate", label: "Valider", tone: "success" },
      { action: "send_back", label: "Retourner au calcule", tone: "outline" },
    ];
  }
  return [];
}

export function buildProcessingTimelineSteps(
  event: CompensationSaleEvent,
  accruals: Accrual[]
): ProcessingTimelineStep[] {
  const eligible = event.eligibility.is_eligible;
  const hasAccruals = accruals.length > 0;
  const dominant = getDominantAccrualStatus(accruals);

  const steps: ProcessingTimelineStep[] = [
    {
      id: "load",
      label: "Chargement de la vente",
      state: "done",
      detail: formatCompensationEventReference(event),
    },
    {
      id: "eligibility",
      label: "Verification eligibilite",
      state: eligible ? "done" : "blocked",
      detail: eligible ? "Vente admissible" : event.eligibility.rejection_reason,
    },
    {
      id: "context",
      label: "Contexte de calcul",
      state: eligible ? "done" : "skipped",
    },
    {
      id: "calculation",
      label: "Calcul des lignes",
      state: eligible && hasAccruals ? "done" : eligible ? "pending" : "skipped",
      detail: hasAccruals ? `${accruals.length} ligne(s)` : null,
    },
    {
      id: "drafts",
      label: "Generation des accruals",
      state: eligible && hasAccruals ? "done" : eligible ? "pending" : "skipped",
    },
    {
      id: "persistence",
      label: "Persistance",
      state: eligible && hasAccruals ? "done" : eligible ? "pending" : "skipped",
    },
    {
      id: "workflow",
      label: "Workflow finance",
      state: !eligible ? "skipped" : dominant ? "done" : "pending",
      detail: dominant ? accrualWorkflowStatusLabel(dominant) : "En attente",
    },
  ];

  return steps;
}

export function summarizeCalculationLines(accruals: Accrual[]) {
  return accruals.map((accrual) => ({
    id: accrual.id,
    rule_name: accrual.rule_name,
    component: accrual.component,
    label: accrual.label,
    sales_basis_amount: accrual.sales_basis_amount,
    calculated_amount: accrual.calculated_amount,
  }));
}

export function summarizeAccrualTotals(accruals: Accrual[]) {
  const total = accruals.reduce((sum, row) => sum + row.calculated_amount, 0);
  const byComponent = accruals.reduce<Record<string, number>>((acc, row) => {
    acc[row.component] = (acc[row.component] ?? 0) + row.calculated_amount;
    return acc;
  }, {});

  return {
    total,
    totalFormatted: formatCad(total),
    byComponent,
  };
}

export function buildListSummaryMetrics(events: CompensationSaleEvent[]) {
  const activeCount = events.filter((event) => event.status === "active").length;
  const eligibleCount = events.filter((event) => event.eligibility.is_eligible).length;
  const totalBasis = events.reduce((sum, event) => sum + event.amount, 0);

  return {
    activeCount,
    eligibleCount,
    ineligibleCount: events.length - eligibleCount,
    totalBasis,
    totalBasisFormatted: formatCad(totalBasis),
  };
}
