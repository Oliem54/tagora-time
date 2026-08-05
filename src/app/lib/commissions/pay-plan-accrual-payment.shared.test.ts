import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accrualAmountsUnchanged,
  buildAccrualPayHistoryRow,
  buildAccrualPayPatch,
  canShowMarkAsPaidAction,
  evaluateAccrualPayTransition,
  evaluateAccrualValidateTransition,
  filterPaidPayPlanResults,
  filterPayPlanResultsBySellerKey,
  formatMarkAsPaidConfirmation,
  formatPaidCategoryCounts,
  formatPayrollPeriodLabel,
  hasAccrualActionPermission,
  hasCompletePayrollProof,
  isPaidMetadataConsistent,
  isPayPlanAccrualPaid,
  isTraceInOrganization,
  LEGACY_PAYROLL_REFERENCE_MISSING,
  MARK_AS_PAID_CANCEL_ACTION_LABEL,
  MARK_AS_PAID_CONFIRM_ACTION_LABEL,
  PAID_BY_CONFIRMED_BY_LABEL,
  PAID_OBJECTIVE_COMMISSIONS_EMPTY,
  PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE,
  PAID_PLAN_RESULT_CTA_LABEL,
  PAID_PLAN_RESULTS_EMPTY,
  PAID_PLAN_RESULTS_SECTION_TITLE,
  PAID_SUCCESS_CARD_TITLE,
  parsePayrollProofInput,
  permissionForAccrualAction,
  payrollReferenceDisplayLabel,
  resolvePaidByDisplayName,
} from "./pay-plan-accrual-payment.shared";

describe("evaluateAccrualPayTransition", () => {
  it("validated → paid = autorisé", () => {
    expect(evaluateAccrualPayTransition("validated")).toEqual({
      ok: true,
      mode: "transition",
      fromStatus: "validated",
      toStatus: "paid",
    });
  });

  it("paid → paid idempotent", () => {
    expect(evaluateAccrualPayTransition("paid")).toEqual({
      ok: true,
      mode: "idempotent",
      fromStatus: "paid",
      toStatus: "paid",
    });
  });

  it("draft / calculated / under_review refusés", () => {
    expect(evaluateAccrualPayTransition("draft").ok).toBe(false);
    expect(evaluateAccrualPayTransition("calculated").ok).toBe(false);
    expect(evaluateAccrualPayTransition("under_review").ok).toBe(false);
  });
});

describe("parsePayrollProofInput", () => {
  const valid = {
    payrollReference: "  PAIE-2026-08-05-001  ",
    payrollPeriodStart: "2026-07-21",
    payrollPeriodEnd: "2026-08-03",
    payrollPayDate: "2026-08-05",
  };

  it("champs de paie obligatoires et référence trimée", () => {
    const parsed = parsePayrollProofInput(valid);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.payrollReference).toBe("PAIE-2026-08-05-001");
      expect(parsed.value.payrollPeriodStart).toBe("2026-07-21");
      expect(parsed.value.payrollPeriodEnd).toBe("2026-08-03");
      expect(parsed.value.payrollPayDate).toBe("2026-08-05");
    }
  });

  it("référence absente refusée", () => {
    const parsed = parsePayrollProofInput({ ...valid, payrollReference: "   " });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toBe("payrollReference");
  });

  it("date absente ou invalide refusée", () => {
    expect(
      parsePayrollProofInput({ ...valid, payrollPayDate: "" }).ok
    ).toBe(false);
    expect(
      parsePayrollProofInput({ ...valid, payrollPeriodStart: "2026-13-01" }).ok
    ).toBe(false);
  });

  it("période inversée refusée", () => {
    const parsed = parsePayrollProofInput({
      ...valid,
      payrollPeriodStart: "2026-08-10",
      payrollPeriodEnd: "2026-08-01",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toBe("payrollPeriodEnd");
  });
});

