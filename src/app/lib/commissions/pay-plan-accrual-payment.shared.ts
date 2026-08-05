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
      error: "Seul un résultat validé peut être marqué comme payé.",
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

export function filterPayPlanResultsBySellerKey<
  T extends { employeeId: number | null },
>(results: T[], sellerKey: string): T[] {
  const key = String(sellerKey || "all").trim();
  if (!key || key === "all") return results;
  return results.filter((result) => {
    const employeeId = Number(result.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) return false;
    return `employee:${employeeId}` === key;
  });
}

/**
 * Identité d’affichage du payeur — même ordre que getUserDisplayName commissions.
 * Fallback UUID masqué uniquement si aucune identité humaine.
 */
export function resolvePaidByDisplayName(input: {
  userId: string;
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  const userId = String(input.userId || "").trim();
  const fullName = String(input.fullName || "").trim();
  if (fullName) return fullName;
  const name = String(input.name || "").trim();
  if (name) return name;
  const email = String(input.email || "").trim();
  if (email) {
    const at = email.indexOf("@");
    if (at > 1) {
      return `${email.slice(0, 2)}…${email.slice(at)}`;
    }
    return email;
  }
  if (userId.length >= 8) {
    return `Utilisateur ${userId.slice(0, 8)}…`;
  }
  return userId ? `Utilisateur ${userId}` : "Utilisateur inconnu";
}

export function formatMarkAsPaidConfirmation(input: {
  amountLabel: string;
  sellerName: string;
}): string {
  const amount = String(input.amountLabel || "").trim() || "—";
  const seller = String(input.sellerName || "").trim() || "le vendeur";
  return `Marquer cette commission de ${amount} pour ${seller} comme payée?`;
}

/** Contrat metadata paid (miroir CHECK SQL, testable sans DB). */
export function isPaidMetadataConsistent(input: {
  status: unknown;
  paidAt: unknown;
  paidBy: unknown;
}): boolean {
  const status = normalizeAccrualStatus(input.status);
  const paidAt =
    input.paidAt == null || input.paidAt === ""
      ? null
      : String(input.paidAt).trim();
  const paidBy =
    input.paidBy == null || input.paidBy === ""
      ? null
      : String(input.paidBy).trim();
  if (status === "paid") {
    return Boolean(paidAt && paidBy);
  }
  return paidAt == null && paidBy == null;
}

export function isTraceInOrganization(
  traceOrganizationId: unknown,
  expectedOrganizationId: unknown
): boolean {
  const a = String(traceOrganizationId || "").trim();
  const b = String(expectedOrganizationId || "").trim();
  return Boolean(a && b && a === b);
}

export const MARK_AS_PAID_BUTTON_LABEL = "Marquer comme payée";
export const MARK_AS_PAID_CONFIRM_ACTION_LABEL = "Confirmer le paiement";
export const MARK_AS_PAID_CANCEL_ACTION_LABEL = "Annuler";
export const PAID_PLAN_RESULTS_SECTION_TITLE = "Résultats de plans payés";
export const PAID_PLAN_RESULTS_SECTION_SUBTITLE =
  "Confirmations de paiement des plans — distinctes des commissions d’objectifs payées.";
export const PAID_PLAN_RESULTS_EMPTY =
  "Aucun résultat de plan marqué comme payé.";
export const PAID_OBJECTIVE_COMMISSIONS_EMPTY =
  "Aucune commission liée aux objectifs payée.";
export const PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE =
  "Commissions liées aux objectifs payées";
export const PAID_PLAN_RESULT_CTA_LABEL = "Voir la commission";
export const PAID_BY_CONFIRMED_BY_LABEL = "Paiement confirmé par";

export function formatPaidCategoryCounts(
  planCount: number,
  objectiveCount: number
): {
  plansLabel: string;
  objectivesLabel: string;
} {
  const plans = Math.max(0, Math.trunc(Number(planCount) || 0));
  const objectives = Math.max(0, Math.trunc(Number(objectiveCount) || 0));
  return {
    plansLabel: `Résultats de plans payés : ${plans}`,
    objectivesLabel: `Commissions d’objectifs payées : ${objectives}`,
  };
}
