"use client";

import StatusBadge from "@/app/components/ui/StatusBadge";

export type RamassageMobileStopItem = {
  id: number;
  client: string;
  address: string;
  time: string;
  statusText: string;
  statusTone: "default" | "success" | "warning" | "danger" | "info";
  phone: string | null;
  commandeLabel: string;
  factureLabel: string;
  isOverdue: boolean;
};

type Props = {
  stops: RamassageMobileStopItem[];
  selectedId: number | null;
  emptyMessage: string;
  onSelect: (id: number) => void;
};

export default function DayRamassageMobileStopList({
  stops,
  selectedId,
  emptyMessage,
  onSelect,
}: Props) {
  if (stops.length === 0) {
    return (
      <div className="day-ramassage-mobile-list day-ramassage-mobile-list--empty" role="status">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="day-ramassage-mobile-list" role="list">
      {stops.map((stop) => (
        <button
          key={stop.id}
          type="button"
          role="listitem"
          className={`day-ramassage-mobile-list__item${selectedId === stop.id ? " day-ramassage-mobile-list__item--selected" : ""}`}
          onClick={() => onSelect(stop.id)}
        >
          <div className="day-ramassage-mobile-list__head">
            <strong>{stop.client}</strong>
            <StatusBadge label={stop.statusText} tone={stop.statusTone} />
          </div>
          <span className="day-ramassage-mobile-list__address">{stop.address || "Adresse non renseignee"}</span>
          <div className="day-ramassage-mobile-list__meta">
            {stop.time ? <span>{stop.time}</span> : null}
            {stop.phone ? <span>{stop.phone}</span> : null}
            {stop.commandeLabel ? <span>Ref. {stop.commandeLabel}</span> : null}
            {stop.factureLabel ? <span>Fact. {stop.factureLabel}</span> : null}
          </div>
          {stop.isOverdue ? (
            <span className="day-ramassage-mobile-list__overdue">En retard</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
