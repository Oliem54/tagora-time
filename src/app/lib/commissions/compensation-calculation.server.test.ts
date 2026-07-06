import { describe, expect, it } from "vitest";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_SOLD,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "./compensation-events.shared";
import { buildCompensationCalculationContext } from "./compensation-calculation-context.shared";
import { calculateCompensationFromContext } from "./compensation-calculation.server";

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

function buildContext(
  rules: unknown,
  params?: { objective_achieved?: boolean }
) {
  const built = buildCompensationCalculationContext({ event: baseEvent, rules, params });
  if (!built.ok) throw new Error("context build failed");
  return built.context;
}

describe("calculateCompensationFromContext", () => {
  it("calcule une commission en pourcentage", () => {
    const context = buildContext([
      { rule_type: "percentage", percentage_rate: 5, rule_name: "Commission terrain" },
    ]);
    const result = calculateCompensationFromContext(context);

    expect(result.skipped).toBe(false);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.calculated_amount).toBe(500);
    expect(result.lines[0]?.component).toBe("commission");
  });

  it("calcule une commission fixe", () => {
    const context = buildContext([{ rule_type: "fixed", fixed_amount: 250, rule_name: "Fixe" }]);
    const result = calculateCompensationFromContext(context);

    expect(result.lines[0]?.calculated_amount).toBe(250);
  });

  it("ajoute un bonus separe si objectif atteint", () => {
    const context = buildContext(
      [
        {
          rule_type: "percentage",
          percentage_rate: 5,
          achievement_bonus_amount: 100,
          rule_name: "Commission",
        },
      ],
      { objective_achieved: true }
    );
    const result = calculateCompensationFromContext(context);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]?.component).toBe("commission");
    expect(result.lines[1]?.component).toBe("bonus");
    expect(result.lines[1]?.calculated_amount).toBe(100);
  });

  it("supporte une correction negative", () => {
    const context = buildContext([
      {
        rule_type: "fixed",
        fixed_amount: -50,
        component: "correction",
        rule_name: "Ajustement",
      },
    ]);
    const result = calculateCompensationFromContext(context);

    expect(result.lines[0]?.component).toBe("correction");
    expect(result.lines[0]?.calculated_amount).toBe(-50);
  });

  it("ne calcule rien si contexte non calculable", () => {
    const built = buildCompensationCalculationContext({
      event: {
        ...baseEvent,
        sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
        delivered_at: null,
      },
      rules: [{ rule_type: "fixed", fixed_amount: 100 }],
    });
    if (!built.ok) throw new Error("unexpected");

    const result = calculateCompensationFromContext(built.context);
    expect(result.skipped).toBe(true);
    expect(result.lines).toHaveLength(0);
  });
});
