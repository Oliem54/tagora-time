"use client";

import {
  COMPENSATION_EVENT_SALE_STATE_LABELS,
  COMPENSATION_EVENT_STATUS_LABELS,
  type CompensationEventSaleState,
  type CompensationEventStatus,
} from "@/app/lib/commissions/compensation-events.shared";

export type CompensationEventFilters = {
  chauffeur_id: string;
  sale_state: CompensationEventSaleState | "";
  status: CompensationEventStatus | "";
  eligibility: "all" | "eligible" | "ineligible";
  company_context: string;
};

type CompensationEventFiltersBarProps = {
  filters: CompensationEventFilters;
  onChange: (filters: CompensationEventFilters) => void;
  onReset: () => void;
};

const SALE_STATE_OPTIONS = Object.entries(COMPENSATION_EVENT_SALE_STATE_LABELS);
const STATUS_OPTIONS = Object.entries(COMPENSATION_EVENT_STATUS_LABELS);

export function emptyCompensationEventFilters(): CompensationEventFilters {
  return {
    chauffeur_id: "",
    sale_state: "",
    status: "",
    eligibility: "all",
    company_context: "",
  };
}

export default function CompensationEventFiltersBar({
  filters,
  onChange,
  onReset,
}: CompensationEventFiltersBarProps) {
  return (
    <div className="compensation-filters-bar">
      <label className="compensation-filter-field">
        <span>Chauffeur ID</span>
        <input
          type="number"
          min={1}
          value={filters.chauffeur_id}
          onChange={(event) =>
            onChange({ ...filters, chauffeur_id: event.target.value })
          }
          placeholder="Ex. 21"
        />
      </label>

      <label className="compensation-filter-field">
        <span>Etat cycle</span>
        <select
          value={filters.sale_state}
          onChange={(event) =>
            onChange({
              ...filters,
              sale_state: event.target.value as CompensationEventSaleState | "",
            })
          }
        >
          <option value="">Tous</option>
          {SALE_STATE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="compensation-filter-field">
        <span>Statut event</span>
        <select
          value={filters.status}
          onChange={(event) =>
            onChange({
              ...filters,
              status: event.target.value as CompensationEventStatus | "",
            })
          }
        >
          <option value="">Tous</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="compensation-filter-field">
        <span>Eligibilite</span>
        <select
          value={filters.eligibility}
          onChange={(event) =>
            onChange({
              ...filters,
              eligibility: event.target.value as CompensationEventFilters["eligibility"],
            })
          }
        >
          <option value="all">Toutes</option>
          <option value="eligible">Admissibles</option>
          <option value="ineligible">Non admissibles</option>
        </select>
      </label>

      <label className="compensation-filter-field">
        <span>Compagnie</span>
        <input
          type="text"
          value={filters.company_context}
          onChange={(event) =>
            onChange({ ...filters, company_context: event.target.value })
          }
          placeholder="Phase 1 — contexte"
        />
      </label>

      <button type="button" className="tagora-dark-outline-action" onClick={onReset}>
        Reinitialiser
      </button>
    </div>
  );
}