describe("buildAccrualPayPatch / history / amounts", () => {
  it("patch exact avec champs de paie, sans montant/base/taux", () => {
    const payroll = {
      payrollReference: "PAIE-1",
      payrollPeriodStart: "2026-07-21",
      payrollPeriodEnd: "2026-08-03",
      payrollPayDate: "2026-08-05",
    };
    const patch = buildAccrualPayPatch({
      userId: "user-abc",
      paidAtIso: "2026-08-05T14:00:00.000Z",
      payroll,
    });
    expect(patch).toEqual({
      status: "paid",
      paid_at: "2026-08-05T14:00:00.000Z",
      paid_by: "user-abc",
      updated_by: "user-abc",
      payroll_reference: "PAIE-1",
      payroll_period_start: "2026-07-21",
      payroll_period_end: "2026-08-03",
      payroll_pay_date: "2026-08-05",
    });
    expect(Object.keys(patch).sort()).toEqual(
      [
        "paid_at",
        "paid_by",
        "payroll_pay_date",
        "payroll_period_end",
        "payroll_period_start",
        "payroll_reference",
        "status",
        "updated_by",
      ].sort()
    );

    const history = buildAccrualPayHistoryRow({
      accrualId: "accrual-1",
      userId: "user-abc",
    });
    expect(history.from_status).toBe("validated");
    expect(history.to_status).toBe("paid");
  });

  it("montant, base et taux inchangés", () => {
    const before = {
      calculated_amount: 50,
      sales_basis_amount: 1000,
      rate_percent: 5,
      fixed_amount: null,
    };
    expect(accrualAmountsUnchanged(before, { ...before })).toBe(true);
    expect(
      accrualAmountsUnchanged(before, { ...before, calculated_amount: 51 })
    ).toBe(false);
  });
});

describe("permissions et UI helpers", () => {
  it("permission commission_payment_confirm", () => {
    expect(permissionForAccrualAction("pay")).toBe(
      "commission_payment_confirm"
    );
    expect(
      hasAccrualActionPermission({
        isAdminFinance: false,
        permissionSlugs: [],
        action: "pay",
      })
    ).toBe(false);
    expect(
      hasAccrualActionPermission({
        isAdminFinance: true,
        permissionSlugs: [],
        action: "pay",
      })
    ).toBe(true);
  });

  it("confirmation contient montant, vendeur, référence et période", () => {
    const message = formatMarkAsPaidConfirmation({
      amountLabel: "50,00 $",
      sellerName: "Yves",
      payrollReference: "PAIE-2026-08-05-001",
      payrollPeriodStart: "2026-07-21",
      payrollPeriodEnd: "2026-08-03",
    });
    expect(message).toContain("50,00 $");
    expect(message).toContain("Yves");
    expect(message).toContain("PAIE-2026-08-05-001");
    expect(message).toContain("période");
    expect(MARK_AS_PAID_CANCEL_ACTION_LABEL).toBe("Annuler");
    expect(MARK_AS_PAID_CONFIRM_ACTION_LABEL).toBe("Confirmer le paiement");
    expect(PAID_SUCCESS_CARD_TITLE).toBe("PAIEMENT CONFIRMÉ");
  });

  it("legacy paid sans référence géré proprement", () => {
    expect(hasCompletePayrollProof({})).toBe(false);
    expect(payrollReferenceDisplayLabel({})).toBe(
      LEGACY_PAYROLL_REFERENCE_MISSING
    );
    expect(
      payrollReferenceDisplayLabel({ payrollReference: "PAIE-1" })
    ).toBe("PAIE-1");
    expect(formatPayrollPeriodLabel({})).toBe("");
  });

  it("bouton et badge paid", () => {
    expect(canShowMarkAsPaidAction("validated")).toBe(true);
    expect(canShowMarkAsPaidAction("paid")).toBe(false);
    expect(isPayPlanAccrualPaid("paid")).toBe(true);
    expect(evaluateAccrualValidateTransition("paid").ok).toBe(false);
  });
});

describe("page Payées helpers", () => {
  it("sections, compteurs, filtre vendeur", () => {
    expect(PAID_PLAN_RESULTS_SECTION_TITLE).toBe("Résultats de plans payés");
    expect(PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE).toBe(
      "Commissions liées aux objectifs payées"
    );
    expect(PAID_PLAN_RESULTS_EMPTY).toContain("plan");
    expect(PAID_OBJECTIVE_COMMISSIONS_EMPTY).not.toBe(
      "Aucune commission à afficher"
    );
    expect(PAID_PLAN_RESULT_CTA_LABEL).toBe("Voir la commission");
    expect(PAID_BY_CONFIRMED_BY_LABEL).toBe("Paiement confirmé par");
    const counts = formatPaidCategoryCounts(1, 0);
    expect(counts.plansLabel).toContain("1");
    const paid = filterPaidPayPlanResults([
      { status: "paid", employeeId: 2, id: "a" },
      { status: "validated", employeeId: 2, id: "b" },
    ]);
    expect(
      filterPayPlanResultsBySellerKey(paid, "employee:2").map((r) => r.id)
    ).toEqual(["a"]);
    expect(isTraceInOrganization("org-a", "org-b")).toBe(false);
    expect(
      isPaidMetadataConsistent({
        status: "paid",
        paidAt: "x",
        paidBy: "y",
      })
    ).toBe(true);
    expect(
      resolvePaidByDisplayName({
        userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        fullName: "Martin",
      })
    ).toBe("Martin");
  });
});

