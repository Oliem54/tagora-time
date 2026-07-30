import { describe, expect, it } from "vitest";
import {
  summarizeEmployeeSalesBookKpis,
  type EmployeeSalesBookKpiObjective,
} from "./employee-sales-book-kpi.shared";

function objective(
  overrides: Partial<EmployeeSalesBookKpiObjective> & { status: string }
): EmployeeSalesBookKpiObjective {
  return {
    target_type: "amount",
    target_amount: 1000,
    target_sales_count: null,
    achieved_amount: 780,
    achieved_sales_count: 0,
    total_calculated_amount: 0,
    entries_pending_validation: 0,
    entries_paid: 0,
    entries_count: 0,
    ...overrides,
  };
}

describe("summarizeEmployeeSalesBookKpis", () => {
  it("compte 5 objectifs actifs une seule fois (jamais 10)", () => {
    const objectives = Array.from({ length: 5 }, () => objective({ status: "active" }));
    const summary = summarizeEmployeeSalesBookKpis(objectives);
    expect(summary.activeObjectives).toBe(5);
    expect(summary.activeObjectives).not.toBe(10);
    expect(summary.totalObjectives).toBe(5);
  });

  it("ne compte que les statuts active et partially_achieved", () => {
    const summary = summarizeEmployeeSalesBookKpis([
      objective({ status: "active" }),
      objective({ status: "partially_achieved" }),
      objective({ status: "draft" }),
      objective({ status: "cancelled" }),
      objective({ status: "achieved" }),
      objective({ status: "behind" }),
    ]);
    expect(summary.activeObjectives).toBe(2);
    expect(summary.totalObjectives).toBe(6);
  });

  it("retourne 0 actif sans objectif et sans erreur", () => {
    const summary = summarizeEmployeeSalesBookKpis([]);
    expect(summary).toEqual({
      totalObjectives: 0,
      activeObjectives: 0,
      averageProgress: 0,
      totalCalculated: 0,
      entriesPending: 0,
      entriesPaid: 0,
      entriesTotal: 0,
    });
  });

  it("conserve les autres agrégats (progression, commissions, entrées)", () => {
    const summary = summarizeEmployeeSalesBookKpis([
      objective({
        status: "active",
        target_amount: 1000,
        achieved_amount: 800,
        total_calculated_amount: 2000,
        entries_pending_validation: 1,
        entries_paid: 0,
        entries_count: 2,
      }),
      objective({
        status: "partially_achieved",
        target_amount: 1000,
        achieved_amount: 600,
        total_calculated_amount: 3300,
        entries_pending_validation: 0,
        entries_paid: 2,
        entries_count: 2,
      }),
      objective({
        status: "draft",
        target_amount: 1000,
        achieved_amount: 0,
        total_calculated_amount: 999,
        entries_pending_validation: 3,
        entries_paid: 1,
        entries_count: 4,
      }),
    ]);

    expect(summary.activeObjectives).toBe(2);
    expect(summary.averageProgress).toBe(70);
    expect(summary.totalCalculated).toBe(6299);
    expect(summary.entriesPending).toBe(4);
    expect(summary.entriesPaid).toBe(3);
    expect(summary.entriesTotal).toBe(8);
  });
});
