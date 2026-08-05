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
  hasAccrualActionPermission,
  isPaidMetadataConsistent,
  isPayPlanAccrualPaid,
  isTraceInOrganization,
  MARK_AS_PAID_CANCEL_ACTION_LABEL,
  MARK_AS_PAID_CONFIRM_ACTION_LABEL,
  PAID_BY_CONFIRMED_BY_LABEL,
  PAID_OBJECTIVE_COMMISSIONS_EMPTY,
  PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE,
  PAID_PLAN_RESULT_CTA_LABEL,
  PAID_PLAN_RESULTS_EMPTY,
  PAID_PLAN_RESULTS_SECTION_TITLE,
  permissionForAccrualAction,
  resolvePaidByDisplayName,
} from "./pay-plan-accrual-payment.shared";

describe("evaluateAccrualPayTransition", () => {
  it("validated → paid = autorisé", () => {
    const decision = evaluateAccrualPayTransition("validated");
    expect(decision).toEqual({
      ok: true,
      mode: "transition",
      fromStatus: "validated",
      toStatus: "paid",
    });
  });

  it("paid → paid idempotent", () => {
    const decision = evaluateAccrualPayTransition("paid");
    expect(decision).toEqual({
      ok: true,
      mode: "idempotent",
      fromStatus: "paid",
      toStatus: "paid",
    });
  });

  it("draft refusé", () => {
    const decision = evaluateAccrualPayTransition("draft");
    expect(decision.ok).toBe(false);
  });

  it("calculated refusé", () => {
    const decision = evaluateAccrualPayTransition("calculated");
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.statusCode).toBe(409);
    }
  });

  it("under_review refusé", () => {
    const decision = evaluateAccrualPayTransition("under_review");
    expect(decision.ok).toBe(false);
  });
});

