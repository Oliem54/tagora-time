import { describe, expect, it } from "vitest";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "./compensation-events.shared";
import { buildCompensationCalculationContext } from "./compensation-calculation-context.shared";
import { calculateCompensationFromContext } from "./compensation-calculation.server";
import { generateAccrualDraftsFromCalculation } from "./compensation-accruals.server";

const baseEvent = {
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

describe("generateAccrualDraftsFromCalculation", () => {
  it("genere des accruals en memoire lies a compensation_event_id", () => {
    const built = buildCompensationCalculationContext({
      event: baseEvent,
      rules: [{ rule_type: "percentage", percentage_rate: 5, rule_name: "Commission" }],
      params: { assignee_label: "Vincent", period_start: "2026-07-01", period_end: "2026-07-31" },
    });
    if (!built.ok) throw new Error("context failed");

    const calculation = calculateCompensationFromContext(built.context);
    const accruals = generateAccrualDraftsFromCalculation(built.context, calculation);

    expect(accruals).toHaveLength(1);
    expect(accruals[0]?.compensation_event_id).toBe(baseEvent.id);
    expect(accruals[0]?.component).toBe("commission");
    expect(accruals[0]?.calculated_amount).toBe(500);
    expect(accruals[0]?.status).toBe("estimated");
    expect(accruals[0]?.period_start).toBe("2026-07-01");
  });

  it("retourne une liste vide si calcul skip", () => {
    const built = buildCompensationCalculationContext({
      event: baseEvent,
      rules: [{ rule_type: "fixed", fixed_amount: 100 }],
    });
    if (!built.ok) throw new Error("context failed");

    const calculation = calculateCompensationFromContext({
      ...built.context,
      is_calculable: false,
      rejection_reason: "Livraison requise.",
    });

    expect(generateAccrualDraftsFromCalculation(built.context, calculation)).toEqual([]);
  });
});
