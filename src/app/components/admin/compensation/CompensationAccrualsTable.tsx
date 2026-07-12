"use client";

import { useState } from "react";
import StatusBadge from "@/app/components/ui/StatusBadge";
import type { Accrual, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import type { AccrualWorkflowAction } from "@/app/lib/commissions/compensation-engine-api.client";
import {
  accrualWorkflowStatusLabel,
  accrualWorkflowStatusTone,
  getWorkflowActionsForStatus,
} from "@/app/lib/commissions/compensation-engine-ui.shared";
import { formatCad } from "@/app/lib/commissions/commissions.shared";

type CompensationAccrualsTableProps = {
  accruals: Accrual[];
  histories: Record<string, AccrualStatusHistoryEntry[]>;
  loadingAccrualId?: string | null;
  onWorkflowAction: (
    accrualId: string,
    action: AccrualWorkflowAction,
    reason?: string | null
  ) => Promise<void>;
  onExpandHistory: (accrualId: string) => Promise<void>;
};

export default function CompensationAccrualsTable({
  accruals,
  histories,
  loadingAccrualId,
  onWorkflowAction,
  onExpandHistory,
}: CompensationAccrualsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reasonByAccrual, setReasonByAccrual] = useState<Record<string, string>>({});

  if (accruals.length === 0) {
    return (
      <section className="compensation-panel">
        <div className="compensation-panel__header">
          <h2>Accruals lies</h2>
        </div>
        <div className="compensation-empty-state compensation-empty-state--compact">
          <strong>Aucun accrual pour cet événement.</strong>
          <p>Aucun montant n a encore ete calcule et persiste pour cet event.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="compensation-panel">
      <div className="compensation-panel__header">
        <h2>Accruals lies</h2>
        <p>Validation finance par ligne</p>
      </div>

      <div className="compensation-table-wrap">
        <table className="compensation-premium-table">
          <thead>
            <tr>
              <th>Composant</th>
              <th>Regle</th>
              <th>Libelle</th>
              <th>Base</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accruals.map((accrual) => {
              const actions = getWorkflowActionsForStatus(accrual.status);
              const isExpanded = expandedId === accrual.id;
              const history = histories[accrual.id] ?? [];

              return (
                <tr key={accrual.id} className="compensation-accrual-row">
                  <td>{accrual.component}</td>
                  <td>{accrual.rule_name}</td>
                  <td>{accrual.label}</td>
                  <td className="compensation-money">{formatCad(accrual.sales_basis_amount)}</td>
                  <td className="compensation-money compensation-money--strong">
                    {formatCad(accrual.calculated_amount)}
                  </td>
                  <td>
                    <StatusBadge
                      label={accrualWorkflowStatusLabel(accrual.status)}
                      tone={accrualWorkflowStatusTone(accrual.status)}
                    />
                  </td>
                  <td>
                    <div className="compensation-accrual-actions">
                      {actions.map((actionDef) => (
                        <button
                          key={actionDef.action}
                          type="button"
                          className={
                            actionDef.tone === "success"
                              ? "tagora-dark-action"
                              : "tagora-dark-outline-action"
                          }
                          disabled={loadingAccrualId === accrual.id}
                          onClick={() =>
                            onWorkflowAction(
                              accrual.id,
                              actionDef.action,
                              reasonByAccrual[accrual.id] ?? null
                            )
                          }
                        >
                          {actionDef.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        onClick={async () => {
                          const next = isExpanded ? null : accrual.id;
                          setExpandedId(next);
                          if (next && history.length === 0) {
                            await onExpandHistory(accrual.id);
                          }
                        }}
                      >
                        {isExpanded ? "Masquer historique" : "Historique"}
                      </button>
                    </div>
                    {actions.length > 0 ? (
                      <input
                        className="compensation-reason-input"
                        type="text"
                        placeholder="Raison optionnelle"
                        value={reasonByAccrual[accrual.id] ?? ""}
                        onChange={(event) =>
                          setReasonByAccrual((current) => ({
                            ...current,
                            [accrual.id]: event.target.value,
                          }))
                        }
                      />
                    ) : null}
                    {isExpanded ? (
                      <div className="compensation-inline-history">
                        {history.length === 0 ? (
                          <p>Aucun changement de statut enregistre.</p>
                        ) : (
                          history.map((entry) => (
                            <div key={entry.id} className="compensation-inline-history__item">
                              <strong>
                                {(entry.from_status ?? "—") + " → " + entry.to_status}
                              </strong>
                              <span>{new Date(entry.changed_at).toLocaleString("fr-CA")}</span>
                              {entry.reason ? <span>{entry.reason}</span> : null}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
