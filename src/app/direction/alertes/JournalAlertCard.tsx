"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  buildJournalHumanView,
  categoryLabelFr,
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

function alertTypeBadgeStyle(): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    padding: "5px 11px",
    borderRadius: 8,
    background: "#0f766e",
    color: "#fff",
    border: "1px solid #0d9488",
    whiteSpace: "nowrap",
  };
}

function categoryBadgeStyle(): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 9px",
    borderRadius: 6,
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
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
}: JournalAlertCardProps) {
  const view = buildJournalHumanView(row);
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

  return (
    <article
      style={{
        borderRadius: 18,
        border: "1px solid #e2e8f0",
        background: "#fff",
        boxShadow: "0 4px 20px rgba(15, 23, 42, 0.06)",
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div
        className="ac-alert-top-row"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
              alignItems: "center",
            }}
          >
            <span style={alertTypeBadgeStyle()}>{view.alertTypeLabel}</span>
            <span style={statusBadgeStyle(row.status)}>{view.statusLabel}</span>
            <span style={priorityBadgeStyle(row.priority)}>{view.priorityLabel}</span>
            <span style={categoryBadgeStyle()}>{categoryLabelFr(row.category)}</span>
          </div>

          <h3
            style={{
              margin: "0 0 12px",
              fontSize: 18,
              fontWeight: 800,
              color: "#0f172a",
              lineHeight: 1.35,
              letterSpacing: "-0.02em",
            }}
          >
            {view.simpleTitle}
          </h3>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px 18px",
              fontSize: 13,
              color: "#64748b",
              marginBottom: 12,
            }}
          >
            <span>
              <strong style={{ color: "#475569" }}>Cible</strong> {view.targetLabel}
            </span>
            <span>
              <strong style={{ color: "#475569" }}>Date</strong> {view.formattedDate}
            </span>
            {row.companyKey ? (
              <span>
                <strong style={{ color: "#475569" }}>Compagnie</strong> {row.companyKey}
              </span>
            ) : null}
            {showRepeat ? (
              <span style={{ color: "#b45309", fontWeight: 600 }}>{showRepeat}</span>
            ) : null}
          </div>

          <div className="ac-journal-insight" aria-label="Résumé de l'alerte">
            <dl className="ac-journal-insight-row">
              <dt>Résumé</dt>
              <dd>{view.summary}</dd>
            </dl>
            <dl className="ac-journal-insight-row">
              <dt>Cause probable</dt>
              <dd>{view.probableCause}</dd>
            </dl>
            <dl className="ac-journal-insight-row">
              <dt>Action recommandée</dt>
              <dd>{view.recommendedAction}</dd>
            </dl>
          </div>

          {showTechToggle ? (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={onToggleTechnical}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0d9488",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {techExpanded ? "Masquer détail technique" : "Voir détail technique"}
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

        <div
          className="ac-alert-actions-col"
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
            minWidth: 200,
          }}
        >
          <div
            className="ac-alert-details"
            style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}
          >
            {row.linkHref ? (
              <Link
                href={row.linkHref}
                className="ui-button ui-button-primary"
                style={{ fontSize: 13, padding: "9px 16px", borderRadius: 10 }}
              >
                Ouvrir
              </Link>
            ) : null}
            <button
              type="button"
              className="ui-button ui-button-secondary"
              style={{ fontSize: 13, padding: "9px 16px", borderRadius: 10, fontWeight: 600 }}
              disabled={busy || !canHandle}
              onClick={onMarkHandled}
            >
              {busy ? "…" : "Traité"}
            </button>
            <details className="ac-details-reset" style={{ position: "relative" }}>
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#334155",
                }}
              >
                Plus
              </summary>
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  minWidth: 200,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  boxShadow: "0 12px 40px rgba(15,23,42,0.12)",
                  padding: 8,
                  zIndex: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  disabled={busy || !canArchive || row.status === "archived"}
                  onClick={onArchive}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#f8fafc",
                    fontSize: 13,
                    cursor: busy || !canArchive ? "not-allowed" : "pointer",
                    opacity: !canArchive || row.status === "archived" ? 0.45 : 1,
                  }}
                >
                  Archiver
                </button>
                <button
                  type="button"
                  disabled={busy || !canHandle}
                  onClick={onCancel}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#f8fafc",
                    fontSize: 13,
                    cursor: busy || !canHandle ? "not-allowed" : "pointer",
                    opacity: !canHandle ? 0.45 : 1,
                  }}
                >
                  Annuler
                </button>
                {isCritical ? (
                  <span
                    title="Les alertes critiques ne peuvent pas être supprimées depuis l’interface."
                    style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}
                  >
                    Non supprimable
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onDelete}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#fef2f2",
                      color: "#b91c1c",
                      fontSize: 13,
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    Supprimer…
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>

      {(row.emailDelivery !== "—" || row.smsDelivery !== "—" || row.handledAt) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 16px",
            fontSize: 12,
            color: "#64748b",
            paddingTop: 2,
            borderTop: "1px solid #f1f5f9",
          }}
        >
          {row.emailDelivery !== "—" ? (
            <span>
              <strong style={{ color: "#475569" }}>Courriel</strong>{" "}
              {row.emailDelivery === "failed" ? "Échec" : row.emailDelivery}
            </span>
          ) : null}
          {row.smsDelivery !== "—" ? (
            <span>
              <strong style={{ color: "#475569" }}>SMS</strong>{" "}
              {row.smsDelivery === "failed" ? "Échec" : row.smsDelivery}
            </span>
          ) : null}
          {row.handledAt ? (
            <span>
              <strong style={{ color: "#475569" }}>Traitée le</strong>{" "}
              {formatJournalDate(row.handledAt)}
            </span>
          ) : null}
        </div>
      )}
    </article>
  );
}

