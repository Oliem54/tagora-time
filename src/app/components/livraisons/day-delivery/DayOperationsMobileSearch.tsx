"use client";

import type { RamassageStatusFilter } from "@/app/lib/livraisons/day-stop-search.shared";

const RAMASSAGE_FILTERS: Array<{ id: RamassageStatusFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "todo", label: "À faire" },
  { id: "done", label: "Ramasse" },
  { id: "problem", label: "Probleme" },
];

const COPY = {
  livraison: {
    aria: "Recherche livraisons",
    label: "Recherche rapide",
    placeholder: "Rechercher client, facture, BL, adresse…",
    empty: "Aucune livraison trouvée",
    unit: "livraison",
    unitPlural: "livraisons",
  },
  ramassage: {
    aria: "Recherche ramassages",
    label: "Recherche rapide",
    placeholder: "Rechercher client, facture, BL, téléphone, adresse…",
    empty: "Aucun ramassage trouvé",
    unit: "ramassage",
    unitPlural: "ramassages",
  },
} as const;

type Props = {
  mode: "livraison" | "ramassage";
  query: string;
  resultCount: number;
  onQueryChange: (value: string) => void;
  statusFilter?: RamassageStatusFilter;
  onStatusFilterChange?: (value: RamassageStatusFilter) => void;
};

export default function DayOperationsMobileSearch({
  mode,
  query,
  resultCount,
  onQueryChange,
  statusFilter = "all",
  onStatusFilterChange,
}: Props) {
  const copy = COPY[mode];
  const trimmedQuery = query.trim();
  const showNoResults = Boolean(trimmedQuery) && resultCount === 0;

  return (
    <section
      className={`day-ops-mobile-search day-ops-mobile-search--${mode}`}
      aria-label={copy.aria}
    >
      <p className="day-ops-mobile-search__label">{copy.label}</p>
      <div className="day-ops-mobile-search__field-wrap">
        <input
          type="search"
          className="day-ops-mobile-search__input tagora-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          enterKeyHint="search"
          autoComplete="off"
          inputMode="search"
        />
        {trimmedQuery ? (
          <button
            type="button"
            className="day-ops-mobile-search__clear"
            aria-label="Effacer la recherche"
            onClick={() => onQueryChange("")}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
      {mode === "ramassage" && onStatusFilterChange ? (
        <div className="day-ops-mobile-search__filters" role="tablist" aria-label="Filtres statut">
          {RAMASSAGE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === filter.id}
              className={`day-ops-mobile-search__chip${statusFilter === filter.id ? " day-ops-mobile-search__chip--active" : ""}`}
              onClick={() => onStatusFilterChange(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}
      {showNoResults ? (
        <p className="day-ops-mobile-search__empty" role="status">
          {copy.empty}
        </p>
      ) : (
        <p className="day-ops-mobile-search__meta" aria-live="polite">
          {resultCount} {resultCount === 1 ? copy.unit : copy.unitPlural}
          {trimmedQuery ? ` pour « ${trimmedQuery} »` : ""}
        </p>
      )}
    </section>
  );
}
