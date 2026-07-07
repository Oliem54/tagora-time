import type { Accrual, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import { mapAccrualDraftToInsertPayload } from "@/app/lib/commissions/accruals.mapper.server";
import type {
  AccrualStatusHistoryRepository,
  AccrualsRepository,
} from "@/app/lib/commissions/accruals.persistence.shared";
import { generateAccrualDraftsFromCalculation } from "@/app/lib/commissions/compensation-accruals.server";
import { buildCompensationCalculationContext } from "@/app/lib/commissions/compensation-calculation-context.shared";
import { calculateCompensationFromContext } from "@/app/lib/commissions/compensation-calculation.server";
import type { CompensationCalculationParams } from "@/app/lib/commissions/compensation-calculation.shared";
import type {
  CompensationProcessingResult,
  CompensationProcessingSuccess,
} from "@/app/lib/commissions/compensation-processing.shared";
import type { createCompensationEventsService } from "@/app/lib/commissions/compensation-events.service.server";

export type CompensationProcessingServiceDeps = {
  eventsService: ReturnType<typeof createCompensationEventsService>;
  accrualsRepository: AccrualsRepository;
  statusHistoryRepository: AccrualStatusHistoryRepository;
};

const REPLACEABLE_ACCRUAL_STATUSES: Accrual["status"][] = ["draft", "calculated"];
const PROTECTED_ACCRUAL_STATUSES: Accrual["status"][] = ["under_review", "validated"];

function persistenceError(error: unknown): CompensationProcessingResult {
  const message = error instanceof Error ? error.message : "Erreur traitement compensation.";
  return { ok: false, code: "PERSISTENCE", errors: [message] };
}

function mapEventLoadError(
  code: "VALIDATION" | "NOT_FOUND" | "PERSISTENCE",
  errors: string[]
): CompensationProcessingResult {
  if (code === "NOT_FOUND") {
    return { ok: false, code: "NOT_FOUND", errors };
  }
  if (code === "VALIDATION") {
    return { ok: false, code: "VALIDATION", errors };
  }
  return { ok: false, code: "PERSISTENCE", errors };
}

export function createCompensationProcessingService(deps: CompensationProcessingServiceDeps) {
  const { eventsService, accrualsRepository, statusHistoryRepository } = deps;

  return {
    async processCompensationEventById(
      eventId: string,
      rules: unknown,
      params?: CompensationCalculationParams,
      options?: { actorUserId?: string | null }
    ): Promise<CompensationProcessingResult> {
      const eventResult = await eventsService.getSaleEvent(eventId);
      if (!eventResult.ok) {
        return mapEventLoadError(eventResult.code, eventResult.errors);
      }
      const event = eventResult.value;

      if (!event.eligibility.is_eligible) {
        return {
          ok: false,
          code: "INELIGIBLE",
          errors: [event.eligibility.rejection_reason ?? "Vente non admissible au traitement."],
        };
      }

      const contextResult = buildCompensationCalculationContext({
        event,
        rules,
        params,
      });
      if (!contextResult.ok) {
        return { ok: false, code: "VALIDATION", errors: contextResult.errors };
      }
      const context = contextResult.context;

      if (!context.is_calculable) {
        return {
          ok: false,
          code: "INELIGIBLE",
          errors: [context.rejection_reason ?? "Vente non admissible au calcul."],
        };
      }

      const calculation = calculateCompensationFromContext(context);
      const accrualDrafts = generateAccrualDraftsFromCalculation(context, calculation);

      try {
        const existing = await accrualsRepository.listByEventId(eventId);
        const hasProtectedAccruals = existing.some((row) =>
          PROTECTED_ACCRUAL_STATUSES.includes(row.status)
        );
        if (hasProtectedAccruals) {
          return {
            ok: false,
            code: "VALIDATION",
            errors: [
              "Impossible de recalculer: des accruals sont en revue ou deja valides.",
            ],
          };
        }

        await accrualsRepository.deleteByEventIdAndStatuses(
          eventId,
          REPLACEABLE_ACCRUAL_STATUSES
        );

        if (accrualDrafts.length === 0) {
          const value: CompensationProcessingSuccess = {
            event,
            context,
            calculation,
            accrual_drafts: [],
            accruals: [],
            history: [],
          };
          return { ok: true, value };
        }

        const payloads = accrualDrafts.map((draft) =>
          mapAccrualDraftToInsertPayload(draft, {
            status: "calculated",
            actorUserId: options?.actorUserId ?? null,
          })
        );

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

        const value: CompensationProcessingSuccess = {
          event,
          context,
          calculation,
          accrual_drafts: accrualDrafts,
          accruals: inserted,
          history,
        };
        return { ok: true, value };
      } catch (error) {
        return persistenceError(error);
      }
    },
  };
}

export type CompensationProcessingService = ReturnType<typeof createCompensationProcessingService>;
