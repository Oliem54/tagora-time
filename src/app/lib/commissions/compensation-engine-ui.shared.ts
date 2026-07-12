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
      label: "Chargement de l'événement",
      state: "done",
      detail: formatCompensationEventReference(event),
    },
    {
      id: "eligibility",
      label: "Verification eligibilite",
      state: eligible ? "done" : "blocked",
      detail: eligible ? "Événement admissible" : event.eligibility.rejection_reason,
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

/** Visibilité UX uniquement — le backend reste la source de vérité. */
export type ProcessingActionVisibility = {
  canProcess: boolean;
  canRecalculate: boolean;
  blockedReason: "ineligible" | "under_review" | "validated" | null;
};

export type ProcessingActionKind = "process" | "recalculate";

const REPLACEABLE_ACCRUAL_STATUSES: Accrual["status"][] = ["draft", "calculated"];

export function getProcessingActionVisibility(
  isEligible: boolean,
  accruals: Accrual[]
): ProcessingActionVisibility {
  if (accruals.some((row) => row.status === "validated")) {
    return { canProcess: false, canRecalculate: false, blockedReason: "validated" };
  }
  if (accruals.some((row) => row.status === "under_review")) {
    return { canProcess: false, canRecalculate: false, blockedReason: "under_review" };
  }
  if (!isEligible) {
    return { canProcess: false, canRecalculate: false, blockedReason: "ineligible" };
  }
  if (accruals.length === 0) {
    return { canProcess: true, canRecalculate: false, blockedReason: null };
  }
  const allReplaceable = accruals.every((row) =>
    REPLACEABLE_ACCRUAL_STATUSES.includes(row.status)
  );
  return {
    canProcess: false,
    canRecalculate: allReplaceable,
    blockedReason: null,
  };
}

export function getProcessingConfirmMessage(kind: ProcessingActionKind): string {
  if (kind === "process") {
    return "Calculer les commissions pour cet événement ?";
  }
  return "Remplacer les accruals calculés ? Cette action recalcule les commissions.";
}

export function getProcessingBusyMessage(kind: ProcessingActionKind): string {
  return kind === "process"
    ? "Calcul des commissions en cours…"
    : "Recalcul des commissions en cours…";
}

export function getProcessingSuccessMessage(kind: ProcessingActionKind): string {
  return kind === "process"
    ? "Calcul des commissions terminé."
    : "Recalcul des commissions terminé.";
}

export function mapProcessingApiErrorMessage(
  code: string | null | undefined,
  fallback: string
): string {
  switch (code) {
    case "INELIGIBLE":
      return "Événement inadmissible au calcul des commissions.";
    case "ALREADY_PROCESSED":
      return "Déjà en revue — recalcul impossible.";
    case "ALREADY_VALIDATED":
      return "Déjà validé — recalcul impossible.";
    case "NOT_FOUND":
      return "Événement de commission introuvable.";
    case "FORBIDDEN":
      return "Accès réservé à l'administration finance.";
    case "UNAUTHORIZED":
      return "Authentification requise.";
    case "VALIDATION_ERROR":
      return fallback || "Données de traitement invalides.";
    case "CONFLICT":
      return "Un traitement est déjà en cours.";
    case "PERSISTENCE_ERROR":
      return "Erreur serveur lors du traitement.";
    default:
      return fallback || "Calcul des commissions impossible.";
  }
}

export function getProcessingBlockedNote(
  blockedReason: ProcessingActionVisibility["blockedReason"]
): string | null {
  if (blockedReason === "validated") {
    return "Au moins un accrual est validé. Calcul et recalcul indisponibles.";
  }
  if (blockedReason === "under_review") {
    return "Au moins un accrual est en revue. Calcul et recalcul indisponibles.";
  }
  if (blockedReason === "ineligible") {
    return "Événement inadmissible. Calcul des commissions indisponible.";
  }
  return null;
}

/**
 * Orchestration pure (testable sans React) :
 * confirmation annulée / busy / succès avec refresh.
 */
export async function runConfirmedProcessingAction<T>(params: {
  confirmed: boolean;
  isBusy: boolean;
  execute: () => Promise<T>;
  onSuccess: (value: T) => Promise<void> | void;
}): Promise<"cancelled" | "skipped_busy" | { ok: true; value: T } | { ok: false; error: unknown }> {
  if (!params.confirmed) return "cancelled";
  if (params.isBusy) return "skipped_busy";

  try {
    const value = await params.execute();
    await params.onSuccess(value);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
}

export const PROCESSING_SUMMARY_SESSION_NOTICE =
  "Ce résumé correspond au dernier traitement exécuté dans cette session. Il ne constitue pas un historique persistant.";

export type ProcessingSummaryViewModel = {
  executionTypeLabel: string;
  resultLabel: string;
  startedAtLabel: string;
  finishedAtLabel: string;
  durationLabel: string;
  accrualsCreatedLabel: string;
  accrualsSupersededLabel: string;
  totalAmountLabel: string;
  warnings: string[];
  warningsEmpty: boolean;
  engineVersionLabel: string;
  correlationId: string | null;
  sessionNotice: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function formatProcessingExecutionTypeLabel(
  executionType: string | null | undefined
): string {
  if (executionType === "initial") return "Traitement initial";
  if (executionType === "recalculate") return "Recalcul";
  if (executionType === "retry") return "Nouvelle tentative";
  return executionType?.trim() || "—";
}

export function formatProcessingResultLabel(summary: unknown): string {
  const record = asRecord(summary);
  const resultCode =
    typeof record.result_code === "string" ? record.result_code.trim() : "";
  if (resultCode === "SUCCESS") return "Succès";
  if (resultCode) return resultCode;

  const status = typeof record.status === "string" ? record.status.trim() : "";
  if (status === "succeeded" || status === "SUCCESS") return "Succès";
  if (status === "failed") return "Échec";
  if (status) return status;
  return "—";
}

export function formatProcessingDateTimeLabel(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function formatProcessingDurationLabel(durationMs: number | null | undefined): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return "—";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes} min ${rem} s`;
}

export function formatProcessingSupersededCountLabel(summary: unknown): string {
  const record = asRecord(summary);
  if (!Object.prototype.hasOwnProperty.call(record, "accruals_superseded_count")) {
    return "Non disponible";
  }
  const value = record.accruals_superseded_count;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return "Non disponible";
}

export function resolveProcessingEngineVersion(
  summary: unknown,
  meta: { engine_version?: string } | null | undefined
): string {
  const record = asRecord(summary);
  if (typeof record.engine_version === "string" && record.engine_version.trim()) {
    return record.engine_version.trim();
  }
  if (typeof meta?.engine_version === "string" && meta.engine_version.trim()) {
    return meta.engine_version.trim();
  }
  return "—";
}

export function buildProcessingSummaryViewModel(result: {
  summary: unknown;
  meta?: { engine_version?: string; correlation_id?: string } | null;
}): ProcessingSummaryViewModel {
  const summary = asRecord(result.summary);
  const warnings = Array.isArray(summary.warnings)
    ? summary.warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const totalCents =
    typeof summary.total_calculated_amount_cents === "number"
      ? summary.total_calculated_amount_cents
      : null;

  return {
    executionTypeLabel: formatProcessingExecutionTypeLabel(
      typeof summary.execution_type === "string" ? summary.execution_type : null
    ),
    resultLabel: formatProcessingResultLabel(summary),
    startedAtLabel: formatProcessingDateTimeLabel(
      typeof summary.started_at === "string" ? summary.started_at : null
    ),
    finishedAtLabel: formatProcessingDateTimeLabel(
      typeof summary.finished_at === "string" ? summary.finished_at : null
    ),
    durationLabel: formatProcessingDurationLabel(
      typeof summary.duration_ms === "number" ? summary.duration_ms : null
    ),
    accrualsCreatedLabel:
      typeof summary.accruals_created_count === "number"
        ? String(Math.trunc(summary.accruals_created_count))
        : "—",
    accrualsSupersededLabel: formatProcessingSupersededCountLabel(summary),
    totalAmountLabel: totalCents == null ? "—" : formatCad(totalCents),
    warnings,
    warningsEmpty: warnings.length === 0,
    engineVersionLabel: resolveProcessingEngineVersion(summary, result.meta),
    correlationId:
      typeof result.meta?.correlation_id === "string" && result.meta.correlation_id.trim()
        ? result.meta.correlation_id.trim()
        : null,
    sessionNotice: PROCESSING_SUMMARY_SESSION_NOTICE,
  };
}
