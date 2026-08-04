import { describe, expect, it } from "vitest";
import {
  filterRecentPayPlanResultsForOrganization,
  rememberRecentPayPlanResult,
  type RecentPayPlanResultItem,
} from "@/app/admin/commissions/recent-pay-plan-results.shared";

const sample: RecentPayPlanResultItem = {
  accrualId: "acc-1",
  organizationId: "org-a",
  templateId: "tpl-1",
  beneficiaryPrimary: "Yves",
  planName: "QA 6F Plan pourcentage",
  amount: 50,
  status: "validated",
  processedAt: "2026-08-04T12:00:00.000Z",
};

describe("recent pay plan results memory", () => {
  it("remembers Yves QA result at the top", () => {
    const next = rememberRecentPayPlanResult(sample, []);
    expect(next[0]?.beneficiaryPrimary).toBe("Yves");
    expect(next[0]?.amount).toBe(50);
  });

  it("deduplicates by accrual and organization", () => {
    const next = rememberRecentPayPlanResult(
      { ...sample, amount: 50, status: "validated" },
      [{ ...sample, amount: 40, status: "calculated" }]
    );
    expect(next).toHaveLength(1);
    expect(next[0]?.amount).toBe(50);
    expect(next[0]?.status).toBe("validated");
  });

  it("keeps organization isolation for recent results", () => {
    const mixed = rememberRecentPayPlanResult(sample, [
      {
        ...sample,
        accrualId: "acc-2",
        organizationId: "org-b",
        beneficiaryPrimary: "Autre",
      },
    ]);
    const scoped = filterRecentPayPlanResultsForOrganization(mixed, "org-a");
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.beneficiaryPrimary).toBe("Yves");
  });

  it("rejects incomplete result rows", () => {
    const next = rememberRecentPayPlanResult(
      {
        ...sample,
        accrualId: "",
      },
      [sample]
    );
    expect(next).toHaveLength(1);
  });
});
