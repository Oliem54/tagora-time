"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  buildJournalHumanView,
  formatJournalDate,
  hasTechnicalDetails,
  type JournalRowForDisplay,
} from "@/app/direction/alertes/alert-journal-display";

export type JournalAlertCardRow = JournalRowForDisplay & {
  id: string;
  linkHref: string | null;
  handledAt: string | null;
  failureCount?: number | null;
};

type JournalAlertCardProps = {
  row: JournalAlertCardRow;
  busy: boolean;
  techExpanded: boolean;
  onToggleTechnical: () => void;
  onMarkHandled: () => void;
  onArchive: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onApproveException?: (exceptionId: string) => void;
  onRefuseException?: (exceptionId: string) => void;
};

function statusBadgeStyle(status: string): CSSProperties {
  const base: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 8,
    whiteSpace: "nowrap",
  };
  switch (status) {
    case "open":
      return { ...base, background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" };
    case "failed":
      return { ...base, background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
    case "handled":
      return { ...base, background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
    case "archived":
      return { ...base, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" };
    case "cancelled":
      return { ...base, background: "#fafafa", color: "#737373", border: "1px solid #e5e5e5" };
    default:
      return { ...base, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" };
  }
}

function priorityBadgeStyle(p: string): CSSProperties {
  const base: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.02em",
    padding: "4px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  };
  switch (p) {
    case "critical":
      return { ...base, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" };
    case "high":
      return { ...base, background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" };
    case "medium":
      return { ...base, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
    default:
      return { ...base, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" };
  }
}

function caseBadgeStyle(): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    padding: "5px 11px",
    borderRadius: 8,
    background: "linear-gradient(135deg, #0f766e 0%, #115e59 100%)",
    color: "#fff",
    border: "1px solid #0d9488",
    whiteSpace: "normal",
    lineHeight: 1.25,
    textAlign: "center",
  };
}

export default function JournalAlertCard({
  row,
  busy,
  techExpanded,
  onToggleTechnical,
  onMarkHandled,
  onArchive,
  onCancel,
  onDelete,
  onApproveException,
  onRefuseException,
}: JournalAlertCardProps) {
  const view = buildJournalHumanView(row);
  const horo = view.horodateurDisplay;
  const showTechToggle = hasTechnicalDetails(view);
  const fc = row.failureCount;
  const showRepeat = typeof fc === "number" && fc > 1 ? `Répété ${fc - 1} fois` : null;
  const canHandle = row.status === "open" || row.status === "failed";
  const canArchive =
    row.status === "open" ||
    row.status === "failed" ||
    row.status === "handled" ||
    row.status === "snoozed";
  const isCritical = row.priority === "critical";
  const isHorodateurOpen = Boolean(horo && (row.status === "open" || row.status === "failed"));
  const exceptionId = horo?.exceptionId ?? null;
  const horodateurHref = row.linkHref ?? horo?.horodateurHref ?? "/direction/horodateur";

  return (
    <article className="ac-journal-card">
      <div className="ac-alert-top-row">
        <div className="ac-journal-card__main">
          <div className="ac-journal-card__badges">
            <span style={caseBadgeStyle()}>{view.alertTypeLabel}</span>
            <span style={statusBadgeStyle(row.status)}>{view.statusLabel}</span>
            <span style={priorityBadgeStyle(row.priority)}>{view.priorityLabel}</span>
          </div>

          <h3 className="ac-journal-card__title">{view.simpleTitle}</h3>

          <p className="ac-journal-card__summary">{view.summary}</p>

          {horo ? (
            <div className="ac-horo-decision-panel" aria-label="Décision horodateur">
              <div className="ac-horo-decision-grid">
                <div className="ac-horo-decision-employee">
                  <span className="ac-horo-decision-label">Employé</span>
                  <strong>{horo.employeeName}</strong>
                  {horo.employeeIdLabel ? (
                    <span className="ac-horo-decision-employee-id">{horo.employeeIdLabel}</span>
                  ) : null}
                </div>
                <div>
                  <span className="ac-horo-decision-label">Action attendue</span>
                  <strong>{horo.actionLabel}</strong>
                </div>
                <div>
                  <span className="ac-horo-decision-label">Heure prévue</span>
                  <strong>{horo.expectedTime ?? "—"}</strong>
                </div>
                <div>
                  <span className="ac-horo-decision-label">Punch détecté</span>
                  <strong>{horo.detectedPunchLabel}</strong>
                </div>
                <div>
                  <span className="ac-horo-decision-label">Date</span>
                  <strong>{horo.dateLabel}</strong>
                </div>
                <div>
                  <span className="ac-horo-decision-label">Statut</span>
                  <strong>{horo.decisionStatusLabel}</strong>
                </div>
              </div>

              <div className="ac-horo-insight-block">
                <strong>Pourquoi cette alerte ?</strong>
                <p>{view.probableCause}</p>
              </div>

              <div className="ac-horo-insight-block">
                <strong>Action recommandée</strong>
                <p>{view.recommendedAction}</p>
              </div>

              {isHorodateurOpen ? (
                <div className="ac-horo-decision-note" role="note">
                  <strong>Important</strong>
                  <p>
                    « Classer l&apos;alerte » ne règle pas l&apos;exception. Pour approuver ou
                    refuser, utilisez les actions horodateur ci-dessous.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="ac-journal-insight" aria-label="Résumé de l'alerte">
              <dl className="ac-journal-insight-row">
                <dt>Cause probable</dt>
                <dd>{view.probableCause}</dd>
              </dl>
              <dl className="ac-journal-insight-row">
                <dt>Action recommandée</dt>
                <dd>{view.recommendedAction}</dd>
              </dl>
            </div>
          )}

          <div className="ac-journal-card__meta">
            <span>
              <strong>Créée</strong> {view.formattedDate}
            </span>
            {row.companyKey ? (
              <span>
                <strong>Compagnie</strong> {row.companyKey}
              </span>
            ) : null}
            {showRepeat ? <span className="ac-journal-card__repeat">{showRepeat}</span> : null}
          </div>

          {row.employeeId != null ? (
            <nav className="ac-journal-card__secondary-links" aria-label="Liens secondaires employé">
              <Link href={`/direction/ressources/employes/${row.employeeId}`}>Profil employé</Link>
              <Link href={`/direction/horodateur/registre?employeeId=${row.employeeId}`}>
                Registre horaire
              </Link>
              <Link href={`/direction/ressources/employes/${row.employeeId}?section=alertes_sms`}>
                Alertes SMS
              </Link>
            </nav>
          ) : null}

          {showTechToggle ? (
            <div className="ac-journal-card__tech-toggle">
              <button type="button" onClick={onToggleTechnical} className="ac-journal-tech-button">
                {techExpanded ? "Masquer détail technique" : "Détail technique"}
              </button>
              {techExpanded ? (
                <div className="ac-tech-panel" role="region" aria-label="Détail technique">
                  <dl>
                    {view.technicalDetails.map((entry, idx) => (
                      <div key={`${entry.label}-${idx}`}>
                        <dt>{entry.label}</dt>
                        <dd>{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ac-alert-actions-col">
          {isHorodateurOpen ? (
            <div className="ac-horo-primary-actions">
              <Link
                href={horodateurHref}
                className="ac-horo-action-btn ac-horo-action-btn--open"
              >
                Ouvrir dans l&apos;horodateur
              </Link>
              {exceptionId && onApproveException ? (
                <button
                  type="button"
                  className="ac-horo-action-btn ac-horo-action-btn--approve"
                  disabled={busy}
                  onClick={() => onApproveException(exceptionId)}
                >
                  Approuver
                </button>
              ) : null}
              {exceptionId && onRefuseException ? (
                <button
                  type="button"
                  className="ac-horo-action-btn ac-horo-action-btn--refuse"
                  disabled={busy}
                  onClick={() => onRefuseException(exceptionId)}
                >
                  Refuser
                </button>
              ) : null}
              <Link href={horodateurHref} className="ac-horo-action-btn ac-horo-action-btn--secondary">
                Corriger
              </Link>
              <button
                type="button"
                className="ac-horo-action-btn ac-horo-action-btn--muted"
                disabled={busy || !canHandle}
                onClick={onMarkHandled}
                title="Marquer l'alerte comme lue ou classée — n'approuve pas l'exception."
              >
                {busy ? "…" : "Classer l'alerte"}
              </button>
            </div>
          ) : (
            <div className="ac-alert-details">
              {row.linkHref ? (
                <Link href={row.linkHref} className="ui-button ui-button-primary">
                  Ouvrir
                </Link>
              ) : null}
              <button
                type="button"
                className="ui-button ui-button-secondary"
                disabled={busy || !canHandle}
                onClick={onMarkHandled}
              >
                {busy ? "…" : "Classer l'alerte"}
              </button>
              <details className="ac-details-reset">
                <summary>Plus</summary>
                <div className="ac-alert-more-menu">
                  <button type="button" disabled={busy || !canArchive || row.status === "archived"} onClick={onArchive}>
                    Archiver
                  </button>
                  <button type="button" disabled={busy || !canHandle} onClick={onCancel}>
                    Annuler
                  </button>
                  {isCritical ? (
                    <span className="ac-alert-more-note">Non supprimable</span>
                  ) : (
                    <button type="button" disabled={busy} onClick={onDelete} className="ac-alert-delete-btn">
                      Supprimer…
                    </button>
                  )}
                </div>
              </details>
            </div>
          )}

          {isHorodateurOpen ? (
            <details className="ac-details-reset ac-horo-more">
              <summary>Plus</summary>
              <div className="ac-alert-more-menu">
                <button type="button" disabled={busy || !canArchive || row.status === "archived"} onClick={onArchive}>
                  Archiver
                </button>
                <button type="button" disabled={busy || !canHandle} onClick={onCancel}>
                  Annuler
                </button>
                {!isCritical ? (
                  <button type="button" disabled={busy} onClick={onDelete} className="ac-alert-delete-btn">
                    Supprimer…
                  </button>
                ) : (
                  <span className="ac-alert-more-note">Non supprimable</span>
                )}
              </div>
            </details>
          ) : null}
        </div>
      </div>

      {row.handledAt ? (
        <div className="ac-journal-card__footer">
          <span>
            <strong>Classée le</strong> {formatJournalDate(row.handledAt)}
          </span>
        </div>
      ) : null}
    </article>
  );
}
