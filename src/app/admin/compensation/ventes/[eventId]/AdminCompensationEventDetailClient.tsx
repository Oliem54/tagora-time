"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AdminCompensationNavigation from "@/app/components/admin/compensation/AdminCompensationNavigation";
import CompensationAccrualsTable from "@/app/components/admin/compensation/CompensationAccrualsTable";
import CompensationCalculationPanel from "@/app/components/admin/compensation/CompensationCalculationPanel";
import CompensationEligibilityPanel from "@/app/components/admin/compensation/CompensationEligibilityPanel";
import CompensationProcessingTimeline from "@/app/components/admin/compensation/CompensationProcessingTimeline";
import CompensationWorkflowHistory from "@/app/components/admin/compensation/CompensationWorkflowHistory";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import type { Accrual, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import {
  fetchAccrualDetail,
  fetchAccrualsForEvent,
  fetchCompensationSaleEvent,
  patchAccrualWorkflow,
  type AccrualWorkflowAction,
  type CompensationSaleEvent,
} from "@/app/lib/commissions/compensation-engine-api.client";
import {
  buildProcessingTimelineSteps,
  compensationEventStatusLabel,
  compensationSaleStateLabel,
  eligibilityTone,
  formatCompensationEventReference,
  getDominantAccrualStatus,
  summarizeAccrualTotals,
  accrualWorkflowStatusLabel,
  accrualWorkflowStatusTone,
} from "@/app/lib/commissions/compensation-engine-ui.shared";
import { formatCad } from "@/app/lib/commissions/commissions.shared";

type AdminCompensationEventDetailClientProps = {
  eventId: string;
};

export default function AdminCompensationEventDetailClient({
  eventId,
}: AdminCompensationEventDetailClientProps) {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<CompensationSaleEvent | null>(null);
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [histories, setHistories] = useState<Record<string, AccrualStatusHistoryEntry[]>>({});
  const [aggregateHistory, setAggregateHistory] = useState<AccrualStatusHistoryEntry[]>([]);
  const [loadingAccrualId, setLoadingAccrualId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    try {
      const [loadedEvent, loadedAccruals] = await Promise.all([
        fetchCompensationSaleEvent(eventId),
        fetchAccrualsForEvent(eventId),
      ]);
      setEvent(loadedEvent);
      setAccruals(loadedAccruals);
      setHistories({});
      setAggregateHistory([]);
    } catch (error) {
      setEvent(null);
      setAccruals([]);
      setMessage(error instanceof Error ? error.message : "Impossible de charger la vente.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const timelineSteps = useMemo(
    () => (event ? buildProcessingTimelineSteps(event, accruals) : []),
    [event, accruals]
  );
  const totals = useMemo(() => summarizeAccrualTotals(accruals), [accruals]);
  const dominantStatus = useMemo(() => getDominantAccrualStatus(accruals), [accruals]);

  const handleExpandHistory = useCallback(async (accrualId: string) => {
    if (histories[accrualId]) return;
    const detail = await fetchAccrualDetail(accrualId);
    setHistories((current) => ({ ...current, [accrualId]: detail.history }));
  }, [histories]);

  const handleWorkflowAction = useCallback(
    async (accrualId: string, action: AccrualWorkflowAction, reason?: string | null) => {
      setLoadingAccrualId(accrualId);
      setMessage("");
      setMessageType(null);

      try {
        const updated = await patchAccrualWorkflow(accrualId, action, reason);
        setAccruals((current) =>
          current.map((row) => (row.id === accrualId ? updated : row))
        );
        const detail = await fetchAccrualDetail(accrualId);
        setHistories((current) => ({ ...current, [accrualId]: detail.history }));
        setMessage("Transition workflow enregistree.");
        setMessageType("success");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Transition workflow impossible.");
        setMessageType("error");
      } finally {
        setLoadingAccrualId(null);
      }
    },
    []
  );

  const loadAggregateHistory = useCallback(async () => {
    if (accruals.length === 0) {
      setAggregateHistory([]);
      return;
    }

    const entries = await Promise.all(
      accruals.map(async (accrual) => {
        const detail = histories[accrual.id] ?? (await fetchAccrualDetail(accrual.id)).history;
        return detail;
      })
    );

    const flat = entries.flat().sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    setAggregateHistory(flat);
    setHistories((current) => {
      const next = { ...current };
      accruals.forEach((accrual, index) => {
        next[accrual.id] = entries[index] ?? [];
      });
      return next;
    });
  }, [accruals, histories]);

  if (loading) {
    return (
      <TagoraLoadingScreen
        isLoading
        message="Chargement du detail compensation..."
        fullScreen={false}
      />
    );
  }

  if (!event) {
    return (
      <main className="page-container compensation-admin-page">
        <AdminCompensationNavigation variant="detail" />
        <div className="compensation-empty-state">
          <strong>Vente introuvable.</strong>
          <p>{message || "Cet event compensation n existe pas ou n est plus accessible."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-container compensation-admin-page">
      <AdminCompensationNavigation
        variant="detail"
        eventReference={formatCompensationEventReference(event)}
      />

      <AuthenticatedPageHeader
        title={`Vente — ${formatCompensationEventReference(event)}`}
        subtitle="Detail Compensation Event, processing result et workflow finance."
        className="ui-page-header-premium-2027"
      />

      <div className="compensation-detail-hero">
        <div className="compensation-detail-hero__badges">
          <StatusBadge label={compensationEventStatusLabel(event.status)} tone="info" />
          <StatusBadge label={compensationSaleStateLabel(event.sale_state)} tone="info" />
          <StatusBadge
            label={event.eligibility.is_eligible ? "Admissible" : "Non admissible"}
            tone={eligibilityTone(event.eligibility.is_eligible)}
          />
          {dominantStatus ? (
            <StatusBadge
              label={accrualWorkflowStatusLabel(dominantStatus)}
              tone={accrualWorkflowStatusTone(dominantStatus)}
            />
          ) : null}
        </div>
        <div className="compensation-detail-hero__meta">
          <span>Chauffeur : {event.chauffeur_id ?? "—"}</span>
          <span>Montant : {formatCad(event.amount)}</span>
          <span>Vendue le : {event.sold_at ?? "—"}</span>
          <span>Livree le : {event.delivered_at ?? "—"}</span>
          <span>Compagnie : {event.company_context ?? "—"}</span>
        </div>
      </div>

      <div className="compensation-detail-layout">
        <div className="compensation-detail-main">
          <CompensationProcessingTimeline steps={timelineSteps} />
          <CompensationCalculationPanel accruals={accruals} />
          <CompensationAccrualsTable
            accruals={accruals}
            histories={histories}
            loadingAccrualId={loadingAccrualId}
            onWorkflowAction={handleWorkflowAction}
            onExpandHistory={handleExpandHistory}
          />
          <div className="compensation-panel">
            <div className="compensation-panel__header">
              <h2>Historique workflow global</h2>
              <button type="button" className="tagora-dark-outline-action" onClick={() => void loadAggregateHistory()}>
                Charger historique complet
              </button>
            </div>
            <CompensationWorkflowHistory entries={aggregateHistory} />
          </div>
        </div>

        <aside className="compensation-detail-side">
          <CompensationEligibilityPanel event={event} />
          <section className="compensation-side-card">
            <div className="compensation-side-card__header">
              <h2>Synthese montants</h2>
            </div>
            <div className="compensation-side-card__total">{totals.totalFormatted}</div>
            <ul className="compensation-side-card__list">
              {Object.entries(totals.byComponent).map(([component, amount]) => (
                <li key={component}>
                  <span>{component}</span>
                  <strong>{formatCad(amount)}</strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="compensation-side-card">
            <div className="compensation-side-card__header">
              <h2>Actions globales</h2>
            </div>
            <p className="compensation-side-card__note">
              V1 lecture + workflow uniquement. Traitement Processing serveur disponible via service
              Sprint 7 (sans bouton UI).
            </p>
          </section>
        </aside>
      </div>

      <FeedbackMessage message={message} type={messageType} />
    </main>
  );
}
