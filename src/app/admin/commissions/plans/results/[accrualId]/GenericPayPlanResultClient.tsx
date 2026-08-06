"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminCommissionsNavigation from "@/app/components/admin/AdminCommissionsNavigation";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import {
  resolvePayPlanBeneficiaryDisplay,
  type GenericPayPlanTrace,
  type PayPlanBeneficiaryDisplay,
} from "@/app/lib/commissions/generic-pay-plan.shared";
import {
  canShowMarkAsPaidAction,
  formatIsoDateFrCa,
  formatMarkAsPaidConfirmation,
  formatPayrollPeriodLabel,
  hasCompletePayrollProof,
  isPayrollPaymentConfirmEnabled,
  LEGACY_PAYROLL_REFERENCE_MISSING,
  MARK_AS_PAID_BUTTON_LABEL,
  MARK_AS_PAID_CANCEL_ACTION_LABEL,
  MARK_AS_PAID_CONFIRM_ACTION_LABEL,
  PAID_BY_CONFIRMED_BY_LABEL,
  PAID_SUCCESS_CARD_TITLE,
  parsePayrollProofInput,
  PAYROLL_OPTIONAL_HINT_LABEL,
  PAYROLL_OPTIONAL_SECTION_TITLE,
  PAYROLL_PAY_DATE_FIELD_LABEL,
  PAYROLL_PAYMENT_MODAL_SUBTITLE,
  PAYROLL_PAYMENT_SUMMARY_TITLE,
  PAYROLL_PERIOD_END_FIELD_LABEL,
  PAYROLL_PERIOD_START_FIELD_LABEL,
  PAYROLL_REFERENCE_FIELD_LABEL,
  PAYROLL_REFERENCE_PLACEHOLDER,
  PAYROLL_REFERENCE_SECTION_TITLE,
  type PayrollProofField,
} from "@/app/lib/commissions/pay-plan-accrual-payment.shared";
import {
  readPayPlanOrganizationSession,
  resolvePayPlanOrganizationContext,
  syncOrganizationIdInBrowserUrl,
  withOrganizationId,
  writePayPlanOrganizationSession,
} from "@/app/lib/commissions/pay-plan-organization-context.shared";
import {
  formatCad,
  formatFrDateTime,
  PayPlanDetailRow,
  PayPlanResultAmount,
  PayPlanStatusBadge,
} from "@/app/admin/commissions/plans/pay-plan-readability";
import { CommissionNavButtons } from "@/app/admin/commissions/commission-module-ui";
import { writeRecentPayPlanResult } from "@/app/admin/commissions/recent-pay-plan-results.shared";

type Props = { accrualId: string };

type FieldErrors = Partial<Record<PayrollProofField, string>>;

