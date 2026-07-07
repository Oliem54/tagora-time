import type { Accrual, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import { mapAccrualDraftToInsertPayload } from "@/app/lib/commissions/accruals.mapper.server";
import type {
  AccrualStatusHistoryRepository,
  AccrualsRepository,
} from "@/app/lib/commissions/accruals.persistence.shared";
import { createAccrualWorkflow } from "@/app/lib/commissions/accrual-workflow.server";
import type { CompensationCalculationService } from "@/app/lib/commissions/compensation-calculation.service.server";
import type { CompensationCalculationParams } from "@/app/lib/commissions/compensation-calculation.shared";

export type CompensationAccrualsServiceResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "VALIDATION"
        | "INELIGIBLE"
        | "INVALID_TRANSITION"
        | "PERSISTENCE";
      errors: string[];
    };

export type CompensationAccrualsServiceDeps = {
  accrualsRepository: AccrualsRepository;
  statusHistoryRepository: AccrualStatusHistoryRepository;
  calculationService: CompensationCalculationService;
};

const REPLACEABLE_ACCRUAL_STATUSES: Accrual["status"][] = ["draft", "calculated"];

function persistenceError(error: unknown): CompensationAccrualsServiceResult<never> {
  const message = error instanceof Error ? error.message : "Erreur persistance accrual.";
  return { ok: false, code: "PERSISTENCE", errors: [message] };
}

export function createCompensationAccrualsService(deps: CompensationAccrualsServiceDeps) {
  const { accrualsRepository, statusHistoryRepository, calculationService } = deps;
  const workflow = createAccrualWorkflow({ accrualsRepository, statusHistoryRepository });

  return {
    async calculateAndPersistAccrualsForEventId(
      eventId: string,
      rules: unknown,
      params?: CompensationCalculationParams,
      options?: { actorUserId?: string | null }
    ): Promise<
      CompensationAccrualsServiceResult<{
        accruals: Accrual[];
        history: AccrualStatusHistoryEntry[];
      }>
    > {
      const calculationResult = await calculationService.calculateAccrualsForEventId(
        eventId,
        rules,
        params
      );

      if (!calculationResult.ok) {
        return {
          ok: false,
          code: calculationResult.code,
          errors: calculationResult.errors,
        };
      }

      try {
        await accrualsRepository.deleteByEventIdAndStatuses(
          eventId,
          REPLACEABLE_ACCRUAL_STATUSES
        );

        const payloads = calculationResult.value.accruals.map((draft) =>
          mapAccrualDraftToInsertPayload(draft, {
            status: "calculated",
            actorUserId: options?.actorUserId ?? null,
          })
        );

        if (payloads.length === 0) {
          return { ok: true, value: { accruals: [], history: [] } };
        }

        const inserted = await accrualsRepository.insertMany(payloads);
        const history: AccrualStatusHistoryEntry[] = [];

        for (const accrual of inserted) {
          const entry = await statusHistoryRepository.append({
            accrual_id: accrual.id,
            from_status: null,
            to_status: "calculated",
            changed_by: options?.actorUserId ?? null,
            reason: "Calcul initial",
          });
          history.push(entry);
        }

        return { ok: true, value: { accruals: inserted, history } };
      } catch (error) {
        return persistenceError(error);
      }
    },

    async listAccrualsByEventId(
      compensationEventId: string
    ): Promise<CompensationAccrualsServiceResult<Accrual[]>> {
      try {
        const accruals = await accrualsRepository.listByEventId(compensationEventId);
        return { ok: true, value: accruals };
      } catch (error) {
        return persistenceError(error);
      }
    },

    async getAccrualById(id: string): Promise<CompensationAccrualsServiceResult<Accrual>> {
      try {
        const accrual = await accrualsRepository.getById(id);
        if (!accrual) {
          return { ok: false, code: "NOT_FOUND", errors: ["Accrual introuvable."] };
        }
        return { ok: true, value: accrual };
      } catch (error) {
        return persistenceError(error);
      }
    },

    async listAccrualStatusHistory(
      accrualId: string
    ): Promise<CompensationAccrualsServiceResult<AccrualStatusHistoryEntry[]>> {
      try {
        const accrual = await accrualsRepository.getById(accrualId);
        if (!accrual) {
          return { ok: false, code: "NOT_FOUND", errors: ["Accrual introuvable."] };
        }

        const history = await statusHistoryRepository.listByAccrualId(accrualId);
        return { ok: true, value: history };
      } catch (error) {
        return persistenceError(error);
      }
    },

    submitForReview(
      accrualId: string,
      options?: { actorUserId?: string | null; reason?: string | null }
    ) {
      return workflow.submitForReview(accrualId, options);
    },

    validateAccrual(
      accrualId: string,
      options?: { actorUserId?: string | null; reason?: string | null }
    ) {
      return workflow.validateAccrual(accrualId, options);
    },

    sendBackToCalculated(
      accrualId: string,
      options?: { actorUserId?: string | null; reason?: string | null }
    ) {
      return workflow.sendBackToCalculated(accrualId, options);
    },
  };
}

export type CompensationAccrualsService = ReturnType<typeof createCompensationAccrualsService>;
