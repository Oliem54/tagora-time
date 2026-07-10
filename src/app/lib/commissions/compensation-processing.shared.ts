import type { Accrual, AccrualDraft, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import type { CompensationCalculationContext } from "@/app/lib/commissions/compensation-calculation-context.shared";
import type { CompensationCalculationResult } from "@/app/lib/commissions/compensation-calculation.shared";
import type { CompensationEventRecordWithEligibility } from "@/app/lib/commissions/compensation-events.service.server";

export type CompensationProcessingSuccess = {
  event: CompensationEventRecordWithEligibility;
  context: CompensationCalculationContext;
  calculation: CompensationCalculationResult;
  accrual_drafts: AccrualDraft[];
  accruals: Accrual[];
  history: AccrualStatusHistoryEntry[];
};

export type CompensationProcessingErrorCode =
  | "NOT_FOUND"
  | "INELIGIBLE"
  | "VALIDATION"
  | "ALREADY_PROCESSED"
  | "ALREADY_VALIDATED"
  | "PERSISTENCE";

export type CompensationProcessingResult =
  | { ok: true; value: CompensationProcessingSuccess }
  | { ok: false; code: CompensationProcessingErrorCode; errors: string[] };
