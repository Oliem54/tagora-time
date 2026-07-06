import {
  validateSaleCompensationEventInput,
  validateSaleCompensationEventUpdateInput,
  type CompensationEventInput,
} from "@/app/lib/commissions/compensation-events.shared";
import {
  mapDomainToCompensationEventInsertPayload,
  mapDomainToCompensationEventUpdatePayload,
  type CompensationEventRow,
} from "@/app/lib/commissions/compensation-events.mapper.server";
import type { CompensationEventsRepository } from "@/app/lib/commissions/compensation-events.persistence.shared";
import type { CompensationEventListFilters } from "@/app/lib/commissions/compensation-events.persistence.shared";
import {
  evaluateSaleEventEligibility,
  type EligibilityResult,
} from "@/app/lib/commissions/eligibility.server";

export type CompensationEventRecordWithEligibility = CompensationEventRow & {
  eligibility: EligibilityResult;
};

export type CompensationEventServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "VALIDATION" | "NOT_FOUND" | "PERSISTENCE"; errors: string[] };

export type CompensationEventsServiceDeps = {
  repository: CompensationEventsRepository;
};

function withEligibility(event: CompensationEventRow): CompensationEventRecordWithEligibility {
  return {
    ...event,
    eligibility: evaluateSaleEventEligibility(event),
  };
}

function persistenceError(error: unknown): CompensationEventServiceResult<never> {
  const message = error instanceof Error ? error.message : "Erreur persistance compensation event.";
  return { ok: false, code: "PERSISTENCE", errors: [message] };
}

export function createCompensationEventsService(deps: CompensationEventsServiceDeps) {
  const { repository } = deps;

  return {
    async createSaleEvent(
      input: CompensationEventInput,
      options?: { actorUserId?: string | null }
    ): Promise<CompensationEventServiceResult<CompensationEventRecordWithEligibility>> {
      const validation = validateSaleCompensationEventInput(input);
      if (!validation.ok) {
        return { ok: false, code: "VALIDATION", errors: validation.errors };
      }

      try {
        const inserted = await repository.insert(
          mapDomainToCompensationEventInsertPayload(validation.value, {
            actorUserId: options?.actorUserId ?? null,
          })
        );
        return { ok: true, value: withEligibility(inserted) };
      } catch (error) {
        return persistenceError(error);
      }
    },

    async getSaleEvent(
      id: string
    ): Promise<CompensationEventServiceResult<CompensationEventRecordWithEligibility>> {
      try {
        const event = await repository.getById(id);
        if (!event) {
          return { ok: false, code: "NOT_FOUND", errors: ["Compensation event introuvable."] };
        }
        return { ok: true, value: withEligibility(event) };
      } catch (error) {
        return persistenceError(error);
      }
    },

    async listSaleEvents(
      filters?: CompensationEventListFilters
    ): Promise<CompensationEventServiceResult<CompensationEventRecordWithEligibility[]>> {
      try {
        const events = await repository.list(filters);
        return { ok: true, value: events.map(withEligibility) };
      } catch (error) {
        return persistenceError(error);
      }
    },

    async updateSaleEvent(
      id: string,
      patch: CompensationEventInput,
      options?: { actorUserId?: string | null }
    ): Promise<CompensationEventServiceResult<CompensationEventRecordWithEligibility>> {
      try {
        const current = await repository.getById(id);
        if (!current) {
          return { ok: false, code: "NOT_FOUND", errors: ["Compensation event introuvable."] };
        }

        const validation = validateSaleCompensationEventUpdateInput(current, patch);
        if (!validation.ok) {
          return { ok: false, code: "VALIDATION", errors: validation.errors };
        }

        const updated = await repository.update(
          id,
          mapDomainToCompensationEventUpdatePayload(validation.value, {
            actorUserId: options?.actorUserId ?? null,
          })
        );

        if (!updated) {
          return { ok: false, code: "NOT_FOUND", errors: ["Compensation event introuvable."] };
        }

        return { ok: true, value: withEligibility(updated) };
      } catch (error) {
        return persistenceError(error);
      }
    },
  };
}
