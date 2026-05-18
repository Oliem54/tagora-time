"use client";

import StatusBadge from "@/app/components/ui/StatusBadge";

export type OperationsMobileStopItem = {
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
  stops: OperationsMobileStopItem[];
  selectedId: number | null;
  emptyMessage: string;
  onSelect: (id: number) => void;
};

export default function DayOperationsMobileStopList({
  stops,
  selectedId,
  emptyMessage,
  onSelect,
}: Props) {
  if (stops.length === 0) {
    return (
      <div className="day-ops-mobile-stop-list day-ops-mobile-stop-list--empty" role="status">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="day-ops-mobile-stop-list" role="list">
      {stops.map((stop) => (
        <button
          key={stop.id}
          type="button"
          role="listitem"
          className={`day-ops-mobile-stop-list__item${selectedId === stop.id ? " day-ops-mobile-stop-list__item--selected" : ""}`}
          onClick={() => onSelect(stop.id)}
        >
          <div className="day-ops-mobile-stop-list__head">
            <strong>{stop.client}</strong>
            <StatusBadge label={stop.statusText} tone={stop.statusTone} />
          </div>
          <span className="day-ops-mobile-stop-list__address">
            {stop.address || "Adresse non renseignee"}
          </span>
          <div className="day-ops-mobile-stop-list__meta">
            {stop.time ? <span>{stop.time}</span> : null}
            {stop.phone ? <span>{stop.phone}</span> : null}
            {stop.commandeLabel ? <span>Ref. {stop.commandeLabel}</span> : null}
            {stop.factureLabel ? <span>Fact. {stop.factureLabel}</span> : null}
          </div>
          {stop.isOverdue ? <span className="day-ops-mobile-stop-list__overdue">En retard</span> : null}
        </button>
      ))}
    </div>
  );
}
