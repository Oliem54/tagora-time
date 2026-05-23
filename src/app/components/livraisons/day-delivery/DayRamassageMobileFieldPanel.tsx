"use client";

import StatusBadge from "@/app/components/ui/StatusBadge";
import DayRamassageMobileActions from "@/app/components/livraisons/day-delivery/DayRamassageMobileActions";

type Props = {
  clientLabel: string;
  statusLabel: string;
  statusTone: "default" | "success" | "warning" | "danger" | "info";
  addressLabel: string;
  phone: string | null;
  commandeLabel: string | null;
  factureLabel: string | null;
  mapsUrl: string | null;
  canComplete: boolean;
  completeDisabledReason: string | null;
  completeLoading: boolean;
  problemLoading?: boolean;
  onCall: () => void;
  onMaps: () => void;
  onSignature: () => void;
  onVoice: () => void;
  onScrollProofs: () => void;
  onComplete: () => void;
  onProblem?: () => void;
  onNote?: () => void;
  onBackToList: () => void;
};

/** Actions terrain ramassage en haut du détail mobile (avant sections administratives). */
export default function DayRamassageMobileFieldPanel({
  clientLabel,
  statusLabel,
  statusTone,
  addressLabel,
  phone,
  commandeLabel,
  factureLabel,
  mapsUrl,
  canComplete,
  completeDisabledReason,
  completeLoading,
  problemLoading,
  onCall,
  onMaps,
  onSignature,
  onVoice,
  onScrollProofs,
  onComplete,
  onProblem,
  onNote,
  onBackToList,
}: Props) {
  return (
    <section className="day-ramassage-mobile-field-panel" aria-label="Actions terrain ramassage">
      <div className="day-ramassage-mobile-field-panel__head">
        <div className="day-ramassage-mobile-field-panel__copy">
          <strong>{clientLabel}</strong>
          <StatusBadge label={statusLabel} tone={statusTone} />
          <span>{addressLabel}</span>
          {phone ? <span className="day-ramassage-mobile-field-panel__phone">{phone}</span> : null}
        </div>
        <button
          type="button"
          className="day-ramassage-mobile-field-panel__back"
          onClick={onBackToList}
        >
          Retour liste
        </button>
      </div>
      <DayRamassageMobileActions
        clientLabel={clientLabel}
        addressLabel={addressLabel}
        phone={phone}
        mapsUrl={mapsUrl}
        commandeLabel={commandeLabel}
        factureLabel={factureLabel}
        canComplete={canComplete}
        completeDisabledReason={completeDisabledReason}
        completeLoading={completeLoading}
        problemLoading={problemLoading}
        onCall={onCall}
        onMaps={onMaps}
        onSignature={onSignature}
        onVoice={onVoice}
        onScrollProofs={onScrollProofs}
        onComplete={onComplete}
        onSelectStop={onBackToList}
        onProblem={onProblem}
        onNote={onNote}
        onBackToList={onBackToList}
      />
    </section>
  );
}
