"use client";

import Link from "next/link";
import {
  formatTodayOperationCount,
  formatTodayOperationCountShort,
} from "@/app/lib/livraisons/today-operations.shared";

type Props = {
  mode: "livraison" | "ramassage";
  todayIso: string;
  count: number;
  dayHref: string;
};

export default function MobileTodayOperationsEntry({ mode, todayIso, count, dayHref }: Props) {
  const isLivraison = mode === "livraison";
  const hasToday = count > 0;
  const title = isLivraison ? "Livraisons du jour" : "Ramassages du jour";
  const emptyMessage = isLivraison
    ? "Aucune livraison planifiee aujourd'hui"
    : "Aucun ramassage planifie aujourd'hui";
  const countLabel = formatTodayOperationCount(mode, count);
  const countShort = formatTodayOperationCountShort(mode, count);

  return (
    <section
      className={`livraison-today-entry livraison-today-entry--${mode}${hasToday ? " livraison-today-entry--active" : ""}`}
      aria-label={isLivraison ? "Acces rapide livraisons du jour" : "Acces rapide ramassages du jour"}
    >
      <div className="livraison-today-entry__head">
        <p className="livraison-today-entry__eyebrow">Aujourd&apos;hui</p>
        <h2 className="livraison-today-entry__title">{title}</h2>
        <p className="livraison-today-entry__date">{todayIso}</p>
      </div>

      {hasToday ? (
        <>
          <p className="livraison-today-entry__count" aria-live="polite">
            <span className="livraison-today-entry__count-full">{countLabel}</span>
            <span className="livraison-today-entry__count-short">{countShort}</span>
            <span className="livraison-today-entry__count-suffix">planifie(s)</span>
          </p>
          <Link href={dayHref} className="livraison-today-entry__cta">
            Ouvrir la journee active
          </Link>
        </>
      ) : (
        <>
          <p className="livraison-today-entry__empty" role="status">
            {emptyMessage}
          </p>
          <p className="livraison-today-entry__hint">
            Utilisez Creer, Liste ou Calendrier pour planifier une operation.
          </p>
        </>
      )}
    </section>
  );
}
