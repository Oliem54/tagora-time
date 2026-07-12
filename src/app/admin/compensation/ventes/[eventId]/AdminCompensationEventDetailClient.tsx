"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AdminCompensationPageShell from "@/app/components/admin/compensation/AdminCompensationPageShell";
import CompensationAccrualsTable from "@/app/components/admin/compensation/CompensationAccrualsTable";
import CompensationCalculationPanel from "@/app/components/admin/compensation/CompensationCalculationPanel";
import CompensationEligibilityPanel from "@/app/components/admin/compensation/CompensationEligibilityPanel";
import CompensationProcessingActions from "@/app/components/admin/compensation/CompensationProcessingActions";
import CompensationProcessingSummaryPanel from "@/app/components/admin/compensation/CompensationProcessingSummaryPanel";
import CompensationProcessingTimeline from "@/app/components/admin/compensation/CompensationProcessingTimeline";
import CompensationWorkflowHistory from "@/app/components/admin/compensation/CompensationWorkflowHistory";
import AppCard from "@/app/components/ui/AppCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import type { Accrual, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import {
  fetchAccrualDetail,
  fetchAccrualsForEvent,
  fetchCompensationSaleEvent,
  patchAccrualWorkflow,
  updateCompensationSaleEvent,
  type AccrualWorkflowAction,
  type CompensationSaleEvent,
} from "@/app/lib/commissions/compensation-engine-api.client";
import type { CompensationProcessingResultDto } from "@/app/lib/commissions/compensation-processing-api.shared";
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
import {
  isCompensationQaEventMarker,
} from "@/app/lib/commissions/compensation-qa.shared";

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
  const [processingBusy, setProcessingBusy] = useState(false);
  const [cancellingQa, setCancellingQa] = useState(false);
  const [lastProcessingResult, setLastProcessingResult] =
    useState<CompensationProcessingResultDto | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const loadDetail = useCallback(async (options?: { preserveMessage?: boolean }) => {
    setLoading(true);
    if (!options?.preserveMessage) {
      setMessage("");
      setMessageType(null);
    }

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
      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger l'entrée de commission."
      );
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
  const isQaEvent = useMemo(
    () =>
      event
        ? isCompensationQaEventMarker({
            external_reference: event.external_reference,
            label: event.label,
            notes: event.notes,
          })
        : false,
    [event]
  );

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

  const handleProcessingSuccess = useCallback(
    async (result: CompensationProcessingResultDto) => {
      setLastProcessingResult(result);
      await loadDetail({ preserveMessage: true });
    },
    [loadDetail]
  );

  const handleProcessingFeedback = useCallback((nextMessage: string, type: "success" | "error") => {
    setMessage(nextMessage);
    setMessageType(nextMessage ? type : null);
  }, []);

  const handleCancelQaEvent = useCallback(async () => {
    if (!event || cancellingQa) return;
    const confirmed = window.confirm(
      "Annuler cette donnée QA staging ? L'événement passera au statut Annulé."
    );
    if (!confirmed) return;

    setCancellingQa(true);
    setMessage("");
    setMessageType(null);
    try {
      const updated = await updateCompensationSaleEvent(event.id, {
        status: "cancelled",
        notes: `${event.notes ?? ""}\n[QA] Annulé depuis le livre de commissions.`.trim(),
      });
      setEvent(updated);
      setMessage("Donnée QA annulée (statut Annulé).");
      setMessageType("success");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Annulation QA impossible."
      );
      setMessageType("error");
    } finally {
      setCancellingQa(false);
    }
  }, [cancellingQa, event]);

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

  if (loading && !event) {
    return (
      <TagoraLoadingScreen
        isLoading
        message="Chargement de l'entrée de commission..."
        fullScreen={false}
      />
    );
  }

  if (!event) {
    return (
      <div className="page-container compensation-admin-page">
        <AdminCompensationPageShell variant="detail" title="Livre de commissions">
          <AppCard className="compensation-empty-state compensation-empty-state-card">
            <strong>Entrée de commission introuvable</strong>
            <p>
              {message ||
                "Cet événement de commission n’existe pas ou n’est plus accessible."}
            </p>
            <Link
              href="/admin/compensation/ventes"
              className="tagora-dark-action tagora-page-navigation-button"
            >
              Retour au livre
            </Link>
          </AppCard>
        </AdminCompensationPageShell>
      </div>
    );
  }

  const eventReference = formatCompensationEventReference(event);

  return (
    <div className="page-container compensation-admin-page">
      <AdminCompensationPageShell
        variant="detail"
        title={eventReference}
        eventReference={eventReference}
        toolbar={
          isQaEvent && event.status !== "cancelled" ? (
            <button
              type="button"
              className="tagora-dark-outline-action tagora-page-navigation-button"
              disabled={cancellingQa}
              onClick={() => void handleCancelQaEvent()}
            >
              {cancellingQa ? "Annulation…" : "Annuler la donnée QA"}
            </button>
          ) : null
        }
      >
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
            {isQaEvent ? <StatusBadge label="QA staging" tone="warning" /> : null}
          </div>
          <div className="compensation-detail-hero__meta">
            <span>Chauffeur : {event.chauffeur_id ?? "—"}</span>
            <span>Montant : {formatCad(event.amount)}</span>
            <span>Date événement : {event.sold_at ?? "—"}</span>
            <span>Livré le : {event.delivered_at ?? "—"}</span>
            <span>Compagnie : {event.company_context ?? "—"}</span>
            <span>Réf. externe : {event.external_reference ?? "—"}</span>
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
                <button
                  type="button"
                  className="tagora-dark-outline-action"
                  onClick={() => void loadAggregateHistory()}
                >
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
            <CompensationProcessingActions
              eventId={event.id}
              isEligible={event.eligibility.is_eligible}
              accruals={accruals}
              busy={processingBusy || loading}
              onBusyChange={setProcessingBusy}
              onSuccess={handleProcessingSuccess}
              onFeedback={handleProcessingFeedback}
            />
            {lastProcessingResult ? (
              <CompensationProcessingSummaryPanel result={lastProcessingResult} />
            ) : null}
          </aside>
        </div>

        <FeedbackMessage message={message} type={messageType} />
      </AdminCompensationPageShell>
    </div>
  );
}
