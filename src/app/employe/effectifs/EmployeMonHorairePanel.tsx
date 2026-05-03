"use client";

import Link from "next/link";
import { CalendarRange, Clock3, Users } from "lucide-react";
import AppCard from "@/app/components/ui/AppCard";
import type { MonHorairePayload } from "@/app/lib/employe-mon-horaire.types";
import { scheduleRequestTypeLabel } from "@/app/lib/effectifs-schedule-request.shared";

type Props = {
  data: MonHorairePayload;
};

export default function EmployeMonHorairePanel({ data }: Props) {
  const workDaysThisWeek = data.weekGrid.filter(
    (d) => d.statusKey === "work" || d.statusKey === "modified"
  ).length;

  return (
    <div className="ui-stack-lg" style={{ display: "grid", gap: 24 }}>
      {data.longLeave ? (
        <AppCard
          style={{
            borderColor: "rgba(245,158,11,0.45)",
            background: "rgba(254,243,199,0.5)",
            padding: "16px 20px",
          }}
        >
          <div style={{ fontWeight: 800, color: "#92400e", marginBottom: 8 }}>
            Congé prolongé
          </div>
          <p style={{ margin: 0, color: "#0f172a", lineHeight: 1.5 }}>
            Vous êtes actuellement en congé prolongé ({data.longLeave.publicLabel}
            {data.longLeave.startDate ? ` — depuis le ${formatFrDate(data.longLeave.startDate)}` : ""}
            ).
            <br />
            Retour prévu :{" "}
            {data.longLeave.returnSummary === "indéterminé"
              ? "indéterminé"
              : formatFrDate(data.longLeave.returnSummary)}
            .
          </p>
        </AppCard>
      ) : null}

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
          Mon horaire
        </h1>
        <p className="ui-text-muted" style={{ margin: "8px 0 0", fontSize: "0.95rem" }}>
          {data.employeeName?.trim() || "Employé"} · {data.companyLabel}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        <QuickCard
          title="Aujourd'hui"
          body={formatDaySummary(data.today)}
          tone="slate"
        />
        <QuickCard
          title="Demain"
          body={formatDaySummary(data.tomorrow)}
          tone="slate"
        />
        <QuickCard
          title="Cette semaine"
          body={`${workDaysThisWeek} jour${workDaysThisWeek > 1 ? "s" : ""} planifié${workDaysThisWeek > 1 ? "s" : ""}`}
          tone="emerald"
        />
        <QuickCard
          title="Prochain quart"
          body={
            data.nextShift
              ? `${data.nextShift.weekdayLabel} · ${data.nextShift.startLocal} – ${data.nextShift.endLocal}`
              : "Aucun quart prévu"
          }
          tone="blue"
        />
        <QuickCard
          title="Demandes en attente"
          body={
            data.pendingCount > 0
              ? `${data.pendingCount} demande${data.pendingCount > 1 ? "s" : ""}`
              : "Aucune"
          }
          tone={data.pendingCount > 0 ? "amber" : "slate"}
        />
      </div>

      <section className="ui-stack-md">
        <h2
          style={{
            margin: 0,
            fontSize: "1.1rem",
            fontWeight: 800,
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <CalendarRange size={20} aria-hidden />
          Ma semaine
        </h2>
        <div
          style={{
            display: "grid",
            gap: 10,
          }}
        >
          {data.weekGrid.map((d) => (
            <AppCard key={d.date} className="rounded-2xl" tone="muted">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {d.weekdayLabel}{" "}
                    <span className="ui-text-muted" style={{ fontWeight: 600 }}>
                      {d.date}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: "0.95rem", color: "#334155" }}>
                    {d.statusKey === "work" || d.statusKey === "modified" ? (
                      <>
                        {d.startLocal} – {d.endLocal} · {d.departmentLabel} · {d.locationLabel}
                      </>
                    ) : (
                      <span>{d.statusLabel}</span>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: "0.82rem",
                      color: "#64748b",
                    }}
                  >
                    {d.companyLabel} · {d.statusLabel}
                  </div>
                  {d.note ? (
                    <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#475569" }}>
                      {d.note}
                    </p>
                  ) : null}
                </div>
              </div>
              {d.coworkers.length > 0 ? (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: "1px solid rgba(148,163,184,0.35)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Users size={14} aria-hidden />
                    Avec vous
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: "#334155", fontSize: "0.9rem" }}>
                    {d.coworkers.map((c) => (
                      <li key={c.employeeId}>
                        {c.name?.trim() || `Employé #${c.employeeId}`} · {c.startLocal}–
                        {c.endLocal} · {c.departmentLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : d.statusKey === "work" || d.statusKey === "modified" ? (
                <p
                  className="ui-text-muted"
                  style={{ margin: "12px 0 0", fontSize: "0.85rem" }}
                >
                  Aucun autre employé planifié sur cette plage.
                </p>
              ) : null}
            </AppCard>
          ))}
        </div>
      </section>

      <section className="ui-stack-md">
        <h2
          style={{
            margin: 0,
            fontSize: "1.1rem",
            fontWeight: 800,
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Clock3 size={20} aria-hidden />
          Mes demandes
        </h2>
        <AppCard className="rounded-2xl ui-stack-sm" tone="muted">
          <div style={{ display: "grid", gap: 8, fontSize: "0.9rem", color: "#334155" }}>
            <div>
              <strong>En attente :</strong> {data.pendingRequests.length}
            </div>
            <div>
              <strong>Approuvées :</strong> {data.approvedRequests.length}
            </div>
            <div>
              <strong>Refusées :</strong> {data.rejectedRequests.length}
            </div>
            {data.nextVacation ? (
              <div>
                <strong>Prochaines vacances :</strong>{" "}
                {scheduleRequestTypeLabel(data.nextVacation.requestType)} (
                {(data.nextVacation.requestedStartDate ?? data.nextVacation.requestedDate) ?? "—"})
              </div>
            ) : (
              <div>
                <strong>Prochaines vacances :</strong> —
              </div>
            )}
            {data.nextDayOff && data.nextDayOff.requestType !== "vacation" ? (
              <div>
                <strong>Prochain congé :</strong>{" "}
                {scheduleRequestTypeLabel(data.nextDayOff.requestType)}
              </div>
            ) : null}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link
              href="/employe/effectifs/demandes"
              className="tagora-dark-action"
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "center",
                textDecoration: "none",
                minHeight: 44,
                alignItems: "center",
                borderRadius: 12,
              }}
            >
              Faire une demande
            </Link>
          </div>
        </AppCard>
      </section>
    </div>
  );
}

function formatFrDate(iso: string) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDaySummary(d: MonHorairePayload["today"]) {
  if (!d) return "—";
  if (d.statusKey === "long_leave") {
    return "Congé prolongé";
  }
  if (d.statusKey === "work" || d.statusKey === "modified") {
    return `${d.startLocal} – ${d.endLocal}\n${d.departmentLabel}\n${d.locationLabel}\n${d.companyLabel}`;
  }
  return d.statusLabel;
}

function QuickCard({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "slate" | "emerald" | "blue" | "amber";
}) {
  const border =
    tone === "emerald"
      ? "rgba(16,185,129,0.25)"
      : tone === "blue"
        ? "rgba(59,130,246,0.25)"
        : tone === "amber"
          ? "rgba(245,158,11,0.35)"
          : "rgba(148,163,184,0.35)";
  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${border}`,
        background: "#fff",
        padding: "14px 16px",
        minHeight: 100,
      }}
    >
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: "0.88rem",
          fontWeight: 700,
          color: "#0f172a",
          whiteSpace: "pre-line",
          lineHeight: 1.45,
        }}
      >
        {body}
      </div>
    </div>
  );
}
