"use client";

import AppCard from "@/app/components/ui/AppCard";
import type { MonHorairePayload } from "@/app/lib/employe-mon-horaire.types";

type Props = {
  data: MonHorairePayload;
};

export default function EmployeTeamPanel({ data }: Props) {
  const byId = new Map<
    number,
    { name: string; dept: string; slots: { date: string; dayLabel: string; start: string; end: string }[] }
  >();

  for (const d of data.weekGrid) {
    for (const c of d.coworkers) {
      const prev = byId.get(c.employeeId);
      const slot = {
        date: d.date,
        dayLabel: d.weekdayLabel,
        start: c.startLocal,
        end: c.endLocal,
      };
      if (!prev) {
        byId.set(c.employeeId, {
          name: c.name?.trim() || `Employé #${c.employeeId}`,
          dept: c.departmentLabel,
          slots: [slot],
        });
      } else {
        prev.slots.push(slot);
      }
    }
  }

  const rows = [...byId.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <div className="ui-stack-lg" style={{ display: "grid", gap: 20 }}>
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "#0f172a",
          }}
        >
          Mon équipe
        </h1>
        <p className="ui-text-muted" style={{ margin: "8px 0 0", fontSize: "0.95rem" }}>
          Collègues avec un horaire qui chevauche le vôtre cette semaine (même département, emplacement ou
          compagnie).
        </p>
      </header>

      {rows.length === 0 ? (
        <AppCard tone="muted" className="rounded-2xl">
          <p style={{ margin: 0, color: "#475569" }}>
            Aucun collègue correspondant sur la semaine affichée.
          </p>
        </AppCard>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((r) => (
            <AppCard key={r.id} className="rounded-2xl" tone="muted">
              <div style={{ fontWeight: 800, color: "#0f172a" }}>{r.name}</div>
              <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 4 }}>{r.dept}</div>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#334155", fontSize: "0.9rem" }}>
                {r.slots.map((s) => (
                  <li key={`${r.name}-${s.date}-${s.start}`}>
                    {s.dayLabel} {s.date.slice(8, 10)}/{s.date.slice(5, 7)} · {s.start}–{s.end}
                  </li>
                ))}
              </ul>
            </AppCard>
          ))}
        </div>
      )}
    </div>
  );
}
