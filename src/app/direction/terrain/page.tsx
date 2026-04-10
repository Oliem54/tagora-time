"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import {
  formatDurationMinutes,
  formatTerrainDateTime,
  getTerrainStatusLabel,
  getTerrainStatusStyle,
  isSameIsoDay,
  minutesBetween,
  normalizeCompanyValue,
  normalizeTerrainGpsStatus,
  toFiniteNumber,
  type TerrainGpsStatus,
} from "@/app/lib/terrain-gps";

type GpsPosition = {
  id: string;
  source_kind: string | null;
  source_label: string | null;
  user_id: string | null;
  chauffeur_id: string | number | null;
  company_context: AccountRequestCompany | null;
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  gps_status: string | null;
  activity_label: string | null;
  recorded_at: string | null;
  sortie_id: number | null;
  livraison_id: number | null;
  horodateur_event_id: string | null;
  intervention_label: string | null;
  metadata: Record<string, unknown> | null;
};

type PositionSummary = {
  key: string;
  label: string;
  company: AccountRequestCompany | null;
  status: TerrainGpsStatus;
  latest: GpsPosition | null;
  positions: GpsPosition[];
  stopMinutes: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeGps(row: Record<string, unknown>): GpsPosition {
  return {
    id: String(row.id ?? ""),
    source_kind: typeof row.source_kind === "string" ? row.source_kind : null,
    source_label: typeof row.source_label === "string" ? row.source_label : null,
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    chauffeur_id:
      typeof row.chauffeur_id === "string" || typeof row.chauffeur_id === "number"
        ? row.chauffeur_id
        : null,
    company_context: normalizeCompanyValue(row.company_context),
    latitude: row.latitude == null ? null : toFiniteNumber(row.latitude),
    longitude: row.longitude == null ? null : toFiniteNumber(row.longitude),
    speed_kmh: row.speed_kmh == null ? null : toFiniteNumber(row.speed_kmh),
    gps_status: typeof row.gps_status === "string" ? row.gps_status : null,
    activity_label: typeof row.activity_label === "string" ? row.activity_label : null,
    recorded_at: typeof row.recorded_at === "string" ? row.recorded_at : null,
    sortie_id: typeof row.sortie_id === "number" ? row.sortie_id : null,
    livraison_id: typeof row.livraison_id === "number" ? row.livraison_id : null,
    horodateur_event_id:
      typeof row.horodateur_event_id === "string" ? row.horodateur_event_id : null,
    intervention_label:
      typeof row.intervention_label === "string" ? row.intervention_label : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

function buildLabel(position: GpsPosition, chauffeurs: Map<string, string>) {
  return (
    (position.chauffeur_id ? chauffeurs.get(String(position.chauffeur_id)) : null) ||
    (typeof position.metadata?.employee_name === "string"
      ? position.metadata.employee_name
      : null) ||
    (typeof position.metadata?.user_email === "string"
      ? position.metadata.user_email
      : null) ||
    (position.user_id ? `Employe ${position.user_id.slice(0, 8)}` : "Employe non defini")
  );
}

export default function DirectionTerrainPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dataSourceNotice, setDataSourceNotice] = useState("");
  const [gpsPositions, setGpsPositions] = useState<GpsPosition[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Map<string, string>>(new Map());
  const [sorties, setSorties] = useState<Map<number, Record<string, unknown>>>(new Map());
  const [livraisons, setLivraisons] = useState<Map<number, Record<string, unknown>>>(new Map());
  const [pointages, setPointages] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState<AccountRequestCompany | "">("");
  const [dateFilter, setDateFilter] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<TerrainGpsStatus | "">("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setDataSourceNotice("");
    const [gpsRes, chauffeursRes, sortiesRes, livraisonsRes, pointagesRes] =
      await Promise.allSettled([
        supabase.from("direction_terrain_positions").select("id, source_kind, source_label, user_id, chauffeur_id, company_context, latitude, longitude, speed_kmh, gps_status, activity_label, recorded_at, sortie_id, livraison_id, horodateur_event_id, intervention_label, metadata").order("recorded_at", { ascending: false }).limit(2500),
        supabase.from("chauffeurs").select("id, nom").order("id", { ascending: true }),
        supabase.from("sorties_terrain").select("id, date_sortie, temps_total, company_context").order("date_sortie", { ascending: false }).limit(400),
        supabase.from("livraisons_planifiees").select("id, date_livraison, statut, company_context").order("date_livraison", { ascending: false }).limit(400),
        supabase.from("horodateur_events").select("id, event_type, occurred_at, company_context").order("occurred_at", { ascending: false }).limit(600),
      ]);

    if (gpsRes.status !== "fulfilled" || gpsRes.value.error) {
      const fallbackRes = await supabase.from("gps_positions").select("id, user_id, chauffeur_id, company_context, latitude, longitude, speed_kmh, gps_status, activity_label, recorded_at, sortie_id, livraison_id, horodateur_event_id, intervention_label, metadata").order("recorded_at", { ascending: false }).limit(2500);

      if (fallbackRes.error) {
        setGpsPositions([]);
        setErrorMessage("Le cockpit terrain ne trouve ni la vue direction_terrain_positions ni la table gps_positions. Appliquez le SQL de validation finale.");
      } else {
        setGpsPositions((fallbackRes.data ?? []).map((row) => normalizeGps({ ...(row as Record<string, unknown>), source_kind: "gps", source_label: "Flux GPS natif" })));
        setDataSourceNotice("Le cockpit lit uniquement gps_positions. Appliquez le SQL de compatibilite pour afficher aussi les sorties terrain et pointages dans la timeline.");
      }
    } else {
      const normalized = (gpsRes.value.data ?? []).map((row) => normalizeGps(row as Record<string, unknown>));
      setGpsPositions(normalized);

      const hasNativeGps = normalized.some((item) => item.source_kind === "gps");
      const hasCompatibilityRows = normalized.some((item) => item.source_kind !== "gps");

      if (hasNativeGps && hasCompatibilityRows) {
        setDataSourceNotice("Cockpit alimente par le flux GPS natif et par les evenements terrain de compatibilite.");
      } else if (hasCompatibilityRows && !hasNativeGps) {
        setDataSourceNotice("Aucun flux GPS natif n a ete detecte dans le repo. Le cockpit affiche les donnees terrain reelles derivees des sorties et pointages.");
      }
    }

    setChauffeurs(chauffeursRes.status !== "fulfilled" || chauffeursRes.value.error ? new Map() : new Map((chauffeursRes.value.data ?? []).map((row) => [String((row as Record<string, unknown>).id), String((row as Record<string, unknown>).nom ?? `#${String((row as Record<string, unknown>).id)}`)])));
    setSorties(sortiesRes.status !== "fulfilled" || sortiesRes.value.error ? new Map() : new Map((sortiesRes.value.data ?? []).map((row) => [Number((row as Record<string, unknown>).id), row as Record<string, unknown>])));
    setLivraisons(livraisonsRes.status !== "fulfilled" || livraisonsRes.value.error ? new Map() : new Map((livraisonsRes.value.data ?? []).map((row) => [Number((row as Record<string, unknown>).id), row as Record<string, unknown>])));
    setPointages(pointagesRes.status !== "fulfilled" || pointagesRes.value.error ? new Map() : new Map((pointagesRes.value.data ?? []).map((row) => [String((row as Record<string, unknown>).id), row as Record<string, unknown>])));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !user || blocked) return;
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timeout);
  }, [accessLoading, blocked, loadData, user]);

  const summaries = useMemo(() => {
    const groups = new Map<string, GpsPosition[]>();
    gpsPositions.filter((item) => isSameIsoDay(item.recorded_at, dateFilter)).forEach((item) => {
      const key = String(item.user_id ?? item.chauffeur_id ?? "");
      if (!key) return;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });

    return [...groups.entries()].map(([key, positions]) => {
      const ordered = [...positions].sort((a, b) => (b.recorded_at ?? "").localeCompare(a.recorded_at ?? ""));
      const latest = ordered[0] ?? null;
      const status = latest ? normalizeTerrainGpsStatus(latest) : "inactif";
      const lastMove = ordered.find((item) => normalizeTerrainGpsStatus(item) === "deplacement" || toFiniteNumber(item.speed_kmh) >= 5)?.recorded_at ?? latest?.recorded_at ?? null;
      return {
        key,
        label: latest ? buildLabel(latest, chauffeurs) : key,
        company: latest?.company_context ?? null,
        status,
        latest,
        positions: [...positions].sort((a, b) => (a.recorded_at ?? "").localeCompare(b.recorded_at ?? "")),
        stopMinutes: latest?.recorded_at ? minutesBetween(lastMove, latest.recorded_at) : 0,
      } satisfies PositionSummary;
    }).filter((item) => (!employeeFilter || item.key === employeeFilter) && (!companyFilter || item.company === companyFilter) && (!statusFilter || item.status === statusFilter)).sort((a, b) => (b.latest?.recorded_at ?? "").localeCompare(a.latest?.recorded_at ?? ""));
  }, [gpsPositions, dateFilter, chauffeurs, employeeFilter, companyFilter, statusFilter]);

  const effectiveSelectedEmployee =
    selectedEmployee && summaries.some((item) => item.key === selectedEmployee)
      ? selectedEmployee
      : summaries[0]?.key ?? "";

  const selected =
    summaries.find((item) => item.key === effectiveSelectedEmployee) ?? null;
  const indicators = {
    active: summaries.filter((item) => item.status === "actif" || item.status === "deplacement").length,
    moving: summaries.filter((item) => item.status === "deplacement").length,
    stopped: summaries.filter((item) => item.status === "arret").length,
    arrived: summaries.filter((item) => item.status === "arrive").length,
    stale: summaries.filter((item) => item.stopMinutes >= 30 || item.status === "inactif").length,
  };

  if (accessLoading || (!blocked && loading)) return <div className="page-container"><HeaderTagora title="Terrain direction" subtitle="Cockpit GPS exploitable par la direction" /><AccessNotice description="Chargement des positions GPS, sorties, livraisons et pointages." /></div>;
  if (!user) {
    router.push("/direction/login");
    return null;
  }
  if (blocked) return <div className="page-container"><HeaderTagora title="Terrain direction" subtitle="Cockpit GPS exploitable par la direction" /><AccessNotice description="La permission terrain n est pas active sur ce compte direction." /></div>;

  return (
    <div className="page-container">
      <HeaderTagora title="Terrain direction" subtitle="Cockpit GPS exploitable par la direction" />
      {errorMessage ? <div style={{ marginTop: 24 }}><AccessNotice title="Chargement limite" description={errorMessage} /></div> : null}
      {dataSourceNotice ? <div style={{ marginTop: errorMessage ? 18 : 24 }}><AccessNotice title="Source terrain" description={dataSourceNotice} /></div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginTop: 24 }}><Card label="Employes suivis" value={String(summaries.length)} /><Card label="Actifs maintenant" value={String(indicators.active)} /><Card label="En deplacement" value={String(indicators.moving)} /><Card label="A l arret" value={String(indicators.stopped)} /><Card label="Arrives" value={String(indicators.arrived)} /><Card label="Sans mouvement" value={String(indicators.stale)} /></div>
      <div className="tagora-panel" style={{ marginTop: 24 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, alignItems: "end" }}><label className="tagora-field"><span className="tagora-label">Employe</span><select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="tagora-input"><option value="">Tous les employes</option>{summaries.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label className="tagora-field"><span className="tagora-label">Compagnie</span><select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value as AccountRequestCompany | "")} className="tagora-input"><option value="">Toutes les compagnies</option>{ACCOUNT_REQUEST_COMPANIES.map((company) => <option key={company.value} value={company.value}>{company.label}</option>)}</select></label><label className="tagora-field"><span className="tagora-label">Date</span><input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="tagora-input" /></label><label className="tagora-field"><span className="tagora-label">Statut</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TerrainGpsStatus | "")} className="tagora-input"><option value="">Tous les statuts</option><option value="actif">Actif</option><option value="deplacement">Deplacement</option><option value="arret">Arret</option><option value="arrive">Arrive a destination</option><option value="inactif">Sans mouvement</option></select></label><div className="actions-row" style={{ justifyContent: "flex-end" }}><button className="tagora-dark-outline-action" onClick={() => void loadData()}>Actualiser</button></div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.9fr) minmax(0, 1.7fr)", gap: 24, marginTop: 24, alignItems: "start" }}>
        <section className="tagora-panel"><h2 className="section-title" style={{ marginBottom: 12 }}>Vue live</h2><div style={{ display: "grid", gap: 12 }}>{summaries.length === 0 ? <p className="tagora-note">Aucun evenement terrain exploitable sur la date selectionnee.</p> : summaries.map((item) => <button key={item.key} type="button" onClick={() => setSelectedEmployee(item.key)} className="tagora-panel-muted" style={{ textAlign: "left", cursor: "pointer", border: item.key === effectiveSelectedEmployee ? "2px solid #1d4ed8" : "1px solid #e2e8f0" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><div style={{ fontSize: 18, fontWeight: 800, color: "#17376b" }}>{item.label}</div><div className="tagora-note">{item.company ? getCompanyLabel(item.company) : "Compagnie non definie"}</div><div className="tagora-note">Derniere position: {formatTerrainDateTime(item.latest?.recorded_at)}</div></div><span style={{ ...getTerrainStatusStyle(item.status), borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>{getTerrainStatusLabel(item.status)}</span></div><div className="tagora-note" style={{ marginTop: 10 }}>Positions du jour: {item.positions.length} / Temps d arret: {formatDurationMinutes(item.stopMinutes)}</div></button>)}</div></section>
        <section className="tagora-panel"><h2 className="section-title" style={{ marginBottom: 12 }}>Historique exploitable</h2>{!selected ? <p className="tagora-note">Selectionnez un employe pour afficher la timeline.</p> : <><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 18 }}><Card label="Positions du jour" value={String(selected.positions.length)} /><Card label="Heure de depart" value={formatTerrainDateTime(selected.positions[0]?.recorded_at ?? null)} /><Card label="Heure d arrivee" value={formatTerrainDateTime(selected.positions[selected.positions.length - 1]?.recorded_at ?? null)} /><Card label="Temps d arret" value={formatDurationMinutes(selected.stopMinutes)} /></div><div style={{ display: "grid", gap: 12 }}>{selected.positions.map((position) => { const status = normalizeTerrainGpsStatus(position); const sortie = position.sortie_id ? sorties.get(position.sortie_id) : null; const livraison = position.livraison_id ? livraisons.get(position.livraison_id) : null; const pointage = position.horodateur_event_id ? pointages.get(position.horodateur_event_id) : null; return <div key={position.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", background: "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong style={{ color: "#17376b" }}>{formatTerrainDateTime(position.recorded_at)}</strong><span style={{ ...getTerrainStatusStyle(status), borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{getTerrainStatusLabel(status)}</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}><Mini label="Source" value={position.source_label || position.source_kind || "-"} /><Mini label="Latitude / Longitude" value={position.latitude != null && position.longitude != null ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : "-"} /><Mini label="Vitesse" value={`${toFiniteNumber(position.speed_kmh).toFixed(1)} km/h`} /><Mini label="Activite" value={position.activity_label || "-"} /><Mini label="Intervention" value={position.intervention_label || "-"} /></div><div className="tagora-note" style={{ marginTop: 10 }}>Sortie terrain: {sortie ? `#${String(sortie.id)} - ${String(sortie.date_sortie ?? "-")}` : position.sortie_id ? `#${position.sortie_id}` : "-"}</div><div className="tagora-note">Livraison: {livraison ? `#${String(livraison.id)} - ${String(livraison.statut ?? "-")}` : position.livraison_id ? `#${position.livraison_id}` : "-"}</div><div className="tagora-note">Pointage: {pointage ? `${String(pointage.event_type ?? "-")} - ${formatTerrainDateTime(String(pointage.occurred_at ?? ""))}` : position.horodateur_event_id || "-"}</div></div>; })}</div></>}</section>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}><Link href="/direction/sorties-terrain" className="tagora-panel-muted" style={{ textDecoration: "none" }}><strong style={{ color: "#17376b" }}>Sorties terrain</strong><p className="tagora-note" style={{ marginTop: 8 }}>Corriger les sorties et les trajets rattaches.</p></Link><Link href="/direction/livraisons" className="tagora-panel-muted" style={{ textDecoration: "none" }}><strong style={{ color: "#17376b" }}>Livraisons</strong><p className="tagora-note" style={{ marginTop: 8 }}>Verifier les livraisons reliees aux positions.</p></Link><Link href="/direction/horodateur" className="tagora-panel-muted" style={{ textDecoration: "none" }}><strong style={{ color: "#17376b" }}>Horodateur</strong><p className="tagora-note" style={{ marginTop: 8 }}>Croiser GPS et pointages.</p></Link><Link href="/direction/temps-titan" className="tagora-panel-muted" style={{ textDecoration: "none" }}><strong style={{ color: "#17376b" }}>Temps Titan</strong><p className="tagora-note" style={{ marginTop: 8 }}>Verifier la ventilation compagnie et la paie terrain.</p></Link></div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="tagora-panel" style={{ margin: 0 }}><div className="tagora-label">{label}</div><div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{value}</div></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", background: "#f8fafc" }}><span className="tagora-label">{label}</span><span style={{ fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{value}</span></div>;
}