export default function GenericPayPlanResultClient({ accrualId }: Props) {
  const searchParams = useSearchParams();
  const requestedOrganizationId = searchParams.get("organization_id") || "";
  const [organizationId, setOrganizationId] = useState(requestedOrganizationId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string | null>(null);
  const [paidByDisplay, setPaidByDisplay] = useState<string | null>(null);
  const [payrollReference, setPayrollReference] = useState<string | null>(null);
  const [payrollPeriodStart, setPayrollPeriodStart] = useState<string | null>(
    null
  );
  const [payrollPeriodEnd, setPayrollPeriodEnd] = useState<string | null>(null);
  const [payrollPayDate, setPayrollPayDate] = useState<string | null>(null);
  const [trace, setTrace] = useState<GenericPayPlanTrace | null>(null);
  const [beneficiary, setBeneficiary] =
    useState<PayPlanBeneficiaryDisplay | null>(null);
  const [eventLabel, setEventLabel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmPayOpen, setConfirmPayOpen] = useState(false);
  const [showPaidSuccessCard, setShowPaidSuccessCard] = useState(false);
  const [formReference, setFormReference] = useState("");
  const [formPeriodStart, setFormPeriodStart] = useState("");
  const [formPeriodEnd, setFormPeriodEnd] = useState("");
  const [formPayDate, setFormPayDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function persistLocal(input: {
    nextStatus: string;
    nextPaidAt?: string | null;
    nextPaidByDisplay?: string | null;
    nextPayrollReference?: string | null;
    nextPayrollPeriodStart?: string | null;
    nextPayrollPeriodEnd?: string | null;
    nextPayrollPayDate?: string | null;
  }) {
    if (!trace || !beneficiary) return;
    writeRecentPayPlanResult({
      accrualId: trace.accrual_id || accrualId,
      organizationId,
      templateId: trace.template_id,
      employeeId: beneficiary.employeeId,
      beneficiaryPrimary: beneficiary.primary,
      beneficiarySecondary: beneficiary.secondary,
      planName: trace.template_name,
      versionLabel: `Version ${trace.version_number}`,
      ruleName: trace.rule_name,
      basisAmount: trace.basis_amount,
      amount: trace.calculated_amount,
      status: input.nextStatus,
      processedAt: trace.processed_at,
      paidAt: input.nextPaidAt ?? null,
      paidByDisplay: input.nextPaidByDisplay ?? null,
      payrollReference: input.nextPayrollReference ?? null,
      payrollPeriodStart: input.nextPayrollPeriodStart ?? null,
      payrollPeriodEnd: input.nextPayrollPeriodEnd ?? null,
      payrollPayDate: input.nextPayrollPayDate ?? null,
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const orgsRes = await commissionsFetch(
        "/api/admin/commissions/organizations"
      );
      const orgsJson = (await orgsRes.json().catch(() => ({}))) as {
        organizations?: Array<{ id?: string }>;
        error?: string;
      };
      if (cancelled) return;
      if (!orgsRes.ok) {
        setError(orgsJson.error || "Organisation manquante.");
        setLoading(false);
        return;
      }
      const memberships = (orgsJson.organizations || [])
        .map((row) => ({ organizationId: String(row.id || "").trim() }))
        .filter((row) => row.organizationId);

      const resolved = resolvePayPlanOrganizationContext({
        requestedOrganizationId,
        sessionOrganizationId: readPayPlanOrganizationSession(),
        memberships,
      });
      if (!resolved.ok) {
        setError(
          resolved.status === 403
            ? resolved.error
            : "Organisation manquante."
        );
        setOrganizationId("");
        setLoading(false);
        return;
      }

      const resolvedOrgId = resolved.organizationId;
      setOrganizationId(resolvedOrgId);
      writePayPlanOrganizationSession(resolvedOrgId);
      syncOrganizationIdInBrowserUrl(resolvedOrgId);

      const res = await commissionsFetch(
        withOrganizationId(
          `/api/admin/generic-pay-plans/results/${accrualId}`,
          resolvedOrgId
        )
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        organization_id?: string;
        accrual?: {
          status?: string;
          paid_at?: string | null;
          paid_by?: string | null;
          payroll_reference?: string | null;
          payroll_period_start?: string | null;
          payroll_period_end?: string | null;
          payroll_pay_date?: string | null;
        };
        event?: { label?: string | null; external_reference?: string | null };
        trace?: GenericPayPlanTrace;
        beneficiary?: PayPlanBeneficiaryDisplay;
        paid_by_display?: string | null;
      };
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(json.error || "Résultat introuvable.");
        return;
      }
      if (
        typeof json.organization_id === "string" &&
        json.organization_id.trim()
      ) {
        const serverOrg = json.organization_id.trim().toLowerCase();
        setOrganizationId(serverOrg);
        writePayPlanOrganizationSession(serverOrg);
        syncOrganizationIdInBrowserUrl(serverOrg);
      }
      const nextStatus = String(json.accrual?.status || "");
      setStatus(nextStatus);
      const nextPaidAt =
        typeof json.accrual?.paid_at === "string" && json.accrual.paid_at
          ? json.accrual.paid_at
          : null;
      setPaidAt(nextPaidAt);
      const nextPaidByDisplay =
        typeof json.paid_by_display === "string" && json.paid_by_display
          ? json.paid_by_display
          : null;
      setPaidByDisplay(nextPaidByDisplay);
      const nextPayrollReference =
        typeof json.accrual?.payroll_reference === "string" &&
        json.accrual.payroll_reference.trim()
          ? json.accrual.payroll_reference.trim()
          : null;
      const nextPayrollPeriodStart =
        typeof json.accrual?.payroll_period_start === "string" &&
        json.accrual.payroll_period_start.trim()
          ? json.accrual.payroll_period_start.trim()
          : null;
      const nextPayrollPeriodEnd =
        typeof json.accrual?.payroll_period_end === "string" &&
        json.accrual.payroll_period_end.trim()
          ? json.accrual.payroll_period_end.trim()
          : null;
      const nextPayrollPayDate =
        typeof json.accrual?.payroll_pay_date === "string" &&
        json.accrual.payroll_pay_date.trim()
          ? json.accrual.payroll_pay_date.trim()
          : null;
      setPayrollReference(nextPayrollReference);
      setPayrollPeriodStart(nextPayrollPeriodStart);
      setPayrollPeriodEnd(nextPayrollPeriodEnd);
      setPayrollPayDate(nextPayrollPayDate);
      const nextTrace = json.trace || null;
      setTrace(nextTrace);
      const nextBeneficiary =
        json.beneficiary ||
        (nextTrace
          ? resolvePayPlanBeneficiaryDisplay({
              employeeId: nextTrace.employee_id,
            })
          : null);
      setBeneficiary(nextBeneficiary);
      setEventLabel(
        json.event?.label ||
          json.event?.external_reference ||
          "Événement de vente"
      );
      if (nextTrace && nextBeneficiary) {
        writeRecentPayPlanResult({
          accrualId: nextTrace.accrual_id || accrualId,
          organizationId: resolvedOrgId,
          templateId: nextTrace.template_id,
          employeeId: nextBeneficiary.employeeId,
          beneficiaryPrimary: nextBeneficiary.primary,
          beneficiarySecondary: nextBeneficiary.secondary,
          planName: nextTrace.template_name,
          versionLabel: `Version ${nextTrace.version_number}`,
          ruleName: nextTrace.rule_name,
          basisAmount: nextTrace.basis_amount,
          amount: nextTrace.calculated_amount,
          status: nextStatus || "calculated",
          processedAt: nextTrace.processed_at,
          paidAt: nextPaidAt,
          paidByDisplay: nextPaidByDisplay,
          payrollReference: nextPayrollReference,
          payrollPeriodStart: nextPayrollPeriodStart,
          payrollPeriodEnd: nextPayrollPeriodEnd,
          payrollPayDate: nextPayrollPayDate,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accrualId, requestedOrganizationId]);

  async function validateResult() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setShowPaidSuccessCard(false);
    const res = await commissionsFetch(
      `/api/admin/generic-pay-plans/results/${accrualId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          organization_id: organizationId,
          action: "validate",
        }),
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      accrual?: { status?: string };
    };
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Validation impossible.");
      return;
    }
    const nextStatus = String(json.accrual?.status || "validated");
    setStatus(nextStatus);
    persistLocal({ nextStatus });
  }

  function openPayConfirmation() {
    if (busy || !canShowMarkAsPaidAction(status)) return;
    setError(null);
    setFieldErrors({});
    setConfirmPayOpen(true);
  }

  function cancelPayConfirmation() {
    if (busy) return;
    setConfirmPayOpen(false);
    setFieldErrors({});
  }

  async function confirmMarkAsPaid() {
    if (busy || !canShowMarkAsPaidAction(status)) return;
    const parsed = parsePayrollProofInput({
      payrollReference: formReference,
      payrollPeriodStart: formPeriodStart,
      payrollPeriodEnd: formPeriodEnd,
      payrollPayDate: formPayDate,
    });
    if (!parsed.ok) {
      setFieldErrors({ [parsed.field]: parsed.error });
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    const res = await commissionsFetch(
      `/api/admin/generic-pay-plans/results/${accrualId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          organization_id: organizationId,
          action: "pay",
          payrollReference: parsed.value.payrollReference,
          payrollPeriodStart: parsed.value.payrollPeriodStart,
          payrollPeriodEnd: parsed.value.payrollPeriodEnd,
          payrollPayDate: parsed.value.payrollPayDate,
        }),
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      field?: PayrollProofField;
      accrual?: {
        status?: string;
        paid_at?: string | null;
        paid_by?: string | null;
        payroll_reference?: string | null;
        payroll_period_start?: string | null;
        payroll_period_end?: string | null;
        payroll_pay_date?: string | null;
      };
      paid_by_display?: string | null;
      idempotent?: boolean;
    };
    setBusy(false);
    if (!res.ok) {
      if (json.field) {
        setFieldErrors({ [json.field]: json.error || "Valeur invalide." });
      } else {
        setError(json.error || "Marquage payé impossible.");
      }
      return;
    }
    const nextStatus = String(json.accrual?.status || "paid");
    const nextPaidAt =
      typeof json.accrual?.paid_at === "string" && json.accrual.paid_at
        ? json.accrual.paid_at
        : null;
    const nextPaidByDisplay =
      typeof json.paid_by_display === "string" && json.paid_by_display
        ? json.paid_by_display
        : null;
    const nextPayrollReference =
      typeof json.accrual?.payroll_reference === "string" &&
      json.accrual.payroll_reference.trim()
        ? json.accrual.payroll_reference.trim()
        : parsed.value.payrollReference;
    const nextPayrollPeriodStart =
      typeof json.accrual?.payroll_period_start === "string" &&
      json.accrual.payroll_period_start.trim()
        ? json.accrual.payroll_period_start.trim()
        : parsed.value.payrollPeriodStart;
    const nextPayrollPeriodEnd =
      typeof json.accrual?.payroll_period_end === "string" &&
      json.accrual.payroll_period_end.trim()
        ? json.accrual.payroll_period_end.trim()
        : parsed.value.payrollPeriodEnd;
    const nextPayrollPayDate =
      typeof json.accrual?.payroll_pay_date === "string" &&
      json.accrual.payroll_pay_date.trim()
        ? json.accrual.payroll_pay_date.trim()
        : parsed.value.payrollPayDate;
    setStatus(nextStatus);
    setPaidAt(nextPaidAt);
    setPaidByDisplay(nextPaidByDisplay);
    setPayrollReference(nextPayrollReference);
    setPayrollPeriodStart(nextPayrollPeriodStart);
    setPayrollPeriodEnd(nextPayrollPeriodEnd);
    setPayrollPayDate(nextPayrollPayDate);
    setConfirmPayOpen(false);
    setShowPaidSuccessCard(true);
    persistLocal({
      nextStatus,
      nextPaidAt,
      nextPaidByDisplay,
      nextPayrollReference,
      nextPayrollPeriodStart,
      nextPayrollPeriodEnd,
      nextPayrollPayDate,
    });
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="ui-text-muted">Chargement du résultat…</p>
      </main>
    );
  }

  const rateOrFixed =
    trace?.rate_percent != null
      ? `${trace.rate_percent} %`
      : trace?.fixed_amount != null
        ? formatCad(trace.fixed_amount)
        : "—";

  const showValidate = Boolean(status && status !== "validated" && status !== "paid");
  const showMarkPaid = canShowMarkAsPaidAction(status);
  const sellerName =
    beneficiary?.primary ||
    (trace
      ? resolvePayPlanBeneficiaryDisplay({
          employeeId: trace.employee_id,
        }).primary
      : "le vendeur");
  const employeeReference = beneficiary?.secondary || null;
  const amountLabel = formatCad(trace?.calculated_amount ?? 0);
  const confirmationMessage = formatMarkAsPaidConfirmation({
    amountLabel,
    sellerName,
    payrollReference: formReference,
    payrollPeriodStart: formPeriodStart,
    payrollPeriodEnd: formPeriodEnd,
    payrollPayDate: formPayDate,
  });
  const confirmEnabled = isPayrollPaymentConfirmEnabled({
    payrollReference: formReference,
    payrollPeriodStart: formPeriodStart,
    payrollPeriodEnd: formPeriodEnd,
    payrollPayDate: formPayDate,
  });
  const payrollComplete = hasCompletePayrollProof({
    payrollReference,
    payrollPeriodStart,
    payrollPeriodEnd,
    payrollPayDate,
  });
  const showLegacyPayrollAlert = status === "paid" && !payrollComplete;
  const paidPeriodLabel = formatPayrollPeriodLabel({
    periodStart: payrollPeriodStart,
    periodEnd: payrollPeriodEnd,
  });

  return (
    <main className="page-container commissions-result-page">
      <AuthenticatedPageHeader
        className="ui-page-header-premium-2027 ui-page-header-premium-financial"
        eyebrow="TAGORA Time · Commissions"
        title="Résultat de commission"
        subtitle="Fiche financière — validation, paiement et preuve de paie"
        showNavigation={false}
        navigation={
          <AdminCommissionsNavigation
            variant="result"
            organizationId={organizationId}
          />
        }
      />

      <div className="ui-stack" style={{ marginTop: 24, gap: 20 }}>
        <CommissionNavButtons
          links={[
            {
              href: withOrganizationId(
                "/admin/commissions#resultats-plans",
                organizationId
              ),
              label: "Retour aux résultats",
              primary: true as const,
            },
            ...(trace
              ? [
                  {
                    href: withOrganizationId(
                      `/admin/commissions/plans/${trace.template_id}`,
                      organizationId
                    ),
                    label: "Ouvrir le plan",
                  },
                ]
              : []),
            {
              href: withOrganizationId("/admin/commissions", organizationId),
              label: "Commissions",
            },
            {
              href: withOrganizationId(
                "/admin/commissions#commissions-payees",
                organizationId
              ),
              label: "Commissions payées",
            },
          ]}
        />

        {error ? (
          <p role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>
            {error}
          </p>
        ) : null}

        {showPaidSuccessCard || status === "paid" ? (
          <section
            aria-labelledby="paid-success-card-title"
            style={{
              borderRadius: 18,
              border: "1px solid #bbf7d0",
              background:
                "linear-gradient(145deg, #f0fdf4 0%, #ffffff 55%, #ecfdf5 100%)",
              padding: "18px 20px",
              display: "grid",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <h2
                id="paid-success-card-title"
                style={{
                  margin: 0,
                  fontSize: 18,
                  letterSpacing: "0.04em",
                  fontWeight: 900,
                  color: "#065f46",
                }}
              >
                {PAID_SUCCESS_CARD_TITLE}
              </h2>
              <PayPlanStatusBadge status="paid" />
            </div>
            {showLegacyPayrollAlert ? (
              <p
                role="status"
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#fff7ed",
                  border: "1px solid #fdba74",
                  color: "#9a3412",
                  fontWeight: 700,
                }}
              >
                {LEGACY_PAYROLL_REFERENCE_MISSING}
              </p>
            ) : null}
            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              <div>
                <div className="ui-text-muted" style={{ fontSize: 12 }}>
                  Montant
                </div>
                <strong style={{ color: "#0f172a" }}>{amountLabel}</strong>
              </div>
              <div>
                <div className="ui-text-muted" style={{ fontSize: 12 }}>
                  Vendeur
                </div>
                <strong style={{ color: "#0f172a" }}>{sellerName}</strong>
                {employeeReference ? (
                  <div className="ui-text-muted" style={{ fontSize: 12 }}>
                    {employeeReference}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="ui-text-muted" style={{ fontSize: 12 }}>
                  Référence de paie
                </div>
                <strong style={{ color: "#0f172a" }}>
                  {payrollReference || LEGACY_PAYROLL_REFERENCE_MISSING}
                </strong>
              </div>
              {paidPeriodLabel ? (
                <div>
                  <div className="ui-text-muted" style={{ fontSize: 12 }}>
                    Période de paie
                  </div>
                  <strong style={{ color: "#0f172a" }}>{paidPeriodLabel}</strong>
                </div>
              ) : null}
              {payrollPayDate ? (
                <div>
                  <div className="ui-text-muted" style={{ fontSize: 12 }}>
                    Date de paie
                  </div>
                  <strong style={{ color: "#0f172a" }}>
                    {formatIsoDateFrCa(payrollPayDate)}
                  </strong>
                </div>
              ) : null}
              <div>
                <div className="ui-text-muted" style={{ fontSize: 12 }}>
                  {PAID_BY_CONFIRMED_BY_LABEL}
                </div>
                <strong style={{ color: "#0f172a" }}>
                  {paidByDisplay || "—"}
                </strong>
              </div>
              <div>
                <div className="ui-text-muted" style={{ fontSize: 12 }}>
                  Paiement confirmé le
                </div>
                <strong style={{ color: "#0f172a" }}>
                  {paidAt ? formatFrDateTime(paidAt) : "—"}
                </strong>
              </div>
            </div>
          </section>
        ) : null}

        {trace ? (
          <>
            <PayPlanResultAmount amount={trace.calculated_amount} />
            <SectionCard title="Détail du résultat">
              <dl style={{ margin: 0 }}>
                <PayPlanDetailRow label="Bénéficiaire">
                  <div style={{ display: "grid", gap: 2 }}>
                    <span style={{ fontWeight: 800, color: "#0f172a" }}>
                      {sellerName}
                    </span>
                    {employeeReference ? (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#6b7280",
                        }}
                      >
                        {employeeReference}
                      </span>
                    ) : null}
                  </div>
                </PayPlanDetailRow>
                <PayPlanDetailRow label="Événement">{eventLabel}</PayPlanDetailRow>
                <PayPlanDetailRow label="Plan">
                  {trace.template_name} ({trace.template_code})
                </PayPlanDetailRow>
                <PayPlanDetailRow label="Version">
                  v{trace.version_number}
                </PayPlanDetailRow>
                <PayPlanDetailRow label="Règle">
                  {trace.rule_name}
                </PayPlanDetailRow>
                <PayPlanDetailRow label="Base de calcul">
                  {formatCad(trace.basis_amount)}
                </PayPlanDetailRow>
                <PayPlanDetailRow label="Taux">{rateOrFixed}</PayPlanDetailRow>
                <PayPlanDetailRow label="Résultat">
                  {formatCad(trace.calculated_amount)}
                </PayPlanDetailRow>
                <PayPlanDetailRow label="Statut">
                  {status ? <PayPlanStatusBadge status={status} /> : "—"}
                </PayPlanDetailRow>
                {paidAt ? (
                  <PayPlanDetailRow label="Date de paiement">
                    {formatFrDateTime(paidAt)}
                  </PayPlanDetailRow>
                ) : null}
                {paidByDisplay ? (
                  <PayPlanDetailRow label={PAID_BY_CONFIRMED_BY_LABEL}>
                    {paidByDisplay}
                  </PayPlanDetailRow>
                ) : null}
                <PayPlanDetailRow label="Date de traitement">
                  {formatFrDateTime(trace.processed_at)}
                </PayPlanDetailRow>
                <PayPlanDetailRow label="Identifiant de traçabilité" last>
                  <span style={{ wordBreak: "break-all" }}>
                    {trace.accrual_id} / {trace.event_id}
                  </span>
                </PayPlanDetailRow>
              </dl>
            </SectionCard>
          </>
        ) : null}

        {showValidate ? (
          <div>
            <button
              type="button"
              className="tagora-dark-action"
              disabled={busy}
              onClick={() => void validateResult()}
            >
              {busy ? "Validation…" : "Valider le résultat"}
            </button>
          </div>
        ) : null}

        {showMarkPaid ? (
          <div>
            <button
              type="button"
              className="tagora-dark-action"
              disabled={busy}
              onClick={openPayConfirmation}
            >
              {MARK_AS_PAID_BUTTON_LABEL}
            </button>
          </div>
        ) : null}
      </div>

      {confirmPayOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mark-as-paid-confirm-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.45)",
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              cancelPayConfirmation();
            }
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              borderRadius: 18,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              boxShadow: "0 22px 48px rgba(15, 23, 42, 0.2)",
              padding: 22,
              display: "grid",
              gap: 16,
              maxHeight: "min(92vh, 860px)",
              overflow: "auto",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <h2
                id="mark-as-paid-confirm-title"
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                  lineHeight: 1.3,
                }}
              >
                Confirmer le paiement
              </h2>
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 14,
                  lineHeight: 1.45,
                }}
              >
                {PAYROLL_PAYMENT_MODAL_SUBTITLE}
              </p>
            </div>

            <section
              aria-labelledby="commission-to-pay-title"
              style={{
                display: "grid",
                gap: 10,
                padding: "14px 16px",
                borderRadius: 14,
                background:
                  "linear-gradient(145deg, #0f2748 0%, #17345f 55%, #1e4478 100%)",
                color: "#ffffff",
              }}
            >
              <div
                id="commission-to-pay-title"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.65)",
                }}
              >
                {PAYROLL_PAYMENT_SUMMARY_TITLE}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                {amountLabel}
              </div>
              <div style={{ display: "grid", gap: 2, fontSize: 14 }}>
                <strong style={{ fontWeight: 700 }}>{sellerName}</strong>
                {employeeReference ? (
                  <span style={{ color: "rgba(255,255,255,0.78)" }}>
                    {employeeReference}
                  </span>
                ) : null}
                {trace ? (
                  <span style={{ color: "rgba(255,255,255,0.78)" }}>
                    {trace.template_name}
                  </span>
                ) : null}
              </div>
            </section>

            <section style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  color: "#334155",
                }}
              >
                {PAYROLL_REFERENCE_SECTION_TITLE}
              </div>
              <label className="tagora-field" style={{ margin: 0 }}>
                <span className="tagora-label">
                  {PAYROLL_REFERENCE_FIELD_LABEL} *
                </span>
                <input
                  className="tagora-input"
                  value={formReference}
                  disabled={busy}
                  placeholder={PAYROLL_REFERENCE_PLACEHOLDER}
                  autoComplete="off"
                  style={{
                    width: "100%",
                    minHeight: 46,
                    border: "1px solid #94a3b8",
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                  onChange={(event) => {
                    setFormReference(event.target.value);
                    if (fieldErrors.payrollReference) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.payrollReference;
                        return next;
                      });
                    }
                  }}
                />
                {fieldErrors.payrollReference ? (
                  <span role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                    {fieldErrors.payrollReference}
                  </span>
                ) : null}
              </label>
            </section>

            <details
              style={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                padding: "10px 12px",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 700,
                  color: "#0f172a",
                  listStyle: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span>{PAYROLL_OPTIONAL_SECTION_TITLE}</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#64748b",
                    background: "#e2e8f0",
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  {PAYROLL_OPTIONAL_HINT_LABEL}
                </span>
              </summary>
              <div
                className="payroll-optional-dates-grid"
                style={{
                  display: "grid",
                  gap: 12,
                  marginTop: 12,
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                }}
              >
                <label className="tagora-field" style={{ margin: 0 }}>
                  <span className="tagora-label">
                    {PAYROLL_PERIOD_START_FIELD_LABEL}
                  </span>
                  <input
                    className="tagora-input"
                    type="date"
                    value={formPeriodStart}
                    disabled={busy}
                    onChange={(event) => setFormPeriodStart(event.target.value)}
                  />
                  {fieldErrors.payrollPeriodStart ? (
                    <span role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                      {fieldErrors.payrollPeriodStart}
                    </span>
                  ) : null}
                </label>
                <label className="tagora-field" style={{ margin: 0 }}>
                  <span className="tagora-label">
                    {PAYROLL_PERIOD_END_FIELD_LABEL}
                  </span>
                  <input
                    className="tagora-input"
                    type="date"
                    value={formPeriodEnd}
                    disabled={busy}
                    onChange={(event) => setFormPeriodEnd(event.target.value)}
                  />
                  {fieldErrors.payrollPeriodEnd ? (
                    <span role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                      {fieldErrors.payrollPeriodEnd}
                    </span>
                  ) : null}
                </label>
                <label className="tagora-field" style={{ margin: 0 }}>
                  <span className="tagora-label">
                    {PAYROLL_PAY_DATE_FIELD_LABEL}
                  </span>
                  <input
                    className="tagora-input"
                    type="date"
                    value={formPayDate}
                    disabled={busy}
                    onChange={(event) => setFormPayDate(event.target.value)}
                  />
                  {fieldErrors.payrollPayDate ? (
                    <span role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                      {fieldErrors.payrollPayDate}
                    </span>
                  ) : null}
                </label>
              </div>
              <style jsx>{`
                @media (max-width: 720px) {
                  :global(.payroll-optional-dates-grid) {
                    grid-template-columns: minmax(0, 1fr) !important;
                  }
                }
              `}</style>
            </details>

            <p
              style={{
                margin: 0,
                color: "#334155",
                lineHeight: 1.45,
                whiteSpace: "pre-line",
                fontSize: 14,
              }}
            >
              {confirmationMessage}
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="tagora-dark-outline-action"
                disabled={busy}
                onClick={cancelPayConfirmation}
              >
                {MARK_AS_PAID_CANCEL_ACTION_LABEL}
              </button>
              <button
                type="button"
                className="tagora-dark-action"
                disabled={busy || !confirmEnabled}
                onClick={() => void confirmMarkAsPaid()}
              >
                {busy
                  ? "Confirmation…"
                  : MARK_AS_PAID_CONFIRM_ACTION_LABEL}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
