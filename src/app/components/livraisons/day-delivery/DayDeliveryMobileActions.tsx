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
  enRouteLoading: boolean;
  deliverLoading: boolean;
  onEnRoute: () => void;
  onCall: () => void;
  onMaps: () => void;
  onSignature: () => void;
  onDeliver: () => void;
  onScrollProofs: () => void;
  onSelectStop: () => void;
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
  enRouteLoading,
  deliverLoading,
  onEnRoute,
  onCall,
  onMaps,
  onSignature,
  onDeliver,
  onScrollProofs,
  onSelectStop,
}: Props) {
  return (
    <aside className="day-delivery-mobile-bar" aria-label="Actions terrain livraison">
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
      <div className="day-delivery-mobile-bar__grid">
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
          className="day-delivery-mobile-bar__btn"
          disabled={!phone}
          onClick={onCall}
        >
          Appeler
        </button>
        <button
          type="button"
          className="day-delivery-mobile-bar__btn"
          disabled={!mapsUrl}
          onClick={onMaps}
        >
          Maps
        </button>
        <button type="button" className="day-delivery-mobile-bar__btn" onClick={onSignature}>
          Signature
        </button>
        <button type="button" className="day-delivery-mobile-bar__btn" onClick={onScrollProofs}>
          Preuves
        </button>
        <button
          type="button"
          className="day-delivery-mobile-bar__btn day-delivery-mobile-bar__btn--success"
          disabled={!canDeliver || deliverLoading}
          onClick={onDeliver}
        >
          {deliverLoading ? "..." : "Livre"}
        </button>
      </div>
    </aside>
  );
}
