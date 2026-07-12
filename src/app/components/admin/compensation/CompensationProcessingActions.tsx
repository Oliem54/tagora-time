"use client";

import type { Accrual } from "@/app/lib/commissions/accruals.shared";
import type { CompensationProcessingResultDto } from "@/app/lib/commissions/compensation-processing-api.shared";
import {
  getProcessingActionVisibility,
  getProcessingBlockedNote,
  getProcessingBusyMessage,
  getProcessingConfirmMessage,
  getProcessingSuccessMessage,
  mapProcessingApiErrorMessage,
  runConfirmedProcessingAction,
  type ProcessingActionKind,
} from "@/app/lib/commissions/compensation-engine-ui.shared";
import {
  CompensationProcessingApiError,
  processCompensationSaleEvent,
  recalculateCompensationSaleEvent,
} from "@/app/lib/commissions/compensation-engine-api.client";

type CompensationProcessingActionsProps = {
  eventId: string;
  isEligible: boolean;
  accruals: Accrual[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSuccess: (result: CompensationProcessingResultDto, kind: ProcessingActionKind) => Promise<void>;
  onFeedback: (message: string, type: "success" | "error") => void;
};

export default function CompensationProcessingActions({
  eventId,
  isEligible,
  accruals,
  busy,
  onBusyChange,
  onSuccess,
  onFeedback,
}: CompensationProcessingActionsProps) {
  const visibility = getProcessingActionVisibility(isEligible, accruals);
  const blockedNote = getProcessingBlockedNote(visibility.blockedReason);

  const runAction = async (kind: ProcessingActionKind) => {
    if (busy) return;

    const confirmed = window.confirm(getProcessingConfirmMessage(kind));
    if (!confirmed) return;

    onBusyChange(true);
    onFeedback(getProcessingBusyMessage(kind), "success");

    const outcome = await runConfirmedProcessingAction({
      confirmed: true,
      isBusy: false,
      execute: () =>
        kind === "process"
          ? processCompensationSaleEvent(eventId)
          : recalculateCompensationSaleEvent(eventId),
      onSuccess: async (result) => {
        await onSuccess(result, kind);
      },
    });

    if (outcome === "cancelled" || outcome === "skipped_busy") {
      onBusyChange(false);
      return;
    }

    if (outcome.ok) {
      onFeedback(getProcessingSuccessMessage(kind), "success");
    } else {
      const error = outcome.error;
      const code = error instanceof CompensationProcessingApiError ? error.code : null;
      const fallback =
        error instanceof Error ? error.message : "Traitement compensation impossible.";
      onFeedback(mapProcessingApiErrorMessage(code, fallback), "error");
    }

    onBusyChange(false);
  };

  if (!visibility.canProcess && !visibility.canRecalculate) {
    return (
      <section className="compensation-side-card">
        <div className="compensation-side-card__header">
          <h2>Actions processing</h2>
        </div>
        <p className="compensation-side-card__note">
          {blockedNote ??
            "Aucune action de calcul disponible pour l'état actuel de cet événement."}
        </p>
      </section>
    );
  }

  return (
    <section className="compensation-side-card">
      <div className="compensation-side-card__header">
        <h2>Actions processing</h2>
      </div>
      <div className="compensation-processing-actions">
        {visibility.canProcess ? (
          <button
            type="button"
            className="tagora-dark-action"
            disabled={busy}
            onClick={() => void runAction("process")}
          >
            Calculer les commissions
          </button>
        ) : null}
        {visibility.canRecalculate ? (
          <button
            type="button"
            className="tagora-dark-outline-action"
            disabled={busy}
            onClick={() => void runAction("recalculate")}
          >
            Recalculer les commissions
          </button>
        ) : null}
      </div>
      {busy ? (
        <p className="compensation-side-card__note" role="status">
          Action en cours…
        </p>
      ) : (
        <p className="compensation-side-card__note">
          Confirmation requise avant execution. Le serveur reste la source de verite.
        </p>
      )}
    </section>
  );
}
