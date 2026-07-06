import { describe, expect, it } from "vitest";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_SOLD,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_STATUS_CANCELLED,
  COMPENSATION_EVENT_TYPE_SALE,
  isSaleCompensationEventActive,
  isSaleCompensationEventDelivered,
  validateSaleCompensationEventInput,
  validateSaleCompensationEventUpdateInput,
  type CompensationEvent,
} from "./compensation-events.shared";

const baseDeliveredEvent: CompensationEvent = {
  event_type: COMPENSATION_EVENT_TYPE_SALE,
  status: COMPENSATION_EVENT_STATUS_ACTIVE,
  sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  chauffeur_id: 21,
  amount: 1500,
  sold_at: "2026-07-01",
  delivered_at: "2026-07-03",
  invoiced_at: null,
  collected_at: null,
  company_context: "oliem_solutions",
  external_reference: "VTE-1001",
  label: "Vente terrain",
  notes: null,
};

describe("validateSaleCompensationEventInput", () => {
  it("accepte une vente sale valide livrée", () => {
    const result = validateSaleCompensationEventInput({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      status: COMPENSATION_EVENT_STATUS_ACTIVE,
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      chauffeur_id: 21,
      amount: 1500,
      sold_at: "2026-07-01",
      delivered_at: "2026-07-03",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.event_type).toBe(COMPENSATION_EVENT_TYPE_SALE);
      expect(result.value.chauffeur_id).toBe(21);
    }
  });

  it("rejette un type hors périmètre Phase 1", () => {
    const result = validateSaleCompensationEventInput({
      event_type: "delivery",
      chauffeur_id: 21,
      amount: 100,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Type d'événement hors périmètre Phase 1.");
    }
  });

  it("rejette un montant négatif ou un employé manquant", () => {
    expect(
      validateSaleCompensationEventInput({
        event_type: COMPENSATION_EVENT_TYPE_SALE,
        chauffeur_id: null,
        amount: 100,
      }).ok
    ).toBe(false);

    expect(
      validateSaleCompensationEventInput({
        event_type: COMPENSATION_EVENT_TYPE_SALE,
        chauffeur_id: 21,
        amount: -1,
      }).ok
    ).toBe(false);
  });

  it("exige delivered_at quand la vente est livrée", () => {
    const result = validateSaleCompensationEventInput({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      chauffeur_id: 21,
      amount: 100,
      sold_at: "2026-07-01",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("delivered_at"))).toBe(true);
    }
  });
});

describe("validateSaleCompensationEventUpdateInput", () => {
  it("réutilise la validation create sur un patch fusionné", () => {
    const result = validateSaleCompensationEventUpdateInput(baseDeliveredEvent, {
      amount: 1800,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amount).toBe(1800);
    }
  });
});

describe("sale event helpers", () => {
  it("détecte une vente active", () => {
    expect(isSaleCompensationEventActive({ status: COMPENSATION_EVENT_STATUS_ACTIVE })).toBe(
      true
    );
    expect(isSaleCompensationEventActive({ status: COMPENSATION_EVENT_STATUS_CANCELLED })).toBe(
      false
    );
  });

  it("détecte une vente livrée via sale_state ou delivered_at", () => {
    expect(
      isSaleCompensationEventDelivered({
        sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
        delivered_at: null,
      })
    ).toBe(true);

    expect(
      isSaleCompensationEventDelivered({
        sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
        delivered_at: "2026-07-03",
      })
    ).toBe(true);

    expect(
      isSaleCompensationEventDelivered({
        sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
        delivered_at: null,
      })
    ).toBe(false);
  });
});
