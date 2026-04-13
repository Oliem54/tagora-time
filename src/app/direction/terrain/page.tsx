"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import {
  DELIVERY_TRACKING_REFRESH_MS,
  getDeliveryTrackingMapUrl,
} from "@/app/lib/delivery-tracking";
import {
  formatDurationMinutes,
  formatTerrainDateTime,
  getTerrainStatusStyle,
  getTerrainStatusLabel,
  isSameIsoDay,
  minutesBetween,
  normalizeCompanyValue,
  normalizeTerrainGpsStatus,
  toFiniteNumber,
  type TerrainGpsStatus,
} from "@/app/lib/terrain-gps";
import {
  buildLatestGpsBaseStatus,
  getGpsBaseEventLabel,
  getGpsBaseStateLabel,
  normalizeGpsBase,
  type GpsBaseLike,
  type GpsBasePreparedEvent,
} from "@/app/lib/gps-base-detection";
import { isGpsBaseEventType } from "@/app/lib/gps-base-events";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import StatCard from "@/app/components/ui/StatCard";
import AppCard from "@/app/components/ui/AppCard";
import InfoRow from "@/app/components/ui/InfoRow";
import FormField from "@/app/components/ui/FormField";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import StatusBadge from "@/app/components/ui/StatusBadge";
import FilterBar from "@/app/components/ui/FilterBar";

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
  vehicleLabel: string | null;
  gpsBaseState: "dans_base" | "hors_base";
  currentBaseName: string | null;
  currentBaseDistanceM: number | null;
  latestBaseEvent: GpsBasePreparedEvent | null;
  gpsBaseTimeline: ReturnType<typeof buildLatestGpsBaseStatus>["timeline"];
};

