"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { ChevronDown, ExternalLink, ShieldCheck, TimerReset, UserRound } from "lucide-react";
import type { HorodateurExceptionDisplay } from "@/app/lib/horodateur-exception-display.shared";

export type HorodateurPendingExceptionCardItem = {
  id: string;
  employee_id: number;
  exception_type: string;
  reason_label: string;
  details: string | null;
  impact_minutes: number;
  status: string;
  direction_email_notified_at?: string | null;
  direction_sms_notified_at?: string | null;
  direction_reminder_email_notified_at?: string | null;
  direction_reminder_sms_notified_at?: string | null;
  employee: {
    employeeId: number;
    fullName: string | null;
    email: string | null;
  } | null;
  event: {
    event_type: string;
    occurredAt?: string | null;
    occurred_at?: string | null;
    event_time?: string | null;
  } | null;
};

type HorodateurPendingExceptionCardProps = {
  item: HorodateurPendingExceptionCardItem;
  display: HorodateurExceptionDisplay;
  isHighlighted: boolean;
  isPriority: boolean;
  isBusy: boolean;
  activeActionKey: string | null;
  isRefusing: boolean;
  canReviewException: boolean;
  refuseNote: string;
  correction: { main: string; related: string };
  formatDateTime: (value: string | null | undefined) => string;
  formatMinutes: (minutes: number) => string;
  onApprove: () => void;
  onStartRefuse: () => void;
  onConfirmRefuse: () => void;
  onCancelRefuse: () => void;
  onRefuseNoteChange: (value: string) => void;
  onCorrectionChange: (value: { main: string; related: string }) => void;
  onFocusEmployee?: (employeeId: number) => void;
};

