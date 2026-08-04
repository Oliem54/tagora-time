"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminCommissionsNavigation from "@/app/components/admin/AdminCommissionsNavigation";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import type { GenericPayPlanTrace } from "@/app/lib/commissions/generic-pay-plan.shared";

type Props = { accrualId: string };

export default function GenericPayPlanResultClient({ accrualId }: Props) {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organization_id") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [trace, setTrace] = useState<GenericPayPlanTrace | null>(null);
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
      };
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(json.error || "Résultat introuvable.");
        return;
      }
      setStatus(String(json.accrual?.status || ""));
      setTrace(json.trace || null);
      setEventLabel(
        json.event?.label ||
          json.event?.external_reference ||
          "Événement de vente"
      );
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
    setStatus(String(json.accrual?.status || "validated"));
    setSuccess("Résultat validé.");
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="ui-text-muted">Chargement du résultat…</p>
      </main>
    );
  }

  return (
    <main className="page-container">
      <AuthenticatedPageHeader
        title="Résultat de commission"
        subtitle="Détail du calcul et validation humaine"
        navigation={<AdminCommissionsNavigation variant="commissions" />}
      />

      <div className="ui-stack" style={{ marginTop: 20, gap: 16 }}>
        {error ? (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" style={{ color: "#166534" }}>
            {success}
          </p>
        ) : null}

        {!trace ? (
          <p className="ui-text-muted">Aucune trace disponible.</p>
        ) : (
          <SectionCard title="Détail explicatif">
            <dl className="ui-stack" style={{ gap: 8 }}>
              <div>
                <dt className="ui-text-muted">Bénéficiaire</dt>
                <dd>Employé #{trace.employee_id}</dd>
              </div>
              <div>
                <dt className="ui-text-muted">Événement</dt>
                <dd>{eventLabel}</dd>
              </div>
              <div>
                <dt className="ui-text-muted">Plan</dt>
                <dd>
                  {trace.template_name} ({trace.template_code})
                </dd>
              </div>
              <div>
                <dt className="ui-text-muted">Version</dt>
                <dd>v{trace.version_number}</dd>
              </div>
              <div>
                <dt className="ui-text-muted">Règle</dt>
                <dd>
                  {trace.rule_name} · {trace.rule_kind}
                </dd>
              </div>
              <div>
                <dt className="ui-text-muted">Base de calcul</dt>
                <dd>{trace.basis_amount.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="ui-text-muted">Taux / montant</dt>
                <dd>
                  {trace.rate_percent != null
                    ? `${trace.rate_percent} %`
                    : trace.fixed_amount != null
                      ? trace.fixed_amount.toFixed(2)
                      : "—"}
                </dd>
              </div>
              <div>
                <dt className="ui-text-muted">Résultat</dt>
                <dd>
                  <strong>{trace.calculated_amount.toFixed(2)}</strong>
                </dd>
              </div>
              <div>
                <dt className="ui-text-muted">Statut</dt>
                <dd>{status}</dd>
              </div>
              <div>
                <dt className="ui-text-muted">Traité le</dt>
                <dd>{new Date(trace.processed_at).toLocaleString("fr-CA")}</dd>
              </div>
              <div>
                <dt className="ui-text-muted">Traçabilité</dt>
                <dd>
                  {trace.accrual_id} / {trace.event_id}
                </dd>
              </div>
            </dl>
          </SectionCard>
        )}

        {status && status !== "validated" ? (
          <button
            type="button"
            className="tagora-dark-action"
            disabled={busy}
            onClick={() => void validateResult()}
          >
            {busy ? "Validation…" : "Valider le résultat"}
          </button>
        ) : null}

        {trace ? (
          <Link
            href={`/admin/commissions/plans/${trace.template_id}?organization_id=${encodeURIComponent(organizationId)}`}
          >
            Retour au plan
          </Link>
        ) : null}
      </div>
    </main>
  );
}
