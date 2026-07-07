import {
  isAccrualWorkflowStatusPhase1,
  type AccrualWorkflowStatusPhase1,
} from "@/app/lib/commissions/accruals.shared";

export const ACCRUAL_TERMINAL_STATUSES_PHASE1: AccrualWorkflowStatusPhase1[] = ["validated"];

export const ACCRUAL_WORKFLOW_TRANSITIONS: Record<
  AccrualWorkflowStatusPhase1,
  AccrualWorkflowStatusPhase1[]
> = {
  draft: ["calculated"],
  calculated: ["under_review"],
  under_review: ["validated", "calculated"],
  validated: [],
};

export function getAllowedAccrualTransitions(
  from: AccrualWorkflowStatusPhase1
): AccrualWorkflowStatusPhase1[] {
  return ACCRUAL_WORKFLOW_TRANSITIONS[from] ?? [];
}

export function canTransitionAccrualStatus(
  from: AccrualWorkflowStatusPhase1,
  to: AccrualWorkflowStatusPhase1
): boolean {
  return getAllowedAccrualTransitions(from).includes(to);
}

export type AccrualTransitionValidationResult =
  | { ok: true }
  | { ok: false; code: "INVALID_STATUS" | "INVALID_TRANSITION"; message: string };

export function validateAccrualStatusTransition(
  from: AccrualWorkflowStatusPhase1,
  to: AccrualWorkflowStatusPhase1
): AccrualTransitionValidationResult {
  if (!isAccrualWorkflowStatusPhase1(from) || !isAccrualWorkflowStatusPhase1(to)) {
    return { ok: false, code: "INVALID_STATUS", message: "Statut accrual invalide." };
  }

  if (!canTransitionAccrualStatus(from, to)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Transition interdite : ${from} → ${to}.`,
    };
  }

  return { ok: true };
}