describe("migration payroll reference additive (source, no DB)", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260805150000_compensation_accruals_payroll_reference.sql"
    ),
    "utf8"
  );

  it("quatre colonnes ajoutées sans contrainte stricte paid", () => {
    expect(migration).toMatch(/payroll_reference text null/i);
    expect(migration).toMatch(/payroll_period_start date null/i);
    expect(migration).toMatch(/payroll_period_end date null/i);
    expect(migration).toMatch(/payroll_pay_date date null/i);
    expect(migration).toMatch(/btrim\(payroll_reference\) <> ''/i);
    expect(migration).toMatch(
      /payroll_period_start <= payroll_period_end/i
    );
    expect(migration).not.toMatch(/status = 'paid'/);
    expect(migration).not.toMatch(/backfill/i);
    expect(migration).not.toMatch(/\bupdate\b/i);
    expect(migration).not.toMatch(/^\s*delete\b/im);
    expect(migration).not.toMatch(/production/i);
    expect(migration).toMatch(/\bbegin\s*;/i);
    expect(migration).toMatch(/\bcommit\s*;/i);
  });
});

describe("API / UI source contracts payroll proof", () => {
  it("route détail exige payroll proof et persiste les quatre champs", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/api/admin/generic-pay-plans/results/[accrualId]/route.ts"
      ),
      "utf8"
    );
    expect(source).toMatch(/parsePayrollProofInput/);
    expect(source).toMatch(/payrollReference/);
    expect(source).toMatch(/payrollPeriodStart/);
    expect(source).toMatch(/payrollPeriodEnd/);
    expect(source).toMatch(/payrollPayDate/);
    expect(source).toMatch(/eq\("status", "validated"\)/);
    expect(source).toMatch(/mode === "idempotent"/);
    expect(source).toMatch(/evaluateAccrualValidateTransition/);
    expect(source).not.toMatch(/recalcul/i);
  });

  it("fiche : formulaire, confirmation, carte premium, legacy", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/admin/commissions/plans/results/[accrualId]/GenericPayPlanResultClient.tsx"
      ),
      "utf8"
    );
    expect(source).toMatch(/PAYROLL_REFERENCE_FIELD_LABEL/);
    expect(source).toMatch(/PAYROLL_PERIOD_START_FIELD_LABEL/);
    expect(source).toMatch(/PAYROLL_PERIOD_END_FIELD_LABEL/);
    expect(source).toMatch(/PAYROLL_PAY_DATE_FIELD_LABEL/);
    expect(source).toMatch(/formatMarkAsPaidConfirmation/);
    expect(source).toMatch(/PAID_SUCCESS_CARD_TITLE/);
    expect(source).toMatch(/LEGACY_PAYROLL_REFERENCE_MISSING/);
    expect(source).toMatch(/cancelPayConfirmation/);
    expect(source).toMatch(/confirmMarkAsPaid/);
    expect(source).toMatch(/disabled=\{busy\}/);
    expect(source).not.toMatch(/window\.confirm/);
  });

  it("page Payées expose les champs de paie et préserve objectifs", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/admin/commissions/AdminCommissionsPageClient.tsx"
      ),
      "utf8"
    );
    expect(source).toMatch(/payrollReferenceDisplayLabel/);
    expect(source).toMatch(/formatPayrollPeriodLabel/);
    expect(source).toMatch(/formatIsoDateFrCa/);
    expect(source).toMatch(/PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE/);
    expect(source).toMatch(/filterPayPlanResultsBySellerKey/);
    expect(source).toMatch(/formatPaidCategoryCounts/);
  });
});