type GpsBaseEventRow = {
  id: string;
  user_id: string | null;
  chauffeur_id: string | number | null;
  company_context: AccountRequestCompany | null;
  gps_position_id: string | null;
  base_id: string | null;
  event_type: string | null;
  event_label: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  rayon_metres: number | null;
  occurred_at: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  base_name: string | null;
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

function buildVehicleLabel(position: GpsPosition) {
  const candidates = [
    position.metadata?.vehicle_name,
    position.metadata?.vehicule,
    position.metadata?.vehicle,
    position.metadata?.vehicule_nom,
    position.metadata?.truck_name,
    position.source_label,
  ];

  const value = candidates.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value : null;
}

function formatCoordinates(position: GpsPosition | null) {
  if (!position || position.latitude == null || position.longitude == null) {
    return "-";
  }

  return `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
}

function getStatusTone(status: TerrainGpsStatus) {
  if (status === "deplacement") return "info" as const;
  if (status === "arrive") return "success" as const;
  if (status === "arret") return "warning" as const;
  return "default" as const;
}

export default function DirectionTerrainPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [dataSourceNotice, setDataSourceNotice] = useState("");
  const [gpsPositions, setGpsPositions] = useState<GpsPosition[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Map<string, string>>(new Map());
  const [sorties, setSorties] = useState<Map<number, Record<string, unknown>>>(new Map());
  const [livraisons, setLivraisons] = useState<Map<number, Record<string, unknown>>>(new Map());
  const [pointages, setPointages] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [gpsBases, setGpsBases] = useState<GpsBaseLike[]>([]);
  const [gpsBaseEvents, setGpsBaseEvents] = useState<GpsBaseEventRow[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState<AccountRequestCompany | "">("");
  const [dateFilter, setDateFilter] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<TerrainGpsStatus | "">("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  const loadData = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage("");
    setDataSourceNotice("");
    const [gpsRes, chauffeursRes, sortiesRes, livraisonsRes, pointagesRes, gpsBasesRes, gpsBaseEventsRes] =
      await Promise.allSettled([
        supabase.from("direction_terrain_positions").select("id, source_kind, source_label, user_id, chauffeur_id, company_context, latitude, longitude, speed_kmh, gps_status, activity_label, recorded_at, sortie_id, livraison_id, horodateur_event_id, intervention_label, metadata").order("recorded_at", { ascending: false }).limit(2500),
        supabase.from("chauffeurs").select("id, nom").order("id", { ascending: true }),
        supabase.from("sorties_terrain").select("id, date_sortie, temps_total, company_context").order("date_sortie", { ascending: false }).limit(400),
        supabase.from("livraisons_planifiees").select("id, date_livraison, statut").order("date_livraison", { ascending: false }).limit(400),
        supabase.from("horodateur_events").select("id, event_type, occurred_at, company_context").order("occurred_at", { ascending: false }).limit(600),
        supabase.from("gps_bases").select("id, nom, latitude, longitude, rayon_m, company_context, type_base").order("nom", { ascending: true }),
        supabase.from("gps_base_events").select("id, user_id, chauffeur_id, company_context, gps_position_id, base_id, event_type, event_label, latitude, longitude, distance_m, rayon_metres, occurred_at, created_at, metadata, gps_bases(nom)").order("occurred_at", { ascending: false }).limit(400),
      ]);

    if (gpsRes.status !== "fulfilled" || gpsRes.value.error) {
      const fallbackRes = await supabase.from("gps_positions").select("id, user_id, chauffeur_id, company_context, latitude, longitude, speed_kmh, gps_status, activity_label, recorded_at, sortie_id, livraison_id, horodateur_event_id, intervention_label, metadata").order("recorded_at", { ascending: false }).limit(2500);

      if (fallbackRes.error) {
        setGpsPositions([]);
        setErrorMessage("Le cockpit terrain ne trouve ni la vue direction_terrain_positions ni la table gps_positions.");
      } else {
        setGpsPositions((fallbackRes.data ?? []).map((row) => normalizeGps({ ...(row as Record<string, unknown>), source_kind: "gps", source_label: "Flux GPS natif" })));
        setDataSourceNotice("Le cockpit lit actuellement gps_positions uniquement.");
      }
    } else {
      const normalized = (gpsRes.value.data ?? []).map((row) => normalizeGps(row as Record<string, unknown>));
      setGpsPositions(normalized);

      const hasNativeGps = normalized.some((item) => item.source_kind === "gps");
      const hasCompatibilityRows = normalized.some((item) => item.source_kind !== "gps");

      if (hasNativeGps && hasCompatibilityRows) {
        setDataSourceNotice("Le cockpit combine le flux GPS natif et les evenements terrain compatibles.");
      } else if (hasCompatibilityRows && !hasNativeGps) {
        setDataSourceNotice("Aucun flux GPS natif detecte. Le cockpit affiche les donnees terrain derivees des sorties et pointages.");
      }
    }

    setChauffeurs(chauffeursRes.status !== "fulfilled" || chauffeursRes.value.error ? new Map() : new Map((chauffeursRes.value.data ?? []).map((row) => [String((row as Record<string, unknown>).id), String((row as Record<string, unknown>).nom ?? `#${String((row as Record<string, unknown>).id)}`)])));
    setSorties(sortiesRes.status !== "fulfilled" || sortiesRes.value.error ? new Map() : new Map((sortiesRes.value.data ?? []).map((row) => [Number((row as Record<string, unknown>).id), row as Record<string, unknown>])));
    setLivraisons(livraisonsRes.status !== "fulfilled" || livraisonsRes.value.error ? new Map() : new Map((livraisonsRes.value.data ?? []).map((row) => [Number((row as Record<string, unknown>).id), row as Record<string, unknown>])));
    setPointages(pointagesRes.status !== "fulfilled" || pointagesRes.value.error ? new Map() : new Map((pointagesRes.value.data ?? []).map((row) => [String((row as Record<string, unknown>).id), row as Record<string, unknown>])));
    setGpsBases(gpsBasesRes.status !== "fulfilled" || gpsBasesRes.value.error ? [] : (gpsBasesRes.value.data ?? []).map((row) => normalizeGpsBase(row as Record<string, unknown>)).filter((row) => row != null));
    setGpsBaseEvents(
      gpsBaseEventsRes.status !== "fulfilled" || gpsBaseEventsRes.value.error
        ? []
        : (gpsBaseEventsRes.value.data ?? []).map((row) => {
            const record = row as Record<string, unknown>;
            const baseRelation = record.gps_bases as { nom?: unknown } | Array<{ nom?: unknown }> | null;
            const firstBase =
              Array.isArray(baseRelation) ? baseRelation[0] : baseRelation;

            return {
              id: String(record.id ?? ""),
              user_id: typeof record.user_id === "string" ? record.user_id : null,
              chauffeur_id:
                typeof record.chauffeur_id === "string" || typeof record.chauffeur_id === "number"
                  ? record.chauffeur_id
                  : null,
              company_context: normalizeCompanyValue(record.company_context),
              gps_position_id:
                typeof record.gps_position_id === "string" ? record.gps_position_id : null,
              base_id: typeof record.base_id === "string" ? record.base_id : null,
              event_type: typeof record.event_type === "string" ? record.event_type : null,
              event_label: typeof record.event_label === "string" ? record.event_label : null,
              latitude: record.latitude == null ? null : toFiniteNumber(record.latitude),
              longitude: record.longitude == null ? null : toFiniteNumber(record.longitude),
              distance_m: record.distance_m == null ? null : toFiniteNumber(record.distance_m),
              rayon_metres: record.rayon_metres == null ? null : toFiniteNumber(record.rayon_metres),
              occurred_at: typeof record.occurred_at === "string" ? record.occurred_at : null,
              created_at: typeof record.created_at === "string" ? record.created_at : null,
              metadata:
                record.metadata && typeof record.metadata === "object"
                  ? (record.metadata as Record<string, unknown>)
                  : null,
              base_name: typeof firstBase?.nom === "string" ? firstBase.nom : null,
            } satisfies GpsBaseEventRow;
          }),
    );
    setLastRefreshAt(new Date().toISOString());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !user || blocked) return;
    const timeout = window.setTimeout(() => {
      void loadData();
    }, 0);
    const interval = window.setInterval(() => {
      void loadData(true);
    }, DELIVERY_TRACKING_REFRESH_MS);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
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
      const gpsBaseStatus = buildLatestGpsBaseStatus(positions, gpsBases);
      return {
        key,
        label: latest ? buildLabel(latest, chauffeurs) : key,
        company: latest?.company_context ?? null,
        status,
        latest,
        positions: [...positions].sort((a, b) => (a.recorded_at ?? "").localeCompare(b.recorded_at ?? "")),
        stopMinutes: latest?.recorded_at ? minutesBetween(lastMove, latest.recorded_at) : 0,
        vehicleLabel: latest ? buildVehicleLabel(latest) : null,
        gpsBaseState: gpsBaseStatus.state,
        currentBaseName: gpsBaseStatus.current_base?.base.nom ?? null,
        currentBaseDistanceM: gpsBaseStatus.current_base?.distance_m ?? null,
        latestBaseEvent: gpsBaseStatus.latest_event,
        gpsBaseTimeline: gpsBaseStatus.timeline,
      } satisfies PositionSummary;
    }).filter((item) => (!employeeFilter || item.key === employeeFilter) && (!companyFilter || item.company === companyFilter) && (!statusFilter || item.status === statusFilter)).sort((a, b) => (b.latest?.recorded_at ?? "").localeCompare(a.latest?.recorded_at ?? ""));
  }, [gpsPositions, dateFilter, chauffeurs, employeeFilter, companyFilter, statusFilter, gpsBases]);

  const effectiveSelectedEmployee =
    selectedEmployee && summaries.some((item) => item.key === selectedEmployee)
      ? selectedEmployee
      : summaries[0]?.key ?? "";

  const selected =
    summaries.find((item) => item.key === effectiveSelectedEmployee) ?? null;
  const selectedGpsBaseEvents = useMemo(() => {
    if (!selected) return [];

    return gpsBaseEvents
      .filter((event) => {
        if (selected.latest?.user_id && event.user_id === selected.latest.user_id) {
          return true;
        }

        return (
          selected.latest?.chauffeur_id != null &&
          event.chauffeur_id != null &&
          String(event.chauffeur_id) === String(selected.latest.chauffeur_id)
        );
      })
      .slice(0, 8);
  }, [gpsBaseEvents, selected]);
  const indicators = {
    active: summaries.filter((item) => item.status === "actif" || item.status === "deplacement").length,
    moving: summaries.filter((item) => item.status === "deplacement").length,
    stopped: summaries.filter((item) => item.status === "arret").length,
    arrived: summaries.filter((item) => item.status === "arrive").length,
    stale: summaries.filter((item) => item.stopMinutes >= 30 || item.status === "inactif").length,
  };
  const selectedMapUrl = getDeliveryTrackingMapUrl(
    selected?.latest?.latitude ?? null,
    selected?.latest?.longitude ?? null
  );

  if (accessLoading || (!blocked && loading)) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Terrain direction" subtitle="Carte en direct." />
          <SectionCard title="Chargement" subtitle="Positions en cours." />
        </div>
      </main>
    );
  }
  if (!user) {
    router.push("/direction/login");
    return null;
  }
  if (blocked) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Terrain direction" subtitle="Carte en direct." />
          <SectionCard title="Acces bloque" subtitle="Module masque." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Terrain direction"
          subtitle="Carte en direct."
          actions={<SecondaryButton onClick={() => void loadData()}>{refreshing ? "Synchronisation..." : "Actualiser"}</SecondaryButton>}
        />

        {errorMessage ? <SectionCard title="Chargement limite" subtitle={errorMessage} tone="muted" /> : null}
        {dataSourceNotice ? <SectionCard title="Source terrain" subtitle={dataSourceNotice} tone="muted" /> : null}

        <div className="ui-grid-auto">
          <StatCard label="Equipes suivies" value={summaries.length} />
          <StatCard label="En deplacement" value={indicators.moving} tone="info" />
          <StatCard label="A l arret" value={indicators.stopped} tone="warning" />
          <StatCard label="Arrivees" value={indicators.arrived} tone="success" />
          <StatCard label="Sans mouvement" value={indicators.stale} />
        </div>

        <FilterBar subtitle={`Maj ${formatTerrainDateTime(lastRefreshAt)}.`}>
          <FormField label="Employe">
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="tagora-input">
              <option value="">Tous les employes</option>
              {summaries.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </FormField>
          <FormField label="Compagnie">
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value as AccountRequestCompany | "")} className="tagora-input">
              <option value="">Toutes les compagnies</option>
              {ACCOUNT_REQUEST_COMPANIES.map((company) => <option key={company.value} value={company.value}>{company.label}</option>)}
            </select>
          </FormField>
          <FormField label="Date">
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="tagora-input" />
          </FormField>
          <FormField label="Statut">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TerrainGpsStatus | "")} className="tagora-input">
              <option value="">Tous les statuts</option>
              <option value="actif">Actif</option>
              <option value="deplacement">Deplacement</option>
              <option value="arret">Arret</option>
              <option value="arrive">Arrive</option>
              <option value="inactif">Inactif</option>
            </select>
          </FormField>
        </FilterBar>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.92fr) minmax(0, 1.55fr)", gap: "var(--ui-space-6)", alignItems: "start" }}>
          <SectionCard title="Equipes" subtitle="Selection active.">
            {summaries.length === 0 ? (
              <AppCard tone="muted">
                <p className="ui-text-muted" style={{ margin: 0 }}>Aucune donnee.</p>
              </AppCard>
            ) : (
              <div className="ui-stack-sm">
                {summaries.map((item) => (
                  <AppCard
                    key={item.key}
                    className="ui-stack-sm"
                    style={{
                      cursor: "pointer",
                      borderColor: item.key === effectiveSelectedEmployee ? "var(--ui-color-primary)" : undefined,
                      boxShadow: item.key === effectiveSelectedEmployee ? "var(--ui-shadow-md)" : undefined,
                      background: item.key === effectiveSelectedEmployee ? "linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)" : undefined,
                    }}
                    onClick={() => setSelectedEmployee(item.key)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div className="ui-stack-xs">
                        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ui-color-primary)" }}>{item.label}</div>
                        <div className="ui-text-muted">{item.company ? getCompanyLabel(item.company) : "Sans compagnie"}</div>
                        <div className="ui-text-muted">Vehicule: {item.vehicleLabel || "-"}</div>
                        <div className="ui-text-muted">
                          Base GPS: {item.currentBaseName ? `${item.currentBaseName} (${item.currentBaseDistanceM} m)` : getGpsBaseStateLabel(item.gpsBaseState)}
                        </div>
                      </div>
                      <StatusBadge label={getTerrainStatusLabel(item.status)} tone={getStatusTone(item.status)} />
                    </div>
                    <div className="ui-grid-2">
                      <InfoRow label="Latitude / Longitude" value={formatCoordinates(item.latest)} compact />
                      <InfoRow label="Temps d arret" value={formatDurationMinutes(item.stopMinutes)} compact />
                    </div>
                  </AppCard>
                ))}
              </div>
            )}
          </SectionCard>

          <div className="ui-stack-lg">
            <SectionCard title="Carte" subtitle="Position recente.">
              {selectedMapUrl ? (
                <iframe src={selectedMapUrl} title="Carte terrain direction" loading="lazy" referrerPolicy="no-referrer-when-downgrade" style={{ width: "100%", minHeight: 420, border: 0, borderRadius: 18, background: "#e2e8f0" }} />
              ) : (
                <AppCard tone="muted" style={{ minHeight: 420, display: "grid", placeItems: "center", textAlign: "center" }}>
                  <p className="ui-text-muted" style={{ margin: 0 }}>Selection requise.</p>
                </AppCard>
              )}
            </SectionCard>

            <SectionCard title="Detail" subtitle="Etat recent.">
              {!selected ? (
                <AppCard tone="muted">
                  <p className="ui-text-muted" style={{ margin: 0 }}>Selection requise.</p>
                </AppCard>
              ) : (
                <div className="ui-stack-md">
                  <div className="ui-grid-auto">
                    <InfoRow label="Chauffeur" value={selected.label} />
                    <InfoRow label="Vehicule" value={selected.vehicleLabel || "Non renseigne"} />
                    <InfoRow label="Latitude / Longitude" value={formatCoordinates(selected.latest)} />
                    <InfoRow label="Temps d arret" value={formatDurationMinutes(selected.stopMinutes)} />
                    <InfoRow label="Etat base GPS" value={getGpsBaseStateLabel(selected.gpsBaseState)} />
                    <InfoRow label="Base courante" value={selected.currentBaseName ? `${selected.currentBaseName}${selected.currentBaseDistanceM != null ? ` (${selected.currentBaseDistanceM} m)` : ""}` : "-"} />
                    <InfoRow label="Dernier evenement base" value={selected.latestBaseEvent ? `${selected.latestBaseEvent.label} - ${selected.latestBaseEvent.base_name}` : "-"} />
                  </div>

                  <div className="ui-stack-sm">
                    {selected.positions.map((position) => {
                      const status = normalizeTerrainGpsStatus(position);
                      const sortie = position.sortie_id ? sorties.get(position.sortie_id) : null;
                      const livraison = position.livraison_id ? livraisons.get(position.livraison_id) : null;
                      const pointage = position.horodateur_event_id ? pointages.get(position.horodateur_event_id) : null;
                      const gpsBaseEntry = selected.gpsBaseTimeline.find((entry) => entry.position.id === position.id) ?? null;
                      return (
                        <AppCard key={position.id} className="ui-stack-sm" tone="muted">
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <strong style={{ color: "var(--ui-color-primary)" }}>{formatTerrainDateTime(position.recorded_at)}</strong>
                            <StatusBadge label={getTerrainStatusLabel(status)} tone={getStatusTone(status)} />
                          </div>
                          <div className="ui-grid-auto">
                            <InfoRow label="Nom chauffeur" value={buildLabel(position, chauffeurs)} compact />
                            <InfoRow label="Latitude / Longitude" value={formatCoordinates(position)} compact />
                            <InfoRow label="Source" value={position.source_label || position.source_kind || "-"} compact />
                            <InfoRow label="Livraison" value={livraison ? `#${String(livraison.id)} - ${String(livraison.statut ?? "-")}` : position.livraison_id ? `#${position.livraison_id}` : "-"} compact />
                          </div>
                          <div className="ui-text-muted">Sortie: {sortie ? `#${String(sortie.id)}` : position.sortie_id ? `#${position.sortie_id}` : "-"}</div>
                          <div className="ui-text-muted">Pointage: {pointage ? `${String(pointage.event_type ?? "-")}` : position.horodateur_event_id || "-"}</div>
                          <div className="ui-text-muted">
                            Base GPS: {gpsBaseEntry?.current_base ? `${gpsBaseEntry.current_base.base.nom} (${gpsBaseEntry.current_base.distance_m} m)` : getGpsBaseStateLabel(gpsBaseEntry?.state ?? "hors_base")}
                          </div>
                          {gpsBaseEntry?.events.length ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {gpsBaseEntry.events.map((event) => (
                                <span
                                  key={`${position.id}-${event.name}-${event.base_id}`}
                                  style={{
                                    ...getTerrainStatusStyle(event.name === "gps_base_exited" ? "arret" : "arrive"),
                                    borderRadius: 999,
                                    padding: "4px 10px",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {event.label}: {event.base_name}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </AppCard>
                      );
                    })}
                  </div>

                  <SectionCard title="Historique GPS-base" subtitle="Evenements recents persistants.">
                    {selectedGpsBaseEvents.length === 0 ? (
                      <AppCard tone="muted">
                        <p className="ui-text-muted" style={{ margin: 0 }}>Aucun evenement GPS-base recent.</p>
                      </AppCard>
                    ) : (
                      <div className="ui-stack-sm">
                        {selectedGpsBaseEvents.map((event) => (
                          <AppCard key={event.id} tone="muted" className="ui-stack-xs">
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                              <strong style={{ color: "var(--ui-color-primary)" }}>
                                {event.event_label || (isGpsBaseEventType(event.event_type) ? getGpsBaseEventLabel(event.event_type) : event.event_type || "Evenement GPS-base")}
                              </strong>
                              <span className="ui-text-muted">{formatTerrainDateTime(event.occurred_at)}</span>
                            </div>
                            <div className="ui-text-muted">
                              Base: {event.base_name || event.metadata?.base_name || event.base_id || "-"}
                            </div>
                            <div className="ui-text-muted">
                              Distance: {event.distance_m != null ? `${Math.round(event.distance_m)} m` : "-"} | Rayon: {event.rayon_metres != null ? `${Math.round(event.rayon_metres)} m` : "-"}
                            </div>
                          </AppCard>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        <SectionCard title="Liens" subtitle="Modules lies.">
          <div className="ui-grid-auto">
            <AppCard tone="muted"><Link href="/direction/sorties-terrain"><div className="ui-stack-xs"><strong>Sorties terrain</strong><span className="ui-text-muted">Voir</span></div></Link></AppCard>
            <AppCard tone="muted"><Link href="/direction/livraisons"><div className="ui-stack-xs"><strong>Livraisons</strong><span className="ui-text-muted">Voir</span></div></Link></AppCard>
            <AppCard tone="muted"><Link href="/direction/horodateur"><div className="ui-stack-xs"><strong>Horodateur</strong><span className="ui-text-muted">Voir</span></div></Link></AppCard>
            <AppCard tone="muted"><Link href="/direction/terrain/evenements-gps-base"><div className="ui-stack-xs"><strong>Evenements GPS-base</strong><span className="ui-text-muted">Valider l historique persiste</span></div></Link></AppCard>
            <AppCard tone="muted"><Link href="/direction/temps-titan"><div className="ui-stack-xs"><strong>Temps Titan</strong><span className="ui-text-muted">Voir</span></div></Link></AppCard>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
