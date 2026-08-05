/**
 * Règles Validée → Payée pour compensation_accruals (résultats de plans).
 * Aucun impact sur le moteur de calcul.
 */

import type { PayPlanPermission } from "@/app/lib/commissions/generic-pay-plan-contracts";

export const PAY_PLAN_ACCRUAL_STATUSES = [
  "draft",
  "calculated",
  "under_review",
  "validated",
  "paid",
] as const;

export type PayPlanAccrualStatus = (typeof PAY_PLAN_ACCRUAL_STATUSES)[number];

export type AccrualPaymentAction = "validate" | "pay";

export type AccrualAmountSnapshot = {
  calculated_amount: number;
  sales_basis_amount: number;
  rate_percent?: number | null;
  fixed_amount?: number | null;
};

export function normalizeAccrualStatus(status: unknown): string {
  return String(status || "")
    .trim()
    .toLowerCase();
}

export function isPayPlanAccrualPaid(status: unknown): boolean {
  return normalizeAccrualStatus(status) === "paid";
}

export function isPayPlanAccrualValidated(status: unknown): boolean {
  return normalizeAccrualStatus(status) === "validated";
}

/** Bouton « Marquer comme payée » — visible uniquement si validated. */
export function canShowMarkAsPaidAction(status: unknown): boolean {
  return isPayPlanAccrualValidated(status);
}

export function permissionForAccrualAction(
  action: AccrualPaymentAction
): PayPlanPermission {
  if (action === "pay") return "commission_payment_confirm";
  return "commission_approve";
}

/**
 * Miroir testable de assertPayPlanPermission (sans JWT).
 * Admin finance = autorisé ; sinon slug exact requis.
 */
export function hasAccrualActionPermission(input: {
  isAdminFinance: boolean;
  permissionSlugs: string[];
  action: AccrualPaymentAction;
}): boolean {
  if (input.isAdminFinance) return true;
  const required = permissionForAccrualAction(input.action);
  return input.permissionSlugs
    .map((slug) => slug.trim().toLowerCase())
    .includes(required);
}

export type AccrualPayTransitionDecision =
  | {
      ok: true;
      mode: "transition";
      fromStatus: "validated";
      toStatus: "paid";
    }
  | {
      ok: true;
      mode: "idempotent";
      fromStatus: "paid";
      toStatus: "paid";
    }
  | {
      ok: false;
      statusCode: 400 | 409;
      error: string;
    };

/**
 * Transition pay : validated → paid uniquement.
 * paid → paid : idempotent sans nouvelle écriture.
 */
export function evaluateAccrualPayTransition(
  currentStatus: unknown
): AccrualPayTransitionDecision {
  const status = normalizeAccrualStatus(currentStatus);
  if (status === "paid") {
    return { ok: true, mode: "idempotent", fromStatus: "paid", toStatus: "paid" };
  }
  if (status === "validated") {
    return {
      ok: true,
      mode: "transition",
      fromStatus: "validated",
      toStatus: "paid",
    };
  }
  if (
    status === "draft" ||
    status === "calculated" ||
    status === "under_review"
  ) {
    return {
      ok: false,
      statusCode: 409,
      error:
        "Seul un résultat validé peut être marqué comme payé.",
    };
  }
  return {
    ok: false,
    statusCode: 400,
    error: "Transition vers payée non autorisée pour ce statut.",
  };
}

/** Empêche de revalider un résultat déjà payé. */
export function evaluateAccrualValidateTransition(
  currentStatus: unknown
):
  | { ok: true; mode: "transition" }
  | { ok: false; statusCode: 400; error: string } {
  const status = normalizeAccrualStatus(currentStatus);
  if (status === "validated") {
    return {
      ok: false,
      statusCode: 400,
      error: "Ce résultat est déjà validé et ne peut plus être modifié.",
    };
  }
  if (status === "paid") {
    return {
      ok: false,
      statusCode: 400,
      error: "Ce résultat est déjà payé et ne peut plus être revalidé.",
    };
  }
  return { ok: true, mode: "transition" };
}

export function buildAccrualPayPatch(input: {
  userId: string;
  paidAtIso: string;
}): {
  status: "paid";
  paid_at: string;
  paid_by: string;
  updated_by: string;
} {
  return {
    status: "paid",
    paid_at: input.paidAtIso,
    paid_by: input.userId,
    updated_by: input.userId,
  };
}

export function buildAccrualPayHistoryRow(input: {
  accrualId: string;
  userId: string;
  reason?: string | null;
}): {
  accrual_id: string;
  from_status: "validated";
  to_status: "paid";
  changed_by: string;
  reason: string;
} {
  return {
    accrual_id: input.accrualId,
    from_status: "validated",
    to_status: "paid",
    changed_by: input.userId,
    reason: input.reason?.trim() || "Confirmation de paiement",
  };
}

/** Vérifie que montant / base / taux ne changent pas lors d’un pay. */
export function accrualAmountsUnchanged(
  before: AccrualAmountSnapshot,
  after: AccrualAmountSnapshot
): boolean {
  const sameNum = (a: number, b: number) =>
    Number(a) === Number(b) ||
    (Number.isFinite(Number(a)) &&
      Number.isFinite(Number(b)) &&
      Math.abs(Number(a) - Number(b)) < 1e-9);
  if (!sameNum(before.calculated_amount, after.calculated_amount)) return false;
  if (!sameNum(before.sales_basis_amount, after.sales_basis_amount)) return false;
  const beforeRate =
    before.rate_percent == null ? null : Number(before.rate_percent);
  const afterRate =
    after.rate_percent == null ? null : Number(after.rate_percent);
  if (beforeRate !== afterRate) {
    if (
      beforeRate == null ||
      afterRate == null ||
      !Number.isFinite(beforeRate) ||
      !Number.isFinite(afterRate) ||
      Math.abs(beforeRate - afterRate) >= 1e-9
    ) {
      return false;
    }
  }
  const beforeFixed =
    before.fixed_amount == null ? null : Number(before.fixed_amount);
  const afterFixed =
    after.fixed_amount == null ? null : Number(after.fixed_amount);
  if (beforeFixed !== afterFixed) {
    if (
      beforeFixed == null ||
      afterFixed == null ||
      !Number.isFinite(beforeFixed) ||
      !Number.isFinite(afterFixed) ||
      Math.abs(beforeFixed - afterFixed) >= 1e-9
    ) {
      return false;
    }
  }
  return true;
}

export function filterPaidPayPlanResults<T extends { status: string }>(
  results: T[]
): T[] {
  return results.filter((result) => isPayPlanAccrualPaid(result.status));
}

export const MARK_AS_PAID_BUTTON_LABEL = "Marquer comme payée";
export const MARK_AS_PAID_CONFIRM_MESSAGE =
  "Confirmer que ce résultat de plan est payé ? Cette action enregistre une confirmation manuelle (aucun paiement bancaire).";
export const PAID_PLAN_RESULTS_SECTION_TITLE = "Résultats de plans payés";
export const PAID_PLAN_RESULTS_SECTION_SUBTITLE =
  "Confirmations de paiement des plans — distinctes des commissions d’objectifs payées.";
export const PAID_PLAN_RESULTS_EMPTY =
  "Aucun résultat de plan marqué comme payé pour l’organisation active.";
