import { describe, expect, it } from "vitest";
import {
  filterRecentPayPlanResultsForOrganization,
  filterRecentPayPlanResultsForTemplate,
  rememberRecentPayPlanResult,
  toPersistedPayPlanResultItem,
  type RecentPayPlanResultItem,
} from "@/app/admin/commissions/recent-pay-plan-results.shared";

const sample: RecentPayPlanResultItem = {
  accrualId: "acc-1",
  organizationId: "org-a",
  templateId: "tpl-1",
  beneficiaryPrimary: "Yves",
  beneficiarySecondary: "Employé #2",
  planName: "QA 6F Plan pourcentage",
  versionLabel: "Version 1",
  ruleName: "Pourcentage",
  basisAmount: 1000,
  amount: 50,
  status: "validated",
  processedAt: "2026-08-04T12:00:00.000Z",
};

describe("recent pay plan results memory", () => {
  it("remembers Yves QA result at the top", () => {
    const next = rememberRecentPayPlanResult(sample, []);
    expect(next[0]?.beneficiaryPrimary).toBe("Yves");
    expect(next[0]?.beneficiarySecondary).toBe("Employé #2");
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

  it("filters by template for plan page last result", () => {
    const scoped = filterRecentPayPlanResultsForTemplate(
      [
        sample,
        { ...sample, accrualId: "acc-2", templateId: "tpl-other" },
      ],
      "tpl-1"
    );
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.accrualId).toBe("acc-1");
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

  it("maps persisted accrual trace to Yves QA card fields", () => {
    const mapped = toPersistedPayPlanResultItem({
      accrualId: "acc-1",
      organizationId: "org-a",
      status: "validated",
      createdAt: "2026-08-04T12:00:00.000Z",
      beneficiary: {
        primary: "Yves",
        secondary: "Employé #2",
        employeeId: 2,
        usedTechnicalFallback: false,
      },
      trace: {
        template_id: "tpl-1",
        template_code: "qa_6f_pct",
        template_name: "QA 6F Plan pourcentage",
        version_id: "ver-1",
        version_number: 1,
        rule_module_id: "rule-1",
        rule_kind: "percentage_of_eligible_sales",
        rule_name: "Pourcentage",
        assignment_id: "asg-1",
        employee_id: 2,
        organization_id: "org-a",
        basis_amount: 1000,
        rate_percent: 5,
        fixed_amount: null,
        calculated_amount: 50,
        event_id: "evt-1",
        accrual_id: "acc-1",
        processed_at: "2026-08-04T12:00:00.000Z",
      },
    });
    expect(mapped.beneficiaryPrimary).toBe("Yves");
    expect(mapped.beneficiarySecondary).toBe("Employé #2");
    expect(mapped.amount).toBe(50);
    expect(mapped.planName).toBe("QA 6F Plan pourcentage");
    expect(mapped.versionLabel).toBe("Version 1");
    expect(mapped.status).toBe("validated");
  });
});
