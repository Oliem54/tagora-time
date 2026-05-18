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
}: Props) {
  return (
    <aside className="day-ramassage-mobile-bar" aria-label="Actions terrain ramassage">
      <div className="day-ramassage-mobile-bar__summary">
        <button type="button" className="day-ramassage-mobile-bar__summary-btn" onClick={onSelectStop}>
          <strong>{clientLabel}</strong>
          <span>{addressLabel}</span>
          {commandeLabel ? <span className="day-ramassage-mobile-bar__ref">Ref. {commandeLabel}</span> : null}
          {factureLabel ? <span className="day-ramassage-mobile-bar__ref">Fact. {factureLabel}</span> : null}
        </button>
      </div>
      <div className="day-ramassage-mobile-bar__grid">
        <button type="button" className="day-ramassage-mobile-bar__btn" disabled={!phone} onClick={onCall}>
          Appeler
        </button>
        <button type="button" className="day-ramassage-mobile-bar__btn" disabled={!mapsUrl} onClick={onMaps}>
          Maps
        </button>
        <button type="button" className="day-ramassage-mobile-bar__btn" onClick={onSignature}>
          Signature
        </button>
        <button type="button" className="day-ramassage-mobile-bar__btn" onClick={onVoice}>
          Vocal
        </button>
        <button type="button" className="day-ramassage-mobile-bar__btn" onClick={onScrollProofs}>
          Preuves
        </button>
        <button
          type="button"
          className="day-ramassage-mobile-bar__btn day-ramassage-mobile-bar__btn--success"
          disabled={!canComplete || completeLoading}
          title={!canComplete && completeDisabledReason ? completeDisabledReason : undefined}
          onClick={onComplete}
        >
          {completeLoading ? "..." : "Marquer ramasse"}
        </button>
      </div>
      {!canComplete && completeDisabledReason ? (
        <p className="day-ramassage-mobile-bar__proof-hint" role="status">
          {completeDisabledReason}
        </p>
      ) : null}
    </aside>
  );
}
