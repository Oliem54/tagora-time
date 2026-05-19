"use client";

import StatusBadge from "@/app/components/ui/StatusBadge";
import DayDeliveryMobileActions from "@/app/components/livraisons/day-delivery/DayDeliveryMobileActions";

type Props = {
  clientLabel: string;
  statusLabel: string;
  statusTone: "default" | "success" | "warning" | "danger" | "info";
  addressLabel: string;
  etaLabel: string | null;
  phone: string | null;
  mapsUrl: string | null;
  trackingUrl: string | null;
  canEnRoute: boolean;
  canDeliver: boolean;
  deliverDisabledReason: string | null;
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
  onNote?: () => void;
  onProblem?: () => void;
  onBackToList: () => void;
};

/** Actions terrain livraison en haut du détail mobile (avant sections administratives). */
export default function DayLivraisonMobileFieldPanel({
  clientLabel,
  statusLabel,
  statusTone,
  addressLabel,
  etaLabel,
  phone,
  mapsUrl,
  trackingUrl,
  canEnRoute,
  canDeliver,
  deliverDisabledReason,
  enRouteLoading,
  deliverLoading,
  problemLoading,
  onEnRoute,
  onCall,
  onMaps,
  onSignature,
  onVoice,
  onScrollProofs,
  onDeliver,
  onNote,
  onProblem,
  onBackToList,
}: Props) {
  return (
    <section className="day-livraison-mobile-field-panel" aria-label="Actions terrain livraison">
      <div className="day-livraison-mobile-field-panel__head">
        <div className="day-livraison-mobile-field-panel__copy">
          <strong>{clientLabel}</strong>
          <StatusBadge label={statusLabel} tone={statusTone} />
          <span>{addressLabel}</span>
          {etaLabel ? <span className="day-livraison-mobile-field-panel__eta">ETA {etaLabel}</span> : null}
          {phone ? <span className="day-livraison-mobile-field-panel__phone">{phone}</span> : null}
        </div>
        <button type="button" className="day-livraison-mobile-field-panel__back" onClick={onBackToList}>
          Retour liste
        </button>
      </div>
      <DayDeliveryMobileActions
        clientLabel={clientLabel}
        addressLabel={addressLabel}
        etaLabel={etaLabel}
        phone={phone}
        mapsUrl={mapsUrl}
        trackingUrl={trackingUrl}
        canEnRoute={canEnRoute}
        canDeliver={canDeliver}
        deliverDisabledReason={deliverDisabledReason}
        enRouteLoading={enRouteLoading}
        deliverLoading={deliverLoading}
        problemLoading={problemLoading}
        onEnRoute={onEnRoute}
        onCall={onCall}
        onMaps={onMaps}
        onSignature={onSignature}
        onVoice={onVoice}
        onScrollProofs={onScrollProofs}
        onDeliver={onDeliver}
        onSelectStop={onBackToList}
        onNote={onNote}
        onProblem={onProblem}
        onBackToList={onBackToList}
      />
    </section>
  );
}
