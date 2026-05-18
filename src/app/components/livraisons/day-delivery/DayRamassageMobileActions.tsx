"use client";

type Props = {
  clientLabel: string;
  addressLabel: string;
  phone: string | null;
  mapsUrl: string | null;
  commandeLabel: string | null;
  factureLabel: string | null;
  canComplete: boolean;
  completeDisabledReason: string | null;
  completeLoading: boolean;
  onCall: () => void;
  onMaps: () => void;
  onSignature: () => void;
  onVoice: () => void;
  onScrollProofs: () => void;
  onComplete: () => void;
  onSelectStop: () => void;
  onProblem?: () => void;
  onNote?: () => void;
  onBackToList?: () => void;
  problemLoading?: boolean;
};

export default function DayRamassageMobileActions({
  clientLabel,
  addressLabel,
  phone,
  mapsUrl,
  commandeLabel,
  factureLabel,
  canComplete,
  completeDisabledReason,
  completeLoading,
  onCall,
  onMaps,
  onSignature,
  onVoice,
  onScrollProofs,
  onComplete,
  onSelectStop,
  onProblem,
  onNote,
  onBackToList,
  problemLoading = false,
}: Props) {
  return (
    <aside className="day-ramassage-mobile-bar day-ramassage-mobile-bar--premium" aria-label="Actions terrain ramassage">
      <div className="day-ramassage-mobile-bar__summary">
        <button type="button" className="day-ramassage-mobile-bar__summary-btn" onClick={onSelectStop}>
          <strong>{clientLabel}</strong>
          <span>{addressLabel}</span>
          {commandeLabel ? <span className="day-ramassage-mobile-bar__ref">Ref. {commandeLabel}</span> : null}
          {factureLabel ? <span className="day-ramassage-mobile-bar__ref">Fact. {factureLabel}</span> : null}
        </button>
      </div>
      <div className="day-ramassage-mobile-bar__grid day-ramassage-mobile-bar__grid--primary">
        <button
          type="button"
          className="day-ramassage-mobile-bar__btn day-ramassage-mobile-bar__btn--call"
          disabled={!phone}
          onClick={onCall}
        >
          Appeler
        </button>
        <button
          type="button"
          className="day-ramassage-mobile-bar__btn day-ramassage-mobile-bar__btn--maps"
          disabled={!mapsUrl}
          onClick={onMaps}
        >
          Itinéraire
        </button>
        <button
          type="button"
          className="day-ramassage-mobile-bar__btn day-ramassage-mobile-bar__btn--success"
          disabled={!canComplete || completeLoading}
          title={!canComplete && completeDisabledReason ? completeDisabledReason : undefined}
          onClick={onComplete}
        >
          {completeLoading ? "..." : "Marquer ramassé"}
        </button>
      </div>
      <div className="day-ramassage-mobile-bar__grid day-ramassage-mobile-bar__grid--secondary">
        <button type="button" className="day-ramassage-mobile-bar__btn" onClick={onSignature}>
          Signature
        </button>
        <button type="button" className="day-ramassage-mobile-bar__btn" onClick={onVoice}>
          Note vocale
        </button>
        <button type="button" className="day-ramassage-mobile-bar__btn" onClick={onScrollProofs}>
          Preuve / photo
        </button>
        {onNote ? (
          <button type="button" className="day-ramassage-mobile-bar__btn" onClick={onNote}>
            Note
          </button>
        ) : null}
        {onProblem ? (
          <button
            type="button"
            className="day-ramassage-mobile-bar__btn day-ramassage-mobile-bar__btn--danger"
            disabled={problemLoading}
            onClick={onProblem}
          >
            {problemLoading ? "..." : "Problème"}
          </button>
        ) : null}
        {onBackToList ? (
          <button type="button" className="day-ramassage-mobile-bar__btn day-ramassage-mobile-bar__btn--ghost" onClick={onBackToList}>
            Retour liste
          </button>
        ) : null}
      </div>
      {!canComplete && completeDisabledReason ? (
        <p className="day-ramassage-mobile-bar__proof-hint" role="status">
          {completeDisabledReason}
        </p>
      ) : null}
    </aside>
  );
}