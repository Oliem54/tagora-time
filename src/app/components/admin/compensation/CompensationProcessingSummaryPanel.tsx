"use client";

import { useCallback, useState } from "react";
import type { CompensationProcessingResultDto } from "@/app/lib/commissions/compensation-processing-api.shared";
import { buildProcessingSummaryViewModel } from "@/app/lib/commissions/compensation-engine-ui.shared";

type CompensationProcessingSummaryPanelProps = {
  result: CompensationProcessingResultDto;
};

export default function CompensationProcessingSummaryPanel({
  result,
}: CompensationProcessingSummaryPanelProps) {
  const view = buildProcessingSummaryViewModel(result);
  const [copied, setCopied] = useState(false);

  const copyCorrelationId = useCallback(async () => {
    if (!view.correlationId || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(view.correlationId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [view.correlationId]);

  return (
    <section className="compensation-side-card compensation-processing-summary">
      <div className="compensation-side-card__header">
        <h2>Résumé du traitement</h2>
      </div>

      <p className="compensation-processing-summary__notice">{view.sessionNotice}</p>

      <dl className="compensation-processing-summary__grid">
        <div>
          <dt>Type d&apos;exécution</dt>
          <dd>{view.executionTypeLabel}</dd>
        </div>
        <div>
          <dt>Résultat</dt>
          <dd>{view.resultLabel}</dd>
        </div>
        <div>
          <dt>Début</dt>
          <dd>{view.startedAtLabel}</dd>
        </div>
        <div>
          <dt>Fin</dt>
          <dd>{view.finishedAtLabel}</dd>
        </div>
        <div>
          <dt>Durée</dt>
          <dd>{view.durationLabel}</dd>
        </div>
        <div>
          <dt>Accruals créés</dt>
          <dd>{view.accrualsCreatedLabel}</dd>
        </div>
        <div>
          <dt>Accruals remplacés</dt>
          <dd>{view.accrualsSupersededLabel}</dd>
        </div>
        <div>
          <dt>Montant total calculé</dt>
          <dd>{view.totalAmountLabel}</dd>
        </div>
        <div className="compensation-processing-summary__full">
          <dt>Avertissements</dt>
          <dd>
            {view.warningsEmpty ? (
              "Aucun avertissement"
            ) : (
              <ul className="compensation-processing-summary__warnings">
                {view.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>Version moteur</dt>
          <dd>{view.engineVersionLabel}</dd>
        </div>
        <div className="compensation-processing-summary__full">
          <dt>Référence support</dt>
          <dd>
            {view.correlationId ? (
              <span className="compensation-processing-summary__correlation">
                <code>{view.correlationId}</code>
                <button
                  type="button"
                  className="tagora-dark-outline-action"
                  onClick={() => void copyCorrelationId()}
                >
                  {copied ? "Copié" : "Copier"}
                </button>
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
