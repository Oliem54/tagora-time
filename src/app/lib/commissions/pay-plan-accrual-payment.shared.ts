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

export type PayrollProofInput = {
  payrollReference: unknown;
  payrollPeriodStart: unknown;
  payrollPeriodEnd: unknown;
  payrollPayDate: unknown;
};

/**
 * Preuve de paie V1 : seule payrollReference est obligatoire.
 * Les dates restent des renseignements comptables facultatifs (null si absentes).
 *
 * Future contrainte stricte (migration ultérieure, hors ce bloc) :
 * status = 'paid' → payroll_reference IS NOT NULL AND btrim(payroll_reference) <> ''
 * payroll_period_start / payroll_period_end / payroll_pay_date restent facultatifs.
 */
export type ParsedPayrollProof = {
  payrollReference: string;
  payrollPeriodStart: string | null;
  payrollPeriodEnd: string | null;
  payrollPayDate: string | null;
};

export type PayrollProofField =
  | "payrollReference"
  | "payrollPeriodStart"
  | "payrollPeriodEnd"
  | "payrollPayDate";

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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return false;
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function parseOptionalIsoDateField(
  value: unknown,
  field: Exclude<PayrollProofField, "payrollReference">,
  invalidMessage: string
):
  | { ok: true; value: string | null }
  | { ok: false; field: PayrollProofField; error: string } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (!isIsoDateOnly(trimmed)) {
    return { ok: false, field, error: invalidMessage };
  }
  return { ok: true, value: trimmed };
}

export function parsePayrollProofInput(
  input: PayrollProofInput
):
  | { ok: true; value: ParsedPayrollProof }
  | { ok: false; field: PayrollProofField; error: string } {
  const payrollReference = String(input.payrollReference ?? "").trim();
  if (!payrollReference) {
    return {
      ok: false,
      field: "payrollReference",
      error: "La référence ou le numéro de paie est obligatoire.",
    };
  }

  const start = parseOptionalIsoDateField(
    input.payrollPeriodStart,
    "payrollPeriodStart",
    "Le début de la période de paie doit être au format AAAA-MM-JJ."
  );
  if (!start.ok) return start;

  const end = parseOptionalIsoDateField(
    input.payrollPeriodEnd,
    "payrollPeriodEnd",
    "La fin de la période de paie doit être au format AAAA-MM-JJ."
  );
  if (!end.ok) return end;

  if (
    start.value &&
    end.value &&
    start.value > end.value
  ) {
    return {
      ok: false,
      field: "payrollPeriodEnd",
      error: "La fin de période doit être postérieure ou égale au début.",
    };
  }

  const payDate = parseOptionalIsoDateField(
    input.payrollPayDate,
    "payrollPayDate",
    "La date de paie doit être au format AAAA-MM-JJ."
  );
  if (!payDate.ok) return payDate;

  return {
    ok: true,
    value: {
      payrollReference,
      payrollPeriodStart: start.value,
      payrollPeriodEnd: end.value,
      payrollPayDate: payDate.value,
    },
  };
}

