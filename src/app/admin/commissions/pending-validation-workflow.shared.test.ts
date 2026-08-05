import { describe, expect, it } from "vitest";
import type { RecentPayPlanResultItem } from "@/app/admin/commissions/recent-pay-plan-results.shared";
import {
  filterPayPlanResultsPendingValidation,
  formatPendingValidationCategoryCounts,
  isPayPlanResultPendingValidation,
  PENDING_OBJECTIVE_COMMISSIONS_EMPTY,
  PENDING_PLAN_RESULT_CTA_LABEL,
  PENDING_PLAN_RESULTS_EMPTY,
  PENDING_VALIDATION_ZONE_TITLE,
} from "@/app/admin/commissions/pending-validation-workflow.shared";

function sample(
  overrides: Partial<RecentPayPlanResultItem> = {}
): RecentPayPlanResultItem {
  return {
    accrualId: "acc-1",
    organizationId: "org-1",
    templateId: "tpl-1",
    employeeId: 2,
    beneficiaryPrimary: "Yves",
    beneficiarySecondary: "Employé #2",
    planName: "QA 6F Plan pourcentage",
    versionLabel: "Version 1",
    ruleName: "Règle %",
    basisAmount: 1000,
    amount: 50,
    status: "under_review",
    processedAt: "2026-08-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("pending validation workflow clarity", () => {
  it("identifies under_review plan results as pending validation", () => {
    expect(isPayPlanResultPendingValidation(sample())).toBe(true);
    expect(
      isPayPlanResultPendingValidation(sample({ status: "validated" }))
    ).toBe(false);
  });

  it("keeps plan results visible when objective commissions are empty", () => {
    const pendingPlans = filterPayPlanResultsPendingValidation([
      sample({ accrualId: "a1", status: "under_review" }),
      sample({ accrualId: "a2", status: "validated", amount: 10 }),
    ]);
    const objectivePendingCount = 0;

    expect(pendingPlans).toHaveLength(1);
    expect(pendingPlans[0]?.beneficiaryPrimary).toBe("Yves");
    expect(pendingPlans[0]?.amount).toBe(50);

    const counts = formatPendingValidationCategoryCounts(
      pendingPlans.length,
      objectivePendingCount
    );
    expect(counts.plansLabel).toBe("Résultats de plans à valider : 1");
    expect(counts.objectivesLabel).toBe(
      "Commissions d’objectifs à valider : 0"
    );
    expect(PENDING_OBJECTIVE_COMMISSIONS_EMPTY).toBe(
      "Aucune commission liée aux objectifs à valider."
    );
    expect(PENDING_OBJECTIVE_COMMISSIONS_EMPTY).not.toBe(
      "Aucune commission à afficher"
    );
  });

  it("handles both categories empty without a misleading global empty copy", () => {
    const pendingPlans = filterPayPlanResultsPendingValidation([
      sample({ status: "validated" }),
      sample({ status: "calculated", accrualId: "a3" }),
    ]);
    const counts = formatPendingValidationCategoryCounts(pendingPlans.length, 0);

    expect(pendingPlans).toHaveLength(0);
    expect(counts.plansLabel).toBe("Résultats de plans à valider : 0");
    expect(counts.objectivesLabel).toBe(
      "Commissions d’objectifs à valider : 0"
    );
    expect(PENDING_PLAN_RESULTS_EMPTY).toBe(
      "Aucun résultat de plan à valider."
    );
    expect(PENDING_VALIDATION_ZONE_TITLE).toBe("Éléments à valider");
    expect(PENDING_PLAN_RESULT_CTA_LABEL).toBe(
      "Voir et valider la commission"
    );
  });
});
