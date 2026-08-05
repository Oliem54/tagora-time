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
  formatMarkAsPaidConfirmation,
  MARK_AS_PAID_BUTTON_LABEL,
  MARK_AS_PAID_CANCEL_ACTION_LABEL,
  MARK_AS_PAID_CONFIRM_ACTION_LABEL,
  PAID_BY_CONFIRMED_BY_LABEL,
} from "@/app/lib/commissions/pay-plan-accrual-payment.shared";
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

export default function GenericPayPlanResultClient({ accrualId }: Props) {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organization_id") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string | null>(null);
  const [paidByDisplay, setPaidByDisplay] = useState<string | null>(null);
  const [trace, setTrace] = useState<GenericPayPlanTrace | null>(null);
  const [beneficiary, setBeneficiary] =
    useState<PayPlanBeneficiaryDisplay | null>(null);
  const [eventLabel, setEventLabel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmPayOpen, setConfirmPayOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!organizationId) {
        setError("Organisation manquante.");
        setLoading(false);
        return;
      }
      const res = await commissionsFetch(
        `/api/admin/generic-pay-plans/results/${accrualId}?organization_id=${encodeURIComponent(organizationId)}`
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        accrual?: {
          status?: string;
          paid_at?: string | null;
          paid_by?: string | null;
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
          organizationId,
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
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accrualId, organizationId]);

  function syncLocalResult(
    nextStatus: string,
    nextPaidAt: string | null = null,
    nextPaidByDisplay: string | null = null
  ) {
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
      status: nextStatus,
      processedAt: trace.processed_at,
      paidAt: nextPaidAt,
      paidByDisplay: nextPaidByDisplay,
    });
  }

  async function validateResult() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
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
    setSuccess("Résultat validé");
    syncLocalResult(nextStatus);
  }

  function openPayConfirmation() {
    if (busy || !canShowMarkAsPaidAction(status)) return;
    setError(null);
    setConfirmPayOpen(true);
  }

  function cancelPayConfirmation() {
    if (busy) return;
    setConfirmPayOpen(false);
  }

  async function confirmMarkAsPaid() {
    if (busy || !canShowMarkAsPaidAction(status)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const res = await commissionsFetch(
      `/api/admin/generic-pay-plans/results/${accrualId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          organization_id: organizationId,
          action: "pay",
        }),
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      accrual?: {
        status?: string;
        paid_at?: string | null;
        paid_by?: string | null;
      };
      paid_by_display?: string | null;
      idempotent?: boolean;
    };
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Marquage payé impossible.");
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
    setStatus(nextStatus);
    setPaidAt(nextPaidAt);
    setPaidByDisplay(nextPaidByDisplay);
    setConfirmPayOpen(false);
    setSuccess(
      json.idempotent
        ? "Résultat déjà marqué comme payé"
        : "Résultat marqué comme payé"
    );
    syncLocalResult(nextStatus, nextPaidAt, nextPaidByDisplay);
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
  const amountLabel = formatCad(trace?.calculated_amount ?? 0);
  const confirmationMessage = formatMarkAsPaidConfirmation({
    amountLabel,
    sellerName,
  });

  return (
    <main className="page-container">
      <AuthenticatedPageHeader
        className="ui-page-header-premium-2027"
        title="Résultat de commission"
        showNavigation={false}
        navigation={<AdminCommissionsNavigation variant="result" />}
      />

      <div className="ui-stack" style={{ marginTop: 20, gap: 20 }}>
        <CommissionNavButtons
          links={[
            {
              href: "/admin/commissions#resultats-plans",
              label: "Retour aux résultats",
              primary: true as const,
            },
            ...(trace
              ? [
                  {
                    href: `/admin/commissions/plans/${trace.template_id}?organization_id=${encodeURIComponent(organizationId)}`,
                    label: "Ouvrir le plan",
                  },
                ]
              : []),
            {
              href: "/admin/commissions",
              label: "Commissions",
            },
            {
              href: "/admin/commissions#commissions-payees",
              label: "Commissions payées",
            },
          ]}
        />

        {error ? (
          <p role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" style={{ color: "#047857", fontWeight: 700 }}>
            {success}
          </p>
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
                    {beneficiary?.secondary ? (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#6b7280",
                        }}
                      >
                        {beneficiary.secondary}
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
              width: "min(440px, 100%)",
              borderRadius: 16,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
              padding: 20,
              display: "grid",
              gap: 16,
            }}
          >
            <h2
              id="mark-as-paid-confirm-title"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
                lineHeight: 1.35,
              }}
            >
              {confirmationMessage}
            </h2>
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
                disabled={busy}
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