export default function HorodateurPendingExceptionCard({
  item,
  display,
  isHighlighted,
  isPriority,
  isBusy,
  activeActionKey,
  isRefusing,
  canReviewException,
  refuseNote,
  correction,
  formatDateTime,
  formatMinutes,
  onApprove,
  onStartRefuse,
  onConfirmRefuse,
  onCancelRefuse,
  onRefuseNoteChange,
  onCorrectionChange,
  onFocusEmployee,
}: HorodateurPendingExceptionCardProps) {
  const [techExpanded, setTechExpanded] = useState(false);
  const [correctionExpanded, setCorrectionExpanded] = useState(false);
  const correctionPanelId = useId();
  const correctionRef = useRef<HTMLDivElement>(null);
  const occurredAt =
    item.event?.occurredAt ?? item.event?.occurred_at ?? item.event?.event_time ?? null;
  const employeeProfileId = item.employee?.employeeId ?? item.employee_id;

  const technicalDetails = [
    ...display.technicalDetails,
    { label: "ID exception", value: item.id },
    { label: "Impact", value: formatMinutes(item.impact_minutes) },
    { label: "Statut exception", value: item.status },
    item.event
      ? {
          label: "Événement lié",
          value: `${item.event.event_type}${occurredAt ? ` — ${formatDateTime(occurredAt)}` : ""}`,
        }
      : null,
    {
      label: "Email initial",
      value: formatDateTime(item.direction_email_notified_at ?? null),
    },
    {
      label: "SMS initial",
      value: formatDateTime(item.direction_sms_notified_at ?? null),
    },
    {
      label: "Rappel email",
      value: formatDateTime(item.direction_reminder_email_notified_at ?? null),
    },
    {
      label: "Rappel SMS",
      value: formatDateTime(item.direction_reminder_sms_notified_at ?? null),
    },
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));

  function openCorrectionPanel() {
    setCorrectionExpanded(true);
    window.requestAnimationFrame(() => {
      correctionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <article
      className={`horo-pending-card${isHighlighted ? " horo-pending-card--highlighted" : ""}${
        isPriority ? " horo-pending-card--priority" : ""
      }`}
      data-horodateur-exception-employee={item.employee_id}
    >
      <div className="horo-pending-top-row">
        <div className="horo-pending-main">
          <div className="horo-pending-badges">
            <span className="horo-pending-badge horo-pending-badge--case">{display.caseLabel}</span>
            <span className="horo-pending-badge horo-pending-badge--decision">
              {display.decisionStatusLabel}
            </span>
            {isPriority ? (
              <span className="horo-pending-badge horo-pending-badge--priority">Priorité</span>
            ) : null}
          </div>

          <h3 className="horo-pending-title">{display.humanTitle}</h3>
          <p className="horo-pending-summary">{display.humanSummary}</p>

          <div className="horo-pending-decision-panel" aria-label="Décision horodateur">
            <div className="horo-pending-decision-grid">
              <div className="horo-pending-employee">
                <span className="horo-pending-label">Employé</span>
                <strong>{display.employeeName}</strong>
                {display.employeeIdLabel ? (
                  <span className="horo-pending-employee-id">{display.employeeIdLabel}</span>
                ) : null}
              </div>
              <div>
                <span className="horo-pending-label">Action attendue</span>
                <strong>{display.actionLabel}</strong>
              </div>
              <div>
                <span className="horo-pending-label">Heure prévue</span>
                <strong>{display.expectedTime ?? "—"}</strong>
              </div>
              <div>
                <span className="horo-pending-label">Punch détecté</span>
                <strong>{display.detectedPunchLabel}</strong>
              </div>
              <div>
                <span className="horo-pending-label">Date</span>
                <strong>{display.dateLabel}</strong>
              </div>
              <div>
                <span className="horo-pending-label">Statut</span>
                <strong>{display.decisionStatusLabel}</strong>
              </div>
            </div>

            <div className="horo-pending-insight">
              <strong>Pourquoi cette exception ?</strong>
              <p>{display.whyText}</p>
            </div>

            <div className="horo-pending-insight">
              <strong>Action recommandée</strong>
              <p>{display.recommendedActionText}</p>
            </div>
          </div>

          {correctionExpanded ? (
            <div
              ref={correctionRef}
              id={correctionPanelId}
              className="horo-pending-correction-panel"
              role="region"
              aria-label="Correction d'heure"
            >
              <div className="horo-pending-correction-head">
                <strong>Corriger l&apos;heure</strong>
                <button
                  type="button"
                  className="horo-pending-tech-button"
                  onClick={() => setCorrectionExpanded(false)}
                >
                  Fermer
                </button>
              </div>
              <p>
                Optionnel — laisser vide pour approuver tel quel depuis le bouton Approuver.
              </p>
              <label className="horo-pending-field horo-pending-field--light">
                <span>Heure corrigée événement principal (HH:MM)</span>
                <input
                  type="text"
                  className="tagora-input"
                  placeholder="Ex. 08:30"
                  value={correction.main}
                  disabled={isBusy}
                  onChange={(event) =>
                    onCorrectionChange({
                      main: event.target.value,
                      related: correction.related,
                    })
                  }
                />
              </label>
              <label className="horo-pending-field horo-pending-field--light">
                <span>Heure corrigée événement lié (HH:MM)</span>
                <input
                  type="text"
                  className="tagora-input"
                  placeholder="Optionnel"
                  value={correction.related}
                  disabled={isBusy}
                  onChange={(event) =>
                    onCorrectionChange({
                      main: correction.main,
                      related: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          ) : null}

          <div className="horo-pending-tech-toggle">
            <button
              type="button"
              className="horo-pending-tech-button"
              onClick={() => setTechExpanded((current) => !current)}
              aria-expanded={techExpanded}
            >
              <ChevronDown
                size={14}
                className={`horo-pending-tech-chevron${techExpanded ? " horo-pending-tech-chevron--open" : ""}`}
              />
              {techExpanded ? "Masquer détail technique" : "Détail technique"}
            </button>
            {techExpanded ? (
              <div className="horo-pending-tech-panel" role="region" aria-label="Détail technique">
                <dl>
                  {technicalDetails.map((entry, idx) => (
                    <div key={`${entry.label}-${idx}`}>
                      <dt>{entry.label}</dt>
                      <dd>{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        </div>

        <div className="horo-pending-actions">
          {!canReviewException ? (
            <div className="horo-pending-admin-note" role="note">
              Approbation admin requise pour cette demande de correction rétroactive.
            </div>
          ) : !isRefusing ? (
            <div className="horo-pending-primary-actions">
              <button
                type="button"
                className="horo-pending-action-btn horo-pending-action-btn--approve"
                onClick={onApprove}
                disabled={isBusy}
              >
                <ShieldCheck size={16} />
                {activeActionKey === `approve:${item.id}` ? "Approbation..." : "Approuver"}
              </button>
              <button
                type="button"
                className="horo-pending-action-btn horo-pending-action-btn--refuse"
                onClick={onStartRefuse}
                disabled={isBusy}
              >
                <TimerReset size={16} />
                Refuser
              </button>
              <button
                type="button"
                className="horo-pending-action-btn horo-pending-action-btn--secondary"
                onClick={() => setTechExpanded((current) => !current)}
                disabled={isBusy}
              >
                Voir détails
              </button>
              {employeeProfileId ? (
                <Link
                  href={`/direction/ressources/employes/${employeeProfileId}`}
                  className="horo-pending-action-btn horo-pending-action-btn--secondary"
                >
                  <UserRound size={16} />
                  Voir l&apos;employé
                </Link>
              ) : null}
              <button
                type="button"
                className="horo-pending-action-btn horo-pending-action-btn--muted"
                onClick={openCorrectionPanel}
                disabled={isBusy}
              >
                Corriger l&apos;heure
              </button>
              {onFocusEmployee ? (
                <button
                  type="button"
                  className="horo-pending-action-btn horo-pending-action-btn--open"
                  onClick={() => onFocusEmployee(item.employee_id)}
                  disabled={isBusy}
                >
                  <ExternalLink size={16} />
                  Ouvrir dans l&apos;horodateur
                </button>
              ) : null}
            </div>
          ) : (
            <div className="horo-pending-refuse-panel">
              <label className="horo-pending-field horo-pending-field--light">
                <span className="horo-pending-label">Raison du refus (obligatoire)</span>
                <textarea
                  className="tagora-textarea"
                  value={refuseNote}
                  onChange={(event) => onRefuseNoteChange(event.target.value)}
                  placeholder="Expliquez brièvement le motif du refus..."
                  rows={4}
                  disabled={isBusy}
                />
              </label>
              <button
                type="button"
                className="horo-pending-action-btn horo-pending-action-btn--refuse-confirm"
                onClick={onConfirmRefuse}
                disabled={isBusy}
              >
                {activeActionKey === `refuse:${item.id}` ? "Refus en cours..." : "Confirmer le refus"}
              </button>
              <button
                type="button"
                className="horo-pending-action-btn horo-pending-action-btn--muted"
                onClick={onCancelRefuse}
                disabled={isBusy}
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
