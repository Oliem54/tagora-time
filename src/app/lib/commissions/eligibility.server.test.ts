import { describe, expect, it } from "vitest";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_SOLD,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_STATUS_CANCELLED,
  COMPENSATION_EVENT_STATUS_CORRECTED,
  COMPENSATION_EVENT_TYPE_SALE,
} from "./compensation-events.shared";
import {
  ELIGIBILITY_REJECTION_CANCELLED,
  ELIGIBILITY_REJECTION_EVENT_TYPE,
  ELIGIBILITY_REJECTION_NOT_ACTIVE,
  ELIGIBILITY_REJECTION_NOT_DELIVERED,
  evaluateSaleEventEligibility,
  isPhase1SaleEventEligible,
} from "./eligibility.server";

describe("evaluateSaleEventEligibility", () => {
  it("accepte une vente active livrée", () => {
    const result = evaluateSaleEventEligibility({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      status: COMPENSATION_EVENT_STATUS_ACTIVE,
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      delivered_at: "2026-07-03",
    });

    expect(result.is_eligible).toBe(true);
    expect(result.rejection_reason).toBeNull();
    expect(result.criteria_evaluated.every((item) => item.passed)).toBe(true);
  });

  it("rejette une vente annulée", () => {
    const result = evaluateSaleEventEligibility({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      status: COMPENSATION_EVENT_STATUS_CANCELLED,
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      delivered_at: "2026-07-03",
    });

    expect(result.is_eligible).toBe(false);
    expect(result.rejection_reason).toBe(ELIGIBILITY_REJECTION_CANCELLED);
  });

  it("rejette une vente vendue mais non livrée", () => {
    const result = evaluateSaleEventEligibility({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      status: COMPENSATION_EVENT_STATUS_ACTIVE,
      sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
      delivered_at: null,
    });

    expect(result.is_eligible).toBe(false);
    expect(result.rejection_reason).toBe(ELIGIBILITY_REJECTION_NOT_DELIVERED);
  });

  it("rejette un type hors périmètre Phase 1", () => {
    const result = evaluateSaleEventEligibility({
      event_type: "service" as unknown as typeof COMPENSATION_EVENT_TYPE_SALE,
      status: COMPENSATION_EVENT_STATUS_ACTIVE,
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      delivered_at: "2026-07-03",
    });

    expect(result.is_eligible).toBe(false);
    expect(result.rejection_reason).toBe(ELIGIBILITY_REJECTION_EVENT_TYPE);
    expect(result.criteria_evaluated).toHaveLength(1);
  });

  it("rejette un événement corrigé non actif", () => {
    const result = evaluateSaleEventEligibility({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      status: COMPENSATION_EVENT_STATUS_CORRECTED,
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      delivered_at: "2026-07-03",
    });

    expect(result.is_eligible).toBe(false);
    expect(result.rejection_reason).toBe(ELIGIBILITY_REJECTION_NOT_ACTIVE);
  });

  it("expose les critères évalués dans l'ordre métier", () => {
    const result = evaluateSaleEventEligibility({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      status: COMPENSATION_EVENT_STATUS_ACTIVE,
      sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
      delivered_at: null,
    });

    expect(result.criteria_evaluated.map((item) => item.criterion)).toEqual([
      "event_type_is_sale",
      "event_is_active",
      "event_is_delivered",
    ]);
  });
});

describe("isPhase1SaleEventEligible", () => {
  it("retourne un booléen cohérent avec evaluateSaleEventEligibility", () => {
    const event = {
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      status: COMPENSATION_EVENT_STATUS_ACTIVE,
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      delivered_at: "2026-07-03",
    };

    expect(isPhase1SaleEventEligible(event)).toBe(
      evaluateSaleEventEligibility(event).is_eligible
    );
  });
});
