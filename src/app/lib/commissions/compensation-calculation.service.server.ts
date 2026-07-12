import type { CompensationEventRow } from "@/app/lib/commissions/compensation-events.mapper.server";
import { createCompensationEventsService } from "@/app/lib/commissions/compensation-events.service.server";
import type { CompensationEventsServiceDeps } from "@/app/lib/commissions/compensation-events.service.server";
import type { AccrualDraft } from "@/app/lib/commissions/accruals.shared";
import { generateAccrualDraftsFromCalculation } from "@/app/lib/commissions/compensation-accruals.server";
import {
  buildCompensationCalculationContext,
  type CompensationCalculationContext,
} from "@/app/lib/commissions/compensation-calculation-context.shared";
import { calculateCompensationFromContext } from "@/app/lib/commissions/compensation-calculation.server";
import type {
  CalculationLineResult,
  CompensationCalculationParams,
  CompensationCalculationResult,
} from "@/app/lib/commissions/compensation-calculation.shared";

export type CompensationCalculationBundle = {
  context: CompensationCalculationContext;
  calculation: CompensationCalculationResult;
  accruals: AccrualDraft[];
};

export type CompensationCalculationServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION" | "INELIGIBLE"; errors: string[] };

export type CompensationCalculationServiceDeps = {
  eventsService: ReturnType<typeof createCompensationEventsService>;
};

export function createCompensationCalculationService(deps: CompensationCalculationServiceDeps) {
  const { eventsService } = deps;

  return {
    calculateAccrualsForEventRow(
      event: CompensationEventRow,
      rules: unknown,
      params?: CompensationCalculationParams
    ): CompensationCalculationServiceResult<CompensationCalculationBundle> {
      const contextResult = buildCompensationCalculationContext({
        event,
        rules,
        params,
      });

      if (!contextResult.ok) {
        return { ok: false, code: "VALIDATION", errors: contextResult.errors };
      }

      const { context } = contextResult;

      if (!context.is_calculable) {
        return {
          ok: false,
          code: "INELIGIBLE",
          errors: [context.rejection_reason ?? "Événement non admissible au calcul."],
        };
      }

      const calculation = calculateCompensationFromContext(context);
      const accruals = generateAccrualDraftsFromCalculation(context, calculation);

      return {
        ok: true,
        value: { context, calculation, accruals },
      };
    },

    async calculateAccrualsForEventId(
      eventId: string,
      rules: unknown,
      params?: CompensationCalculationParams
    ): Promise<CompensationCalculationServiceResult<CompensationCalculationBundle>> {
      const eventResult = await eventsService.getSaleEvent(eventId);
      if (!eventResult.ok) {
        return {
          ok: false,
          code: eventResult.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION",
          errors: eventResult.errors,
        };
      }

      return this.calculateAccrualsForEventRow(eventResult.value, rules, params);
    },

    previewCalculationForEventRow(
      event: CompensationEventRow,
      rules: unknown,
      params?: CompensationCalculationParams
    ): CompensationCalculationServiceResult<{
      context: CompensationCalculationContext;
      calculation: CompensationCalculationResult;
      lines: CalculationLineResult[];
      accruals: AccrualDraft[];
    }> {
      const contextResult = buildCompensationCalculationContext({
        event,
        rules,
        params,
      });

      if (!contextResult.ok) {
        return { ok: false, code: "VALIDATION", errors: contextResult.errors };
      }

      const { context } = contextResult;
      const calculation = calculateCompensationFromContext(context);
      const accruals = generateAccrualDraftsFromCalculation(context, calculation);

      return {
        ok: true,
        value: {
          context,
          calculation,
          lines: calculation.lines,
          accruals,
        },
      };
    },
  };
}

export type CompensationCalculationService = ReturnType<typeof createCompensationCalculationService>;

export function createCompensationCalculationServiceFromEventsDeps(
  deps: CompensationEventsServiceDeps
) {
  return createCompensationCalculationService({
    eventsService: createCompensationEventsService(deps),
  });
}
