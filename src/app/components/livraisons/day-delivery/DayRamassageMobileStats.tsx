"use client";

export type RamassageMobileStats = {
  total: number;
  todo: number;
  done: number;
  problem: number;
  overdue: number;
};

type Props = {
  stats: RamassageMobileStats;
};

const ITEMS: Array<{
  key: keyof RamassageMobileStats;
  label: string;
  tone: "default" | "todo" | "done" | "problem" | "overdue";
}> = [
  { key: "total", label: "Total", tone: "default" },
  { key: "todo", label: "À faire", tone: "todo" },
  { key: "done", label: "Ramassés", tone: "done" },
  { key: "problem", label: "Problème", tone: "problem" },
  { key: "overdue", label: "Retard", tone: "overdue" },
];

export default function DayRamassageMobileStats({ stats }: Props) {
  return (
    <section className="day-ramassage-mobile-stats" aria-label="Indicateurs ramassage du jour">
      {ITEMS.map((item) => (
        <article
          key={item.key}
          className={`day-ramassage-mobile-stats__card day-ramassage-mobile-stats__card--${item.tone}`}
        >
          <strong className="day-ramassage-mobile-stats__value">{stats[item.key]}</strong>
          <span className="day-ramassage-mobile-stats__label">{item.label}</span>
        </article>
      ))}
    </section>
  );
}
