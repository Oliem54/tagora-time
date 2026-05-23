"use client";

type Props = {
  clientLabel: string;
  addressLabel: string;
  etaLabel: string | null;
  phone: string | null;
  mapsUrl: string | null;
  trackingUrl: string | null;
  canEnRoute: boolean;
  canDeliver?: boolean;
  deliverLabel?: string;
  deliverDisabledReason?: string | null;
  enRouteLoading: boolean;
  deliverLoading: boolean;
  problemLoading?: boolean;
  onEnRoute: () => void;
  onCall: () => void;
  onMaps: () => void;
  onSignature: () => void;
  onVoice: () => void;
  onScrollProofs: () => void;
  onDeliver: () => void;
  onSelectStop: () => void;
  onNote?: () => void;
  onProblem?: () => void;
  onBackToList?: () => void;
};

export default function DayDeliveryMobileActions({
  clientLabel,
  addressLabel,
  etaLabel,
  phone,
  mapsUrl,
  trackingUrl,
  canEnRoute,
  canDeliver = true,
  deliverLabel = "Marquer livré",
  deliverDisabledReason = null,
  enRouteLoading,
  deliverLoading,
  problemLoading = false,
  onEnRoute,
  onCall,
  onMaps,
  onSignature,
  onVoice,
  onScrollProofs,
  onDeliver,
  onSelectStop,
  onNote,
  onProblem,
  onBackToList,
}: Props) {
  return (
    <aside
      className="day-delivery-mobile-bar day-delivery-mobile-bar--premium"
      aria-label="Actions terrain livraison"
    >
      <div className="day-delivery-mobile-bar__summary">
        <button type="button" className="day-delivery-mobile-bar__summary-btn" onClick={onSelectStop}>
          <strong>{clientLabel}</strong>
          <span>{addressLabel}</span>
          {etaLabel ? <span className="day-delivery-mobile-bar__eta">ETA {etaLabel}</span> : null}
        </button>
        {trackingUrl ? (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="day-delivery-mobile-bar__track-link"
          >
            Suivi client
          </a>
        ) : (
          <span className="day-delivery-mobile-bar__track-placeholder" title="Lien actif apres En route">
            Suivi live
          </span>
        )}
      </div>
      <div className="day-delivery-mobile-bar__grid day-delivery-mobile-bar__grid--primary">
        <button
          type="button"
          className="day-delivery-mobile-bar__btn day-delivery-mobile-bar__btn--primary"
          disabled={!canEnRoute || enRouteLoading}
          onClick={onEnRoute}
        >
          {enRouteLoading ? "Envoi..." : "En route"}
        </button>
        <button
          type="button"
          className="day-delivery-mobile-bar__btn day-delivery-mobile-bar__btn--call"
          disabled={!phone}
          onClick={onCall}
        >
          Appeler
        </button>
        <button
          type="button"
          className="day-delivery-mobile-bar__btn day-delivery-mobile-bar__btn--maps"
          disabled={!mapsUrl}
          onClick={onMaps}
        >
          Itinéraire
        </button>
        <button
          type="button"
          className="day-delivery-mobile-bar__btn day-delivery-mobile-bar__btn--success"
          disabled={!canDeliver || deliverLoading}
          title={!canDeliver && deliverDisabledReason ? deliverDisabledReason : undefined}
          onClick={onDeliver}
        >
          {deliverLoading ? "..." : deliverLabel}
        </button>
      </div>
      <div className="day-delivery-mobile-bar__grid day-delivery-mobile-bar__grid--secondary">
        <button type="button" className="day-delivery-mobile-bar__btn" onClick={onSignature}>
          Signature
        </button>
        <button type="button" className="day-delivery-mobile-bar__btn" onClick={onVoice}>
          Note vocale
        </button>
        <button type="button" className="day-delivery-mobile-bar__btn" onClick={onScrollProofs}>
          Preuve / photo
        </button>
        {onNote ? (
          <button type="button" className="day-delivery-mobile-bar__btn" onClick={onNote}>
            Note
          </button>
        ) : null}
        {onProblem ? (
          <button
            type="button"
            className="day-delivery-mobile-bar__btn day-delivery-mobile-bar__btn--danger"
            disabled={problemLoading}
            onClick={onProblem}
          >
            {problemLoading ? "..." : "Problème"}
          </button>
        ) : null}
        {onBackToList ? (
          <button
            type="button"
            className="day-delivery-mobile-bar__btn day-delivery-mobile-bar__btn--ghost"
            onClick={onBackToList}
          >
            Retour liste
          </button>
        ) : null}
      </div>
      {!canDeliver && deliverDisabledReason ? (
        <p className="day-delivery-mobile-bar__proof-hint" role="status">
          {deliverDisabledReason}
        </p>
      ) : null}
    </aside>
  );
}
