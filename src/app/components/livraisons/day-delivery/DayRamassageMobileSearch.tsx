"use client";

import type { RamassageStatusFilter } from "@/app/lib/livraisons/day-stop-search.shared";

const FILTERS: Array<{ id: RamassageStatusFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "todo", label: "A faire" },
  { id: "done", label: "Ramasse" },
  { id: "problem", label: "Probleme" },
];

type Props = {
  query: string;
  statusFilter: RamassageStatusFilter;
  resultCount: number;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: RamassageStatusFilter) => void;
};

export default function DayRamassageMobileSearch({
  query,
  statusFilter,
  resultCount,
  onQueryChange,
  onStatusFilterChange,
}: Props) {
  return (
    <section className="day-ramassage-mobile-search" aria-label="Recherche ramassages">
      <div className="day-ramassage-mobile-search__field-wrap">
        <input
          type="search"
          className="day-ramassage-mobile-search__input tagora-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Rechercher par client, telephone, facture, devis…"
          aria-label="Rechercher par client, telephone, facture, devis"
          enterKeyHint="search"
          autoComplete="off"
        />
        {query.trim() ? (
          <button
            type="button"
            className="day-ramassage-mobile-search__clear"
            aria-label="Vider la recherche"
            onClick={() => onQueryChange("")}
          >
            X
          </button>
        ) : null}
      </div>
      <div className="day-ramassage-mobile-search__filters" role="tablist" aria-label="Filtres statut">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={statusFilter === filter.id}
            className={`day-ramassage-mobile-search__chip${statusFilter === filter.id ? " day-ramassage-mobile-search__chip--active" : ""}`}
            onClick={() => onStatusFilterChange(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <p className="day-ramassage-mobile-search__meta" aria-live="polite">
        {resultCount} ramassage{resultCount === 1 ? "" : "s"}
        {query.trim() ? ` pour « ${query.trim()} »` : ""}
      </p>
    </section>
  );
}
