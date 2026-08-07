import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAID_COMMISSIONS_KPI_LABEL,
  computePaidCommissionsKpiTotals,
} from "./paid-commissions-kpi.shared";
import { formatCad } from "./commissions.shared";

describe("computePaidCommissionsKpiTotals", () => {
  const orgA = "org-a";
  const orgB = "org-b";

  it("CAS A : objectifs 0 + plans 100 = 100", () => {
    const totals = computePaidCommissionsKpiTotals({
      organizationId: orgA,
      objectiveEntries: [],
      planAccruals: [
        { organizationId: orgA, status: "paid", amount: 50 },
        { organizationId: orgA, status: "paid", amount: 50 },
      ],
    });
    expect(totals).toEqual({
      paidObjectiveTotal: 0,
      paidPlanTotal: 100,
      paidCombinedTotal: 100,
    });
    expect(formatCad(totals.paidCombinedTotal)).toBe(formatCad(100));
  });

  it("CAS B : objectifs 75 + plans 100 = 175", () => {
    const totals = computePaidCommissionsKpiTotals({
      organizationId: orgA,
      objectiveEntries: [
        { organizationId: orgA, status: "paid", amount: 50 },
        { organizationId: orgA, status: "paid", amount: 25 },
      ],
      planAccruals: [
        { organizationId: orgA, status: "paid", amount: 50 },
        { organizationId: orgA, status: "paid", amount: 50 },
      ],
    });
    expect(totals.paidObjectiveTotal).toBe(75);
    expect(totals.paidPlanTotal).toBe(100);
    expect(totals.paidCombinedTotal).toBe(175);
  });

  it("CAS C : objectifs 75 + plans 0 = 75", () => {
    const totals = computePaidCommissionsKpiTotals({
      organizationId: orgA,
      objectiveEntries: [
        { organizationId: orgA, status: "paid", amount: 75 },
      ],
      planAccruals: [],
    });
    expect(totals).toEqual({
      paidObjectiveTotal: 75,
      paidPlanTotal: 0,
      paidCombinedTotal: 75,
    });
  });

  it("CAS D : aucune commission paid = 0", () => {
    const totals = computePaidCommissionsKpiTotals({
      organizationId: orgA,
      objectiveEntries: [
        { organizationId: orgA, status: "pending_validation", amount: 40 },
      ],
      planAccruals: [
        { organizationId: orgA, status: "validated", amount: 50 },
      ],
    });
    expect(totals).toEqual({
      paidObjectiveTotal: 0,
      paidPlanTotal: 0,
      paidCombinedTotal: 0,
    });
  });

  it("CAS E : isolation tenant — autre organisation exclue", () => {
    const totals = computePaidCommissionsKpiTotals({
      organizationId: orgA,
      objectiveEntries: [
        { organizationId: orgA, status: "paid", amount: 10 },
        { organizationId: orgB, status: "paid", amount: 999 },
      ],
      planAccruals: [
        { organizationId: orgA, status: "paid", amount: 20 },
        { organizationId: orgB, status: "paid", amount: 888 },
      ],
    });
    expect(totals.paidObjectiveTotal).toBe(10);
    expect(totals.paidPlanTotal).toBe(20);
    expect(totals.paidCombinedTotal).toBe(30);
  });

  it("CAS F : accruals validated exclus", () => {
    const totals = computePaidCommissionsKpiTotals({
      organizationId: orgA,
      objectiveEntries: [
        { organizationId: orgA, status: "paid", amount: 5 },
        { organizationId: orgA, status: "estimated", amount: 100 },
        { organizationId: orgA, status: "cancelled", amount: 100 },
      ],
      planAccruals: [
        { organizationId: orgA, status: "paid", amount: 50 },
        { organizationId: orgA, status: "validated", amount: 50 },
        { organizationId: orgA, status: "calculated", amount: 50 },
      ],
    });
    expect(totals.paidObjectiveTotal).toBe(5);
    expect(totals.paidPlanTotal).toBe(50);
    expect(totals.paidCombinedTotal).toBe(55);
  });

  it("évite la double comptabilisation entre sources distinctes", () => {
    const totals = computePaidCommissionsKpiTotals({
      organizationId: orgA,
      objectiveEntries: [
        { organizationId: orgA, status: "paid", amount: 40 },
      ],
      planAccruals: [
        { organizationId: orgA, status: "paid", amount: 40 },
      ],
    });
    // Deux sources distinctes : 40 + 40 = 80, pas 40.
    expect(totals.paidCombinedTotal).toBe(80);
    expect(totals.paidObjectiveTotal + totals.paidPlanTotal).toBe(
      totals.paidCombinedTotal
    );
  });

  it("organizationId vide → zéro", () => {
    expect(
      computePaidCommissionsKpiTotals({
        organizationId: "  ",
        objectiveEntries: [
          { organizationId: orgA, status: "paid", amount: 10 },
        ],
        planAccruals: [{ organizationId: orgA, status: "paid", amount: 10 }],
      }).paidCombinedTotal
    ).toBe(0);
  });

  it("conserve le libellé officiel du KPI", () => {
    expect(PAID_COMMISSIONS_KPI_LABEL).toBe("Commissions payées");
  });

  it("branche le KPI admin sur le total combiné sans renommer le libellé", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/admin/commissions/AdminCommissionsPageClient.tsx"
      ),
      "utf8"
    );
    expect(source).toMatch(/PAID_COMMISSIONS_KPI_LABEL/);
    expect(source).toMatch(/computePaidCommissionsKpiTotals/);
    expect(source).toMatch(/paidCombinedTotal/);
    expect(source).toMatch(/label: PAID_COMMISSIONS_KPI_LABEL/);
    expect(source).not.toMatch(/Commissions d'objectifs payées/);
  });

  it("API summary expose le total combiné scoped organisation", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/api/direction/commissions/summary/route.ts"
      ),
      "utf8"
    );
    expect(source).toMatch(/computePaidCommissionsKpiTotals/);
    expect(source).toMatch(/resolvePayPlanOrganization/);
    expect(source).toMatch(/paidCombinedTotal/);
    expect(source).toMatch(/compensation_accruals/);
    expect(source).toMatch(/organization_id/);
  });
});