describe("permissionForAccrualAction", () => {
  it("permission commission_payment_confirm absente refusée", () => {
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
  });

  it("administrateur ou permission valide autorisé", () => {
    expect(
      hasAccrualActionPermission({
        isAdminFinance: true,
        permissionSlugs: [],
        action: "pay",
      })
    ).toBe(true);
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
});

describe("buildAccrualPayPatch / history / amounts", () => {
  it("paid_at et paid_by persistés, historique validated → paid exact", () => {
    const paidAt = "2026-08-05T14:00:00.000Z";
    const userId = "user-abc";
    const patch = buildAccrualPayPatch({ userId, paidAtIso: paidAt });
    expect(patch.status).toBe("paid");
    expect(patch.paid_at).toBe(paidAt);
    expect(patch.paid_by).toBe(userId);
    expect(patch).not.toHaveProperty("calculated_amount");
    expect(patch).not.toHaveProperty("sales_basis_amount");
    expect(patch).not.toHaveProperty("rate_percent");
    expect(patch).not.toHaveProperty("label");

    const history = buildAccrualPayHistoryRow({
      accrualId: "accrual-1",
      userId,
    });
    expect(history.from_status).toBe("validated");
    expect(history.to_status).toBe("paid");
    expect(history.changed_by).toBe(userId);
  });

  it("aucun changement amount / base / rule", () => {
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

describe("paid metadata contract", () => {
  it("métadonnées obligatoires pour paid", () => {
    expect(
      isPaidMetadataConsistent({
        status: "paid",
        paidAt: "2026-08-05T12:00:00.000Z",
        paidBy: "user-1",
      })
    ).toBe(true);
    expect(
      isPaidMetadataConsistent({
        status: "paid",
        paidAt: null,
        paidBy: "user-1",
      })
    ).toBe(false);
    expect(
      isPaidMetadataConsistent({
        status: "paid",
        paidAt: "2026-08-05T12:00:00.000Z",
        paidBy: null,
      })
    ).toBe(false);
  });

  it("métadonnées nulles hors paid", () => {
    for (const status of [
      "draft",
      "calculated",
      "under_review",
      "validated",
    ]) {
      expect(
        isPaidMetadataConsistent({
          status,
          paidAt: null,
          paidBy: null,
        })
      ).toBe(true);
      expect(
        isPaidMetadataConsistent({
          status,
          paidAt: "2026-08-05T12:00:00.000Z",
          paidBy: "user-1",
        })
      ).toBe(false);
    }
  });
});

describe("UI helpers paid", () => {
  it("bouton visible sur validated, absent après paiement", () => {
    expect(canShowMarkAsPaidAction("validated")).toBe(true);
    expect(canShowMarkAsPaidAction("paid")).toBe(false);
  });

  it("badge Payée = statut paid", () => {
    expect(isPayPlanAccrualPaid("paid")).toBe(true);
    expect(isPayPlanAccrualPaid("validated")).toBe(false);
  });

  it("confirmation contient montant et vendeur", () => {
    const message = formatMarkAsPaidConfirmation({
      amountLabel: "50,00 $",
      sellerName: "Yves",
    });
    expect(message).toBe(
      "Marquer cette commission de 50,00 $ pour Yves comme payée?"
    );
    expect(message).toContain("50,00 $");
    expect(message).toContain("Yves");
  });

  it("actions Annuler / Confirmer le paiement", () => {
    expect(MARK_AS_PAID_CANCEL_ACTION_LABEL).toBe("Annuler");
    expect(MARK_AS_PAID_CONFIRM_ACTION_LABEL).toBe("Confirmer le paiement");
  });

  it("identité payeur : nom, puis fallback UUID masqué", () => {
    expect(
      resolvePaidByDisplayName({
        userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        fullName: "Martin ST-Gelais",
      })
    ).toBe("Martin ST-Gelais");
    expect(
      resolvePaidByDisplayName({
        userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name: "martin.admin",
      })
    ).toBe("martin.admin");
    expect(
      resolvePaidByDisplayName({
        userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        email: "martin@example.com",
      })
    ).toBe("ma…@example.com");
    expect(
      resolvePaidByDisplayName({
        userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      })
    ).toBe("Utilisateur aaaaaaaa…");
  });

  it("paid ne peut plus être revalidé", () => {
    const decision = evaluateAccrualValidateTransition("paid");
    expect(decision.ok).toBe(false);
  });
});

describe("page Payées helpers", () => {
  it("section plans / objectifs, compteurs et états vides précis", () => {
    expect(PAID_PLAN_RESULTS_SECTION_TITLE).toBe("Résultats de plans payés");
    expect(PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE).toBe(
      "Commissions liées aux objectifs payées"
    );
    expect(PAID_PLAN_RESULTS_EMPTY).toBe(
      "Aucun résultat de plan marqué comme payé."
    );
    expect(PAID_OBJECTIVE_COMMISSIONS_EMPTY).toBe(
      "Aucune commission liée aux objectifs payée."
    );
    expect(PAID_OBJECTIVE_COMMISSIONS_EMPTY).not.toBe(
      "Aucune commission à afficher"
    );
    expect(PAID_PLAN_RESULT_CTA_LABEL).toBe("Voir la commission");
    expect(PAID_BY_CONFIRMED_BY_LABEL).toBe("Paiement confirmé par");

    const counts = formatPaidCategoryCounts(2, 0);
    expect(counts.plansLabel).toBe("Résultats de plans payés : 2");
    expect(counts.objectivesLabel).toBe(
      "Commissions d’objectifs payées : 0"
    );
  });

  it("filtre vendeur sur plans payés", () => {
    const rows = [
      { status: "paid", employeeId: 2, id: "a" },
      { status: "paid", employeeId: 5, id: "b" },
      { status: "validated", employeeId: 2, id: "c" },
    ];
    const paid = filterPaidPayPlanResults(rows);
    expect(paid.map((r) => r.id)).toEqual(["a", "b"]);
    expect(
      filterPayPlanResultsBySellerKey(paid, "employee:2").map((r) => r.id)
    ).toEqual(["a"]);
    expect(filterPayPlanResultsBySellerKey(paid, "all")).toHaveLength(2);
  });

  it("garde organisation", () => {
    expect(isTraceInOrganization("org-a", "org-a")).toBe(true);
    expect(isTraceInOrganization("org-a", "org-b")).toBe(false);
  });
});

describe("migration paid metadata CHECK (source, no DB)", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260805100000_compensation_accruals_paid_status.sql"
    ),
    "utf8"
  );

  it("statut paid supporté et contrainte metadata exacte", () => {
    expect(migration).toMatch(/'paid'/);
    expect(migration).toMatch(/paid_at timestamptz/i);
    expect(migration).toMatch(/paid_by uuid/i);
    expect(migration).toMatch(/references auth\.users \(id\) on delete set null/i);
    expect(migration).toMatch(
      /compensation_accruals_paid_metadata_check/
    );
    expect(migration).toMatch(
      /status = 'paid'[\s\S]*paid_at is not null[\s\S]*paid_by is not null/
    );
    expect(migration).toMatch(
      /status <> 'paid'[\s\S]*paid_at is null[\s\S]*paid_by is null/
    );
    expect(migration.match(/compensation_accruals_paid_metadata_check/g)?.length).toBe(
      2
    );
  });

  it("aucun backfill / UPDATE / DELETE de données", () => {
    expect(migration).not.toMatch(/\bupdate\b/i);
    expect(migration).not.toMatch(/\bdelete\b(?!\s+set\s+null)/i);
    expect(migration).not.toMatch(/\binsert\b/i);
    expect(migration).not.toMatch(/backfill/i);
    expect(migration).not.toMatch(/production/i);
    expect(migration).toMatch(/\bbegin\s*;/i);
    expect(migration).toMatch(/\bcommit\s*;/i);
  });
});

describe("API / UI source contracts (no live DB)", () => {
  it("route détail : pay, tenant, permission, identité, pas de recalcul", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/api/admin/generic-pay-plans/results/[accrualId]/route.ts"
      ),
      "utf8"
    );
    expect(source).toMatch(/action === "pay"/);
    expect(source).toMatch(/permissionForAccrualAction\(action\)/);
    expect(source).toMatch(/isTraceInOrganization/);
    expect(source).toMatch(/buildAccrualPayPatch/);
    expect(source).toMatch(/mode === "idempotent"/);
    expect(source).toMatch(/paid_by_display/);
    expect(source).toMatch(/resolvePaidByDisplayName/);
    expect(source).toMatch(/evaluateAccrualValidateTransition/);
    expect(source).not.toMatch(/recalcul/i);
    expect(source).not.toMatch(/calculated_amount\s*:/);
  });

  it("fiche : confirmation humaine, Annuler sans mutation, identité payeur", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/admin/commissions/plans/results/[accrualId]/GenericPayPlanResultClient.tsx"
      ),
      "utf8"
    );
    expect(source).toMatch(/formatMarkAsPaidConfirmation/);
    expect(source).toMatch(/role="dialog"/);
    expect(source).toMatch(/MARK_AS_PAID_CANCEL_ACTION_LABEL/);
    expect(source).toMatch(/MARK_AS_PAID_CONFIRM_ACTION_LABEL/);
    expect(source).toMatch(/PAID_BY_CONFIRMED_BY_LABEL/);
    expect(source).toMatch(/confirmMarkAsPaid/);
    expect(source).toMatch(/cancelPayConfirmation/);
    expect(source).not.toMatch(/window\.confirm/);
    expect(source).toMatch(/action: "pay"/);
  });

  it("page Payées : deux sections, compteurs, filtre vendeur, états vides", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/admin/commissions/AdminCommissionsPageClient.tsx"
      ),
      "utf8"
    );
    expect(source).toMatch(/PAID_PLAN_RESULTS_SECTION_TITLE/);
    expect(source).toMatch(/PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE/);
    expect(source).toMatch(/formatPaidCategoryCounts/);
    expect(source).toMatch(/filterPayPlanResultsBySellerKey/);
    expect(source).toMatch(/PAID_PLAN_RESULTS_EMPTY/);
    expect(source).toMatch(/PAID_OBJECTIVE_COMMISSIONS_EMPTY/);
    expect(source).toMatch(/PAID_PLAN_RESULT_CTA_LABEL/);
    expect(source).toMatch(/id="commissions-payees"/);
    expect(source).toMatch(/isPaidCommissionsWorkflow/);
  });
});
