import { describe, expect, it } from "vitest";
import {
  accrualAmountsUnchanged,
  buildAccrualPayHistoryRow,
  buildAccrualPayPatch,
  canShowMarkAsPaidAction,
  evaluateAccrualPayTransition,
  evaluateAccrualValidateTransition,
  filterPaidPayPlanResults,
  hasAccrualActionPermission,
  isPayPlanAccrualPaid,
  permissionForAccrualAction,
} from "./pay-plan-accrual-payment.shared";

describe("evaluateAccrualPayTransition", () => {
  it("1. validated → paid = autorisé", () => {
    const decision = evaluateAccrualPayTransition("validated");
    expect(decision).toEqual({
      ok: true,
      mode: "transition",
      fromStatus: "validated",
      toStatus: "paid",
    });
  });

  it("2. calculated → paid = refusé", () => {
    const decision = evaluateAccrualPayTransition("calculated");
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.statusCode).toBe(409);
    }
  });

  it("3. under_review → paid = refusé", () => {
    const decision = evaluateAccrualPayTransition("under_review");
    expect(decision.ok).toBe(false);
  });

  it("4. draft → paid = refusé", () => {
    const decision = evaluateAccrualPayTransition("draft");
    expect(decision.ok).toBe(false);
  });

  it("9. second paiement = idempotent sans nouvelle écriture", () => {
    const decision = evaluateAccrualPayTransition("paid");
    expect(decision).toEqual({
      ok: true,
      mode: "idempotent",
      fromStatus: "paid",
      toStatus: "paid",
    });
  });
});

describe("permissionForAccrualAction", () => {
  it("5. pay exige commission_payment_confirm", () => {
    expect(permissionForAccrualAction("pay")).toBe(
      "commission_payment_confirm"
    );
    expect(
      hasAccrualActionPermission({
        isAdminFinance: false,
        permissionSlugs: ["commission_approve"],
        action: "pay",
      })
    ).toBe(false);
    expect(
      hasAccrualActionPermission({
        isAdminFinance: false,
        permissionSlugs: ["commission_payment_confirm"],
        action: "pay",
      })
    ).toBe(true);
  });

  it("validate exige commission_approve", () => {
    expect(permissionForAccrualAction("validate")).toBe("commission_approve");
  });

  it("pay patch ne touche ni montant ni base ni taux", () => {
    const patch = buildAccrualPayPatch({
      userId: "u1",
      paidAtIso: "2026-08-05T12:00:00.000Z",
    });
    expect(patch).not.toHaveProperty("calculated_amount");
    expect(patch).not.toHaveProperty("sales_basis_amount");
    expect(patch).not.toHaveProperty("rate_percent");
    expect(patch).not.toHaveProperty("label");
  });
});

describe("buildAccrualPayPatch / history", () => {
  it("6–8. paid_at, paid_by et historique validated → paid", () => {
    const paidAt = "2026-08-05T14:00:00.000Z";
    const userId = "user-abc";
    const patch = buildAccrualPayPatch({ userId, paidAtIso: paidAt });
    expect(patch.status).toBe("paid");
    expect(patch.paid_at).toBe(paidAt);
    expect(patch.paid_by).toBe(userId);

    const history = buildAccrualPayHistoryRow({
      accrualId: "accrual-1",
      userId,
    });
    expect(history.from_status).toBe("validated");
    expect(history.to_status).toBe("paid");
    expect(history.changed_by).toBe(userId);
  });
});

describe("accrualAmountsUnchanged", () => {
  it("10–12. montant, taux et base inchangés", () => {
    const before = {
      calculated_amount: 50,
      sales_basis_amount: 1000,
      rate_percent: 5,
      fixed_amount: null,
    };
    const after = { ...before };
    expect(accrualAmountsUnchanged(before, after)).toBe(true);
    expect(
      accrualAmountsUnchanged(before, { ...after, calculated_amount: 51 })
    ).toBe(false);
    expect(
      accrualAmountsUnchanged(before, { ...after, sales_basis_amount: 999 })
    ).toBe(false);
    expect(
      accrualAmountsUnchanged(before, { ...after, rate_percent: 6 })
    ).toBe(false);
  });
});

describe("UI helpers paid", () => {
  it("13. bouton visible sur validated", () => {
    expect(canShowMarkAsPaidAction("validated")).toBe(true);
  });

  it("14. bouton absent sur paid", () => {
    expect(canShowMarkAsPaidAction("paid")).toBe(false);
  });

  it("15. badge Payée = statut paid", () => {
    expect(isPayPlanAccrualPaid("paid")).toBe(true);
    expect(isPayPlanAccrualPaid("validated")).toBe(false);
  });
});

describe("evaluateAccrualValidateTransition", () => {
  it("paid ne peut plus être revalidé", () => {
    const decision = evaluateAccrualValidateTransition("paid");
    expect(decision.ok).toBe(false);
  });
});

describe("filterPaidPayPlanResults", () => {
  it("filtre les résultats payés sans mélanger les autres", () => {
    const rows = [
      { status: "validated", id: "1" },
      { status: "paid", id: "2" },
      { status: "under_review", id: "3" },
    ];
    expect(filterPaidPayPlanResults(rows).map((r) => r.id)).toEqual(["2"]);
  });
});
