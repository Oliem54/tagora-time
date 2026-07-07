"use client";

import type { AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import { accrualWorkflowStatusLabel } from "@/app/lib/commissions/compensation-engine-ui.shared";

type CompensationWorkflowHistoryProps = {
  entries: AccrualStatusHistoryEntry[];
  accrualLabel?: string;
};

export default function CompensationWorkflowHistory({
  entries,
  accrualLabel,
}: CompensationWorkflowHistoryProps) {
  return (
    <section className="compensation-panel">
      <div className="compensation-panel__header">
        <h2>Historique workflow</h2>
        {accrualLabel ? <p>{accrualLabel}</p> : null}
      </div>

      {entries.length === 0 ? (
        <div className="compensation-empty-state compensation-empty-state--compact">
          <strong>Aucun changement de statut enregistre.</strong>
        </div>
      ) : (
        <ol className="compensation-workflow-history">
          {entries.map((entry) => (
            <li key={entry.id} className="compensation-workflow-history__item">
              <div className="compensation-workflow-history__meta">
                <time dateTime={entry.changed_at}>
                  {new Date(entry.changed_at).toLocaleString("fr-CA")}
                </time>
                <span>{entry.changed_by ?? "Systeme"}</span>
              </div>
              <strong>
                {(entry.from_status ? accrualWorkflowStatusLabel(entry.from_status) : "—") +
                  " → " +
                  accrualWorkflowStatusLabel(entry.to_status)}
              </strong>
              {entry.reason ? <p>{entry.reason}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