export function buildAccrualPayPatch(input: {
  userId: string;
  paidAtIso: string;
  payroll: ParsedPayrollProof;
}): {
  status: "paid";
  paid_at: string;
  paid_by: string;
  updated_by: string;
  payroll_reference: string;
  payroll_period_start: string | null;
  payroll_period_end: string | null;
  payroll_pay_date: string | null;
} {
  return {
    status: "paid",
    paid_at: input.paidAtIso,
    paid_by: input.userId,
    updated_by: input.userId,
    payroll_reference: input.payroll.payrollReference,
    payroll_period_start: input.payroll.payrollPeriodStart,
    payroll_period_end: input.payroll.payrollPeriodEnd,
    payroll_pay_date: input.payroll.payrollPayDate,
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

export function formatIsoDateFrCa(value: string): string {
  const trimmed = String(value || "").trim();
  if (!isIsoDateOnly(trimmed)) return trimmed || "—";
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export function formatPayrollPeriodLabel(input: {
  periodStart?: string | null;
  periodEnd?: string | null;
}): string {
  const start = String(input.periodStart || "").trim();
  const end = String(input.periodEnd || "").trim();
  if (!start && !end) return "";
  if (start && end) {
    return `${formatIsoDateFrCa(start)} au ${formatIsoDateFrCa(end)}`;
  }
  return formatIsoDateFrCa(start || end);
}

export function formatMarkAsPaidConfirmation(input: {
  amountLabel: string;
  sellerName: string;
  payrollReference: string;
  payrollPeriodStart?: string | null;
  payrollPeriodEnd?: string | null;
  payrollPayDate?: string | null;
}): string {
  const reference = String(input.payrollReference || "").trim();
  if (!reference) {
    return "Ajoutez une référence de paie pour activer la confirmation.";
  }
  const amount = String(input.amountLabel || "").trim() || "—";
  const seller = String(input.sellerName || "").trim() || "le vendeur";
  const lines = [
    `Vous confirmez le paiement de ${amount} à ${seller} sur la paie ${reference}.`,
  ];
  const start = String(input.payrollPeriodStart || "").trim();
  const end = String(input.payrollPeriodEnd || "").trim();
  if (start && end) {
    lines.push(
      `Période : du ${formatIsoDateFrCa(start)} au ${formatIsoDateFrCa(end)}`
    );
  } else if (start || end) {
    lines.push(`Période : ${formatIsoDateFrCa(start || end)}`);
  }
  const payDate = String(input.payrollPayDate || "").trim();
  if (payDate) {
    lines.push(`Date de paie : ${formatIsoDateFrCa(payDate)}`);
  }
  return lines.join("\n");
}

/** Référence de paie présente — les dates facultatives ne sont pas exigées. */
export function hasCompletePayrollProof(input: {
  payrollReference?: string | null;
  payrollPeriodStart?: string | null;
  payrollPeriodEnd?: string | null;
  payrollPayDate?: string | null;
}): boolean {
  return Boolean(String(input.payrollReference || "").trim());
}

/** Bouton Confirmer activable : référence valide et période non inversée. */
export function isPayrollPaymentConfirmEnabled(input: PayrollProofInput): boolean {
  return parsePayrollProofInput(input).ok;
}

export function payrollReferenceDisplayLabel(input: {
  payrollReference?: string | null;
}): string {
  const reference = String(input.payrollReference || "").trim();
  return reference || LEGACY_PAYROLL_REFERENCE_MISSING;
}

/** Contrat metadata paid de base (paid_at / paid_by). */
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
export const PAID_SUCCESS_CARD_TITLE = "PAIEMENT CONFIRMÉ";
export const LEGACY_PAYROLL_REFERENCE_MISSING =
  "Référence de paie à compléter";
export const PAYROLL_REFERENCE_FIELD_LABEL = "Référence ou numéro de paie";
export const PAYROLL_REFERENCE_SECTION_TITLE = "RÉFÉRENCE DE PAIE";
export const PAYROLL_OPTIONAL_SECTION_TITLE = "Renseignements facultatifs";
export const PAYROLL_OPTIONAL_HINT_LABEL = "Facultatif";
export const PAYROLL_PERIOD_START_FIELD_LABEL = "Début de la période de paie";
export const PAYROLL_PERIOD_END_FIELD_LABEL = "Fin de la période de paie";
export const PAYROLL_PAY_DATE_FIELD_LABEL = "Date de paie";
export const PAYROLL_PAYMENT_MODAL_SUBTITLE =
  "Ajoutez une référence de paie pour confirmer le versement.";
export const PAYROLL_PAYMENT_SUMMARY_TITLE = "COMMISSION À PAYER";
export const PAYROLL_REFERENCE_PLACEHOLDER = "PAIE-2026-08-001";

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
