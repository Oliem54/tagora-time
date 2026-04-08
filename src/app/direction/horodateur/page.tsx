"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";

type EventType =
  | "quart_debut"
  | "pause_debut"
  | "pause_fin"
  | "sortie_depart"
  | "sortie_retour"
  | "quart_fin"
  | "anomalie";

type HorodateurEvent = {
  id: string;
  user_id: string;
  event_type: EventType;
  occurred_at: string;
  livraison_id: number | null;
  dossier_id: number | null;
  sortie_id: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
};

type PunchState = "hors_quart" | "en_quart" | "en_pause" | "en_sortie" | "termine";

type UserSummary = {
  userId: string;
  email: string;
  state: PunchState;
  lastEventAt: string | null;
  anomalies: string[];
};

function startOfTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-CA");
}

function getEventLabel(type: EventType) {
  if (type === "quart_debut") return "Debut du quart";
  if (type === "pause_debut") return "Debut pause";
  if (type === "pause_fin") return "Fin pause";
  if (type === "sortie_depart") return "Depart sortie";
  if (type === "sortie_retour") return "Retour sortie";
  if (type === "quart_fin") return "Fin du quart";
  return "Anomalie";
}

function computeSummary(userId: string, events: HorodateurEvent[]): UserSummary {
  let state: PunchState = "hors_quart";
  const anomalies: string[] = [];
  let hasQuartStart = false;
  let hasQuartEnd = false;
  let hasPauseStart = false;
  let hasPauseEnd = false;
  let hasSortieStart = false;
  let hasSortieEnd = false;

  for (const event of events) {
    if (event.event_type === "quart_debut") {
      hasQuartStart = true;
      state = "en_quart";
      continue;
    }

    if (event.event_type === "pause_debut") {
      if (state !== "en_quart") anomalies.push("Pause demarree hors quart");
      hasPauseStart = true;
      state = "en_pause";
      continue;
    }

    if (event.event_type === "pause_fin") {
      if (state !== "en_pause") anomalies.push("Fin pause sans pause active");
      hasPauseEnd = true;
      state = "en_quart";
      continue;
    }

    if (event.event_type === "sortie_depart") {
      if (state !== "en_quart") anomalies.push("Depart sortie hors quart");
      hasSortieStart = true;
      state = "en_sortie";
      continue;
    }

    if (event.event_type === "sortie_retour") {
      if (state !== "en_sortie") anomalies.push("Retour sortie sans sortie active");
      hasSortieEnd = true;
      state = "en_quart";
      continue;
    }

    if (event.event_type === "quart_fin") {
      if (state === "en_pause") anomalies.push("Fin quart pendant pause");
      if (state === "en_sortie") anomalies.push("Fin quart pendant sortie");
      hasQuartEnd = true;
      state = "termine";
      continue;
    }
  }

  if (hasQuartStart && !hasQuartEnd) anomalies.push("Quart non termine");
  if (hasPauseStart && !hasPauseEnd) anomalies.push("Pause non terminee");
  if (hasSortieStart && !hasSortieEnd) anomalies.push("Sortie non terminee");

  const last = events.length > 0 ? events[events.length - 1].occurred_at : null;
  const email = String(events[0]?.metadata?.user_email || "inconnu");

  return {
    userId,
    email,
    state,
    lastEventAt: last,
    anomalies: Array.from(new Set(anomalies)),
  };
}

