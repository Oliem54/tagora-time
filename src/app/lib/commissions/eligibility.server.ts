import {
  COMPENSATION_EVENT_TYPE_SALE,
  isCompensationEventType,
  isSaleCompensationEventActive,
  isSaleCompensationEventDelivered,
  type CompensationEvent,
} from "@/app/lib/commissions/compensation-events.shared";

export type EligibilityCriterionId =
  | "event_type_is_sale"
  | "event_is_active"
  | "event_is_delivered";

export type EligibilityCriterionResult = {
  criterion: EligibilityCriterionId;
  passed: boolean;
  message: string;
};

export type EligibilityResult = {
  is_eligible: boolean;
  criteria_evaluated: EligibilityCriterionResult[];
  rejection_reason: string | null;
};

export const ELIGIBILITY_REJECTION_EVENT_TYPE =
  "Type d'événement hors périmètre Phase 1.";
export const ELIGIBILITY_REJECTION_CANCELLED = "Vente annulée.";
export const ELIGIBILITY_REJECTION_NOT_ACTIVE = "Événement non actif.";
export const ELIGIBILITY_REJECTION_NOT_DELIVERED = "Livraison requise.";

function buildResult(
  criteria_evaluated: EligibilityCriterionResult[]
): EligibilityResult {
  const failed = criteria_evaluated.find((item) => !item.passed);
  return {
    is_eligible: !failed,
    criteria_evaluated,
    rejection_reason: failed?.message ?? null,
  };
}

export function evaluateSaleEventEligibility(
  event: Pick<
    CompensationEvent,
    "event_type" | "status" | "sale_state" | "delivered_at"
  >
): EligibilityResult {
  const criteria: EligibilityCriterionResult[] = [];

  const typePassed = isCompensationEventType(event.event_type);
  criteria.push({
    criterion: "event_type_is_sale",
    passed: typePassed,
    message: typePassed
      ? "Type de vente admissible Phase 1."
      : ELIGIBILITY_REJECTION_EVENT_TYPE,
  });

  if (!typePassed) {
    return buildResult(criteria);
  }

  const activePassed = isSaleCompensationEventActive(event);
  criteria.push({
    criterion: "event_is_active",
    passed: activePassed,
    message: activePassed
      ? "Événement actif."
      : event.status === "cancelled"
        ? ELIGIBILITY_REJECTION_CANCELLED
        : ELIGIBILITY_REJECTION_NOT_ACTIVE,
  });

  if (!activePassed) {
    return buildResult(criteria);
  }

  const deliveredPassed = isSaleCompensationEventDelivered(event);
  criteria.push({
    criterion: "event_is_delivered",
    passed: deliveredPassed,
    message: deliveredPassed ? "Vente livrée." : ELIGIBILITY_REJECTION_NOT_DELIVERED,
  });

  return buildResult(criteria);
}

export function isPhase1SaleEventEligible(
  event: Pick<
    CompensationEvent,
    "event_type" | "status" | "sale_state" | "delivered_at"
  >
): boolean {
  return evaluateSaleEventEligibility(event).is_eligible;
}

/** Alias explicite pour les appels centrés sur le type sale Phase 1. */
export const evaluateCompensationEventEligibility = evaluateSaleEventEligibility;

export function assertPhase1SaleEventType(
  eventType: unknown
): eventType is typeof COMPENSATION_EVENT_TYPE_SALE {
  return isCompensationEventType(eventType);
}
