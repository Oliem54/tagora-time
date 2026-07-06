import { describe, expect, it } from "vitest";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_SOLD,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "./compensation-events.shared";
import { buildCompensationCalculationContext } from "./compensation-calculation-context.shared";

const eligibleEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  event_type: COMPENSATION_EVENT_TYPE_SALE,
  status: COMPENSATION_EVENT_STATUS_ACTIVE,
  sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  chauffeur_id: 21,
  amount: 10000,
  sold_at: "2026-07-01",
  delivered_at: "2026-07-03",
  invoiced_at: null,
  collected_at: null,
  company_context: null,
  external_reference: null,
  label: null,
  notes: null,
};

describe("buildCompensationCalculationContext", () => {
  it("prepare un contexte calculable sans calculer", () => {
    const result = buildCompensationCalculationContext({
      event: eligibleEvent,
      rules: [{ rule_type: "percentage", percentage_rate: 5, rule_name: "Commission" }],
      params: { objective_achieved: true, assignee_label: "Vincent" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.context.is_calculable).toBe(true);
    expect(result.context.sales_basis_amount).toBe(10000);
    expect(result.context.rules).toHaveLength(1);
    expect(result.context.eligibility.is_eligible).toBe(true);
    expect(result.context.rejection_reason).toBeNull();
  });

  it("retourne un contexte non calculable si ineligible", () => {
    const result = buildCompensationCalculationContext({
      event: {
        ...eligibleEvent,
        sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
        delivered_at: null,
      },
      rules: [{ rule_type: "percentage", percentage_rate: 5 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.context.is_calculable).toBe(false);
    expect(result.context.rejection_reason).toBe("Livraison requise.");
  });

  it("refuse un event sans id", () => {
    const result = buildCompensationCalculationContext({
      event: { ...eligibleEvent, id: "" },
      rules: [],
    });

    expect(result.ok).toBe(false);
  });
});
