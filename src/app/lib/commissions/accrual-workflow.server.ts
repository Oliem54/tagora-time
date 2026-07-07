import type { Accrual } from "@/app/lib/commissions/accruals.shared";
import type {
  AccrualStatusHistoryRepository,
  AccrualsRepository,
} from "@/app/lib/commissions/accruals.persistence.shared";
import { validateAccrualStatusTransition } from "@/app/lib/commissions/accrual-workflow.shared";

export type AccrualWorkflowTransitionInput = {
  accrualId: string;
  targetStatus: Accrual["status"];
  actorUserId?: string | null;
  reason?: string | null;
};

export type AccrualWorkflowTransitionResult =
  | { ok: true; accrual: Accrual }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID_TRANSITION" | "PERSISTENCE";
      errors: string[];
    };

export type AccrualWorkflowDeps = {
  accrualsRepository: AccrualsRepository;
  statusHistoryRepository: AccrualStatusHistoryRepository;
};

function persistenceError(error: unknown): AccrualWorkflowTransitionResult {
  const message = error instanceof Error ? error.message : "Erreur workflow accrual.";
  return { ok: false, code: "PERSISTENCE", errors: [message] };
}

export function createAccrualWorkflow(deps: AccrualWorkflowDeps) {
  const { accrualsRepository, statusHistoryRepository } = deps;

  return {
    async transitionAccrualStatus(
      input: AccrualWorkflowTransitionInput
    ): Promise<AccrualWorkflowTransitionResult> {
      try {
        const current = await accrualsRepository.getById(input.accrualId);
        if (!current) {
          return { ok: false, code: "NOT_FOUND", errors: ["Accrual introuvable."] };
        }

        const validation = validateAccrualStatusTransition(current.status, input.targetStatus);
        if (!validation.ok) {
          return {
            ok: false,
            code: "INVALID_TRANSITION",
            errors: [validation.message],
          };
        }

        const updated = await accrualsRepository.updateStatus(input.accrualId, input.targetStatus, {
          actorUserId: input.actorUserId ?? null,
        });

        if (!updated) {
          return { ok: false, code: "NOT_FOUND", errors: ["Accrual introuvable."] };
        }

        await statusHistoryRepository.append({
          accrual_id: updated.id,
          from_status: current.status,
          to_status: input.targetStatus,
          changed_by: input.actorUserId ?? null,
          reason: input.reason ?? null,
        });

        return { ok: true, accrual: updated };
      } catch (error) {
        return persistenceError(error);
      }
    },

    async submitForReview(
      accrualId: string,
      options?: { actorUserId?: string | null; reason?: string | null }
    ) {
      return this.transitionAccrualStatus({
        accrualId,
        targetStatus: "under_review",
        actorUserId: options?.actorUserId,
        reason: options?.reason,
      });
    },

    async validateAccrual(
      accrualId: string,
      options?: { actorUserId?: string | null; reason?: string | null }
    ) {
      return this.transitionAccrualStatus({
        accrualId,
        targetStatus: "validated",
        actorUserId: options?.actorUserId,
        reason: options?.reason,
      });
    },

    async sendBackToCalculated(
      accrualId: string,
      options?: { actorUserId?: string | null; reason?: string | null }
    ) {
      return this.transitionAccrualStatus({
        accrualId,
        targetStatus: "calculated",
        actorUserId: options?.actorUserId,
        reason: options?.reason,
      });
    },
  };
}

export type AccrualWorkflow = ReturnType<typeof createAccrualWorkflow>;
