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
  const [trace, setTrace] = useState<GenericPayPlanTrace | null>(null);
  const [beneficiary, setBeneficiary] =
    useState<PayPlanBeneficiaryDisplay | null>(null);
  const [eventLabel, setEventLabel] = useState<string>("");
  const [busy, setBusy] = useState(false);

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
        accrual?: { status?: string };
        event?: { label?: string | null; external_reference?: string | null };
        trace?: GenericPayPlanTrace;
        beneficiary?: PayPlanBeneficiaryDisplay;
      };
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(json.error || "Résultat introuvable.");
        return;
      }
      const nextStatus = String(json.accrual?.status || "");
      setStatus(nextStatus);
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
          beneficiaryPrimary: nextBeneficiary.primary,
          planName: nextTrace.template_name,
          amount: nextTrace.calculated_amount,
          status: nextStatus || "calculated",
          processedAt: nextTrace.processed_at,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accrualId, organizationId]);

  async function validateResult() {
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
    if (trace && beneficiary) {
      writeRecentPayPlanResult({
        accrualId: trace.accrual_id || accrualId,
        organizationId,
        templateId: trace.template_id,
        beneficiaryPrimary: beneficiary.primary,
        planName: trace.template_name,
        amount: trace.calculated_amount,
        status: nextStatus,
        processedAt: trace.processed_at,
      });
    }
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
            ...(trace
              ? [
                  {
                    href: `/admin/commissions/plans/${trace.template_id}?organization_id=${encodeURIComponent(organizationId)}`,
                    label: "Retour au plan",
                    primary: true as const,
                  },
                ]
              : []),
            {
              href: `/admin/commissions/plans?organization_id=${encodeURIComponent(organizationId)}`,
              label: "Tous les plans",
            },
          ]}
        />

        {error ? (
          <p role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" style={{ color: "#166534", fontWeight: 700 }}>
            {success}
          </p>
        ) : null}

        {!trace ? (
          <p className="ui-text-muted">Aucune trace disponible.</p>
        ) : (
          <>
            <PayPlanResultAmount amount={trace.calculated_amount} />

            <SectionCard title="Détail explicatif">
              <dl style={{ margin: 0 }}>
                <PayPlanDetailRow label="Bénéficiaire">
                  <div style={{ display: "grid", gap: 4 }}>
                    <span>
                      {beneficiary?.primary ||
                        resolvePayPlanBeneficiaryDisplay({
                          employeeId: trace.employee_id,
                        }).primary}
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
        )}

        {status && status !== "validated" ? (
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
      </div>
    </main>
  );
}
