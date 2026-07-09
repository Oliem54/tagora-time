import type { Accrual } from "@/app/lib/commissions/accruals.shared";
import type { CalculationLineResult } from "@/app/lib/commissions/compensation-calculation.shared";
import type {
  CompensationProcessingErrorCode,
  CompensationProcessingSuccess,
} from "@/app/lib/commissions/compensation-processing.shared";
import type { EligibilityResult } from "@/app/lib/commissions/eligibility.server";

export const COMPENSATION_ENGINE_VERSION = "compensation-engine@1.0.0";
export const COMPENSATION_API_VERSION = "1.0";
export const COMPENSATION_DTO_VERSION = "1.0";

export const DEFAULT_PROCESSING_RULES = [
  {
    rule_type: "percentage" as const,
    percentage_rate: 5,
    rule_name: "Commission",
    is_active: true,
  },
];

export type FinanceStatus =
  | "NOT_EVALUATED"
  | "NOT_ELIGIBLE"
  | "ELIGIBLE"
  | "PROCESSING"
  | "CALCULATED"
  | "UNDER_REVIEW"
  | "VALIDATED"
  | "PAID"
  | "FAILED";

export type ProcessingApiErrorCode =
  | "NOT_FOUND"
  | "INELIGIBLE"
  | "VALIDATION_ERROR"
  | "ALREADY_PROCESSED"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN";

export type CompensationEligibilityDto = EligibilityResult;

export type CompensationAccrualDto = {
  id: string;
  compensation_event_id: string;
  processing_run_id: string | null;
  component: string;
  rule_name: string;
  label: string;
  sales_basis_amount_cents: number;
  calculated_amount_cents: number;
  status: Accrual["status"];
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
};

export type CalculationLineDto = {
  rule_name: string;
  component: string;
  sales_basis_amount_cents: number;
  calculated_amount_cents: number;
};

export type CompensationProcessingSummaryDto = {
  run_id: string;
  execution_type: "initial" | "recalculate" | "retry";
  status: "succeeded" | "failed";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  accruals_created_count: number;
  total_calculated_amount_cents: number;
  warnings: string[];
  triggered_by_user_id: string | null;
};

export type CompensationProcessingResultDto = {
  ok: boolean;
  compensation_id: string;
  session_id: string;
  run_id: string;
  sales_event_id: string;
  finance_status: FinanceStatus;
  eligibility: CompensationEligibilityDto;
  summary: CompensationProcessingSummaryDto;
  accruals: CompensationAccrualDto[];
  calculation_lines: CalculationLineDto[];
  errors: string[];
  code: ProcessingApiErrorCode | null;
  meta: {
    api_version: typeof COMPENSATION_API_VERSION;
    dto_version: typeof COMPENSATION_DTO_VERSION;
    engine_version: string;
    correlation_id: string;
  };
};

export type ProcessingResponseMeta = {
  sessionId: string;
  runId: string;
  correlationId: string;
  startedAt: string;
  finishedAt: string;
  actorUserId: string | null;
};

const PROTECTED_ACCRUAL_MESSAGE_MARKERS = ["revue", "valides"];

function toContractAmount(value: number): number {
  return value;
}

export function mapEligibilityToDto(eligibility: EligibilityResult): CompensationEligibilityDto {
  return eligibility;
}

export function mapAccrualToDto(
  accrual: Accrual,
  processingRunId: string | null = null
): CompensationAccrualDto {
  return {
    id: accrual.id,
    compensation_event_id: accrual.compensation_event_id,
    processing_run_id: processingRunId,
    component: accrual.component,
    rule_name: accrual.rule_name,
    label: accrual.label,
    sales_basis_amount_cents: toContractAmount(accrual.sales_basis_amount),
    calculated_amount_cents: toContractAmount(accrual.calculated_amount),
    status: accrual.status,
    period_start: accrual.period_start,
    period_end: accrual.period_end,
    created_at: accrual.created_at,
    updated_at: accrual.updated_at,
  };
}

export function mapCalculationLineToDto(line: CalculationLineResult): CalculationLineDto {
  return {
    rule_name: line.rule_name,
    component: line.component,
    sales_basis_amount_cents: toContractAmount(line.sales_basis_amount),
    calculated_amount_cents: toContractAmount(line.calculated_amount),
  };
}

export function deriveFinanceStatus(
  eligibility: EligibilityResult,
  accruals: Accrual[]
): FinanceStatus {
  if (!eligibility.is_eligible) {
    return "NOT_ELIGIBLE";
  }

  if (accruals.length === 0) {
    return "ELIGIBLE";
  }

  if (accruals.every((row) => row.status === "validated")) {
    return "VALIDATED";
  }

  if (accruals.some((row) => row.status === "under_review")) {
    return "UNDER_REVIEW";
  }

  return "CALCULATED";
}

export function mapDomainErrorToApiCode(
  code: CompensationProcessingErrorCode,
  errors: string[]
): ProcessingApiErrorCode {
  if (code === "NOT_FOUND") return "NOT_FOUND";
  if (code === "INELIGIBLE") return "INELIGIBLE";
  if (code === "VALIDATION") {
    const message = errors.join(" ").toLowerCase();
    if (PROTECTED_ACCRUAL_MESSAGE_MARKERS.some((marker) => message.includes(marker))) {
      return "ALREADY_PROCESSED";
    }
    return "VALIDATION_ERROR";
  }
  return "VALIDATION_ERROR";
}

export function mapDomainErrorToHttpStatus(code: ProcessingApiErrorCode): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "CONFLICT") return 409;
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  return 422;
}

export function mapProcessingSuccessToDto(
  value: CompensationProcessingSuccess,
  meta: ProcessingResponseMeta
): CompensationProcessingResultDto {
  const durationMs = Math.max(
    0,
    new Date(meta.finishedAt).getTime() - new Date(meta.startedAt).getTime()
  );
  const totalCalculated = value.accruals.reduce(
    (sum, row) => sum + row.calculated_amount,
    0
  );

  return {
    ok: true,
    compensation_id: value.event.id,
    session_id: meta.sessionId,
    run_id: meta.runId,
    sales_event_id: value.event.id,
    finance_status: deriveFinanceStatus(value.event.eligibility, value.accruals),
    eligibility: mapEligibilityToDto(value.event.eligibility),
    summary: {
      run_id: meta.runId,
      execution_type: "initial",
      status: "succeeded",
      started_at: meta.startedAt,
      finished_at: meta.finishedAt,
      duration_ms: durationMs,
      accruals_created_count: value.accruals.length,
      total_calculated_amount_cents: toContractAmount(totalCalculated),
      warnings: value.calculation.skipped
        ? [value.calculation.rejection_reason ?? "Calcul ignore."].filter(Boolean)
        : [],
      triggered_by_user_id: meta.actorUserId,
    },
    accruals: value.accruals.map((row) => mapAccrualToDto(row, null)),
    calculation_lines: value.calculation.lines.map(mapCalculationLineToDto),
    errors: [],
    code: null,
    meta: {
      api_version: COMPENSATION_API_VERSION,
      dto_version: COMPENSATION_DTO_VERSION,
      engine_version: COMPENSATION_ENGINE_VERSION,
      correlation_id: meta.correlationId,
    },
  };
}