export default function DirectionHorodateurPage() {
  const { loading: accessLoading, hasPermission } = useCurrentAccess();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<HorodateurEvent[]>([]);
  const [errorText, setErrorText] = useState("");

  const canUseTerrain = hasPermission("terrain");

  useEffect(() => {
    async function loadData() {
      if (accessLoading) return;
      if (!canUseTerrain) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorText("");

      const { data, error } = await supabase
        .from("horodateur_events")
        .select("id, user_id, event_type, occurred_at, livraison_id, dossier_id, sortie_id, notes, metadata")
        .gte("occurred_at", startOfTodayIso())
        .order("occurred_at", { ascending: false });

      if (error) {
        setEvents([]);
        setErrorText("Impossible de charger la supervision horodateur.");
        setLoading(false);
        return;
      }

      setEvents((data ?? []) as HorodateurEvent[]);
      setLoading(false);
    }

    void loadData();
  }, [accessLoading, canUseTerrain]);

  const groupedByUser = useMemo(() => {
    const map = new Map<string, HorodateurEvent[]>();
    for (const event of [...events].reverse()) {
      const list = map.get(event.user_id) ?? [];
      list.push(event);
      map.set(event.user_id, list);
    }
    return map;
  }, [events]);

  const summaries = useMemo(() => {
    return Array.from(groupedByUser.entries()).map(([userId, list]) =>
      computeSummary(userId, list)
    );
  }, [groupedByUser]);

  const anomaliesCount = summaries.reduce((sum, item) => sum + item.anomalies.length, 0);
  const activeSortiesCount = summaries.filter((item) => item.state === "en_sortie").length;

  if (accessLoading || loading) {
    return (
      <main className="page-container">
        <HeaderTagora title="Horodateur direction" subtitle="Supervision des pointages et anomalies" />
        <AccessNotice description="Chargement des evenements horodateur et des anomalies du jour." />
      </main>
    );
  }

  if (!canUseTerrain) {
    return (
      <main className="page-container">
        <HeaderTagora title="Horodateur direction" subtitle="Supervision des pointages et anomalies" />
        <AccessNotice description="La permission terrain est requise pour superviser les pointages horodateur." />
      </main>
    );
  }

  return (
    <main className="page-container">
      <HeaderTagora title="Horodateur direction" subtitle="Supervision des pointages et anomalies" />

      {errorText ? <AccessNotice title="Chargement limite" description={errorText} /> : null}

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Employes suivis</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: "#0f2948" }}>{summaries.length}</div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Sorties en cours</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: "#0f2948" }}>{activeSortiesCount}</div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Anomalies detectees</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: "#0f2948" }}>{anomaliesCount}</div>
          </div>
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Etat courant des employes</h2>
        {summaries.length === 0 ? (
          <p className="tagora-note">Aucun pointage enregistre aujourd hui.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>Employe</th>
                  <th style={thStyle}>Etat</th>
                  <th style={thStyle}>Dernier evenement</th>
                  <th style={thStyle}>Anomalies</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((row) => (
                  <tr key={row.userId}>
                    <td style={tdStyle}>{row.email}<div className="tagora-note">{row.userId.slice(0, 8)}...</div></td>
                    <td style={tdStyle}>{row.state}</td>
                    <td style={tdStyle}>{formatDateTime(row.lastEventAt)}</td>
                    <td style={tdStyle}>
                      {row.anomalies.length === 0
                        ? "Aucune"
                        : row.anomalies.join(" | ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Historique brut du jour</h2>
        {events.length === 0 ? (
          <p className="tagora-note">Aucun evenement horodateur aujourd hui.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>Heure</th>
                  <th style={thStyle}>Employe</th>
                  <th style={thStyle}>Evenement</th>
                  <th style={thStyle}>Contexte</th>
                  <th style={thStyle}>Note</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td style={tdStyle}>{formatDateTime(event.occurred_at)}</td>
                    <td style={tdStyle}>{String(event.metadata?.user_email || "inconnu")}</td>
                    <td style={tdStyle}>{getEventLabel(event.event_type)}</td>
                    <td style={tdStyle}>
                      {event.livraison_id ? `Livraison #${event.livraison_id}` : "-"}
                      {event.dossier_id ? ` / Dossier #${event.dossier_id}` : ""}
                      {event.sortie_id ? ` / Sortie #${event.sortie_id}` : ""}
                    </td>
                    <td style={tdStyle}>{event.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#64748b",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#0f172a",
};
