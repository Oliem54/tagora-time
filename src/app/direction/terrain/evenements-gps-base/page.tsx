"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, RefreshCw, Route } from "lucide-react";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import {
  getGpsBaseEventLabel,
  type GpsBaseEventName,
} from "@/app/lib/gps-base-detection";
import { isGpsBaseEventType } from "@/app/lib/gps-base-events";
import { formatTerrainDateTime, normalizeCompanyValue, toFiniteNumber } from "@/app/lib/terrain-gps";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import FilterBar from "@/app/components/ui/FilterBar";
import FormField from "@/app/components/ui/FormField";
import SectionCard from "@/app/components/ui/SectionCard";
import StatCard from "@/app/components/ui/StatCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import SecondaryButton from "@/app/components/ui/SecondaryButton";

type GpsBaseEventRow = {
  id: string;
  user_id: string | null;
  chauffeur_id: string | number | null;
  company_context: AccountRequestCompany | null;
  gps_position_id: string | null;
  base_id: string | null;
  event_type: GpsBaseEventName | null;
  event_label: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  rayon_metres: number | null;
  occurred_at: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  base_name: string | null;
  employee_label: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoIso() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

function formatCoordinate(value: number | null) {
  return value == null ? "-" : value.toFixed(5);
}

function getEventTone(eventType: GpsBaseEventName | null) {
  if (eventType === "gps_base_exited") return "warning" as const;
  if (eventType === "gps_base_returned") return "success" as const;
  if (eventType === "gps_base_arrived") return "info" as const;
  return "default" as const;
}

function getEmployeeLabel(
  row: Record<string, unknown>,
  chauffeurs: Map<string, string>
) {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
  const chauffeurId =
    typeof row.chauffeur_id === "string" || typeof row.chauffeur_id === "number"
      ? row.chauffeur_id
      : null;
  const metadataEmployeeName =
    typeof metadata?.employee_name === "string" ? metadata.employee_name : null;
  const metadataEmail =
    typeof metadata?.user_email === "string" ? metadata.user_email : null;

  return (
    metadataEmployeeName ||
    (chauffeurId ? chauffeurs.get(String(chauffeurId)) : null) ||
    metadataEmail ||
    (typeof row.user_id === "string"
      ? `Employe ${row.user_id.slice(0, 8)}`
      : "Employe non defini")
  );
}

function normalizeEventRow(
  row: Record<string, unknown>,
  chauffeurs: Map<string, string>
) {
  const baseRelation = row.gps_bases as { nom?: unknown } | Array<{ nom?: unknown }> | null;
  const firstBase = Array.isArray(baseRelation) ? baseRelation[0] : baseRelation;
  const eventType = isGpsBaseEventType(row.event_type) ? row.event_type : null;

  return {
    id: String(row.id ?? ""),
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    chauffeur_id:
      typeof row.chauffeur_id === "string" || typeof row.chauffeur_id === "number"
        ? row.chauffeur_id
        : null,
    company_context: normalizeCompanyValue(row.company_context),
    gps_position_id: typeof row.gps_position_id === "string" ? row.gps_position_id : null,
    base_id: typeof row.base_id === "string" ? row.base_id : null,
    event_type: eventType,
    event_label:
      typeof row.event_label === "string"
        ? row.event_label
        : eventType
          ? getGpsBaseEventLabel(eventType)
          : null,
    latitude: row.latitude == null ? null : toFiniteNumber(row.latitude),
    longitude: row.longitude == null ? null : toFiniteNumber(row.longitude),
    distance_m: row.distance_m == null ? null : toFiniteNumber(row.distance_m),
    rayon_metres: row.rayon_metres == null ? null : toFiniteNumber(row.rayon_metres),
    occurred_at: typeof row.occurred_at === "string" ? row.occurred_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    base_name: typeof firstBase?.nom === "string" ? firstBase.nom : null,
    employee_label: getEmployeeLabel(row, chauffeurs),
  } satisfies GpsBaseEventRow;
}

export default function DirectionGpsBaseEventsPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [events, setEvents] = useState<GpsBaseEventRow[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState<AccountRequestCompany | "">("");
  const [eventTypeFilter, setEventTypeFilter] = useState<GpsBaseEventName | "">("");
  const [dateFrom, setDateFrom] = useState(weekAgoIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  const loadData = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage("");

    const [eventsRes, chauffeursRes] = await Promise.allSettled([
      supabase
        .from("gps_base_events")
        .select("id, user_id, chauffeur_id, company_context, gps_position_id, base_id, event_type, event_label, latitude, longitude, distance_m, rayon_metres, occurred_at, created_at, metadata, gps_bases(nom)")
        .order("occurred_at", { ascending: false })
        .limit(1500),
      supabase.from("chauffeurs").select("id, nom").order("id", { ascending: true }),
    ]);

    const chauffeurMap =
      chauffeursRes.status !== "fulfilled" || chauffeursRes.value.error
        ? new Map<string, string>()
        : new Map(
            (chauffeursRes.value.data ?? []).map((row) => [
              String((row as Record<string, unknown>).id),
              String((row as Record<string, unknown>).nom ?? `#${String((row as Record<string, unknown>).id)}`),
            ])
          );

    if (eventsRes.status !== "fulfilled" || eventsRes.value.error) {
      setEvents([]);
      setErrorMessage("Impossible de charger l historique GPS-base.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setEvents((eventsRes.value.data ?? []).map((row) => normalizeEventRow(row as Record<string, unknown>, chauffeurMap)));
    setLastRefreshAt(new Date().toISOString());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !user || blocked) return;

    const timeout = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accessLoading, blocked, loadData, user]);

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        if (employeeFilter) {
          const employeeMatches =
            event.user_id === employeeFilter ||
            String(event.chauffeur_id ?? "") === employeeFilter;

          if (!employeeMatches) return false;
        }

        if (companyFilter && event.company_context !== companyFilter) {
          return false;
        }

        if (eventTypeFilter && event.event_type !== eventTypeFilter) {
          return false;
        }

        const day = event.occurred_at?.slice(0, 10) ?? "";

        if (dateFrom && day < dateFrom) {
          return false;
        }

        if (dateTo && day > dateTo) {
          return false;
        }

        return true;
      })
      .sort((left, right) => String(right.occurred_at ?? "").localeCompare(String(left.occurred_at ?? "")));
  }, [events, employeeFilter, companyFilter, eventTypeFilter, dateFrom, dateTo]);

  const employeeOptions = useMemo(() => {
    const options = new Map<string, string>();

    events.forEach((event) => {
      if (event.user_id) {
        options.set(event.user_id, event.employee_label);
        return;
      }

      if (event.chauffeur_id != null) {
        options.set(String(event.chauffeur_id), event.employee_label);
      }
    });

    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [events]);

  const stats = useMemo(() => {
    return {
      total: filteredEvents.length,
      entered: filteredEvents.filter((event) => event.event_type === "gps_base_entered").length,
      exited: filteredEvents.filter((event) => event.event_type === "gps_base_exited").length,
      arrived: filteredEvents.filter((event) => event.event_type === "gps_base_arrived").length,
      returned: filteredEvents.filter((event) => event.event_type === "gps_base_returned").length,
    };
  }, [filteredEvents]);

  if (accessLoading || (!blocked && loading)) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Evenements GPS-base" subtitle="Validation terrain." />
          <SectionCard title="Chargement" subtitle="Historique en cours." />
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
          <AuthenticatedPageHeader title="Evenements GPS-base" subtitle="Validation terrain." />
          <SectionCard title="Acces bloque" subtitle="Module masque." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Evenements GPS-base"
          subtitle="Historique clair, testable et validable."
          actions={
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/direction/terrain" className="tagora-dark-outline-action">
                <Route size={16} />
                <span>Retour terrain</span>
              </Link>
              <SecondaryButton onClick={() => void loadData(true)}>
                <RefreshCw size={16} />
                <span>{refreshing ? "Synchronisation..." : "Actualiser"}</span>
              </SecondaryButton>
            </div>
          }
        />

        {errorMessage ? <SectionCard title="Chargement limite" subtitle={errorMessage} tone="muted" /> : null}

        <div className="ui-grid-auto">
          <StatCard label="Evenements filtres" value={stats.total} />
          <StatCard label="Entrees" value={stats.entered} tone="info" />
          <StatCard label="Sorties" value={stats.exited} tone="warning" />
          <StatCard label="Arrivees" value={stats.arrived} tone="info" />
          <StatCard label="Retours" value={stats.returned} tone="success" />
        </div>

        <FilterBar subtitle={`Maj ${formatTerrainDateTime(lastRefreshAt)}.`}>
          <FormField label="Employe">
            <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="tagora-input">
              <option value="">Tous les employes</option>
              {employeeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Compagnie">
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value as AccountRequestCompany | "")} className="tagora-input">
              <option value="">Toutes les compagnies</option>
              {ACCOUNT_REQUEST_COMPANIES.map((company) => (
                <option key={company.value} value={company.value}>
                  {company.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Type d evenement">
            <select value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value as GpsBaseEventName | "")} className="tagora-input">
              <option value="">Tous les types</option>
              <option value="gps_base_entered">{getGpsBaseEventLabel("gps_base_entered")}</option>
              <option value="gps_base_exited">{getGpsBaseEventLabel("gps_base_exited")}</option>
              <option value="gps_base_arrived">{getGpsBaseEventLabel("gps_base_arrived")}</option>
              <option value="gps_base_returned">{getGpsBaseEventLabel("gps_base_returned")}</option>
            </select>
          </FormField>

          <FormField label="Date debut">
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="tagora-input" />
          </FormField>

          <FormField label="Date fin">
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="tagora-input" />
          </FormField>
        </FilterBar>

        <SectionCard
          title="Historique GPS-base"
          subtitle={`${filteredEvents.length} evenement${filteredEvents.length > 1 ? "s" : ""}, du plus recent au plus ancien.`}
        >
          {filteredEvents.length === 0 ? (
            <AppCard tone="muted">
              <p className="ui-text-muted" style={{ margin: 0 }}>Aucun evenement ne correspond aux filtres.</p>
            </AppCard>
          ) : (
            <div className="ui-stack-md">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(150px, 1.2fr) minmax(180px, 1.1fr) minmax(140px, 0.9fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(90px, 0.6fr) minmax(120px, 0.7fr) minmax(120px, 0.7fr)",
                  gap: 12,
                  padding: "0 6px",
                  color: "var(--ui-color-text-muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <div>Date / heure</div>
                <div>Employe</div>
                <div>Compagnie</div>
                <div>Base</div>
                <div>Evenement</div>
                <div>Distance</div>
                <div>Latitude</div>
                <div>Longitude</div>
              </div>

              <div className="ui-stack-sm">
                {filteredEvents.map((event) => (
                  <AppCard
                    key={event.id}
                    className="ui-stack-sm"
                    style={{
                      overflow: "hidden",
                      borderColor: "rgba(148, 163, 184, 0.18)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(150px, 1.2fr) minmax(180px, 1.1fr) minmax(140px, 0.9fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(90px, 0.6fr) minmax(120px, 0.7fr) minmax(120px, 0.7fr)",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "var(--ui-color-primary)" }}>
                        {formatTerrainDateTime(event.occurred_at)}
                      </div>
                      <div>{event.employee_label}</div>
                      <div>
                        {event.company_context ? getCompanyLabel(event.company_context) : "-"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <MapPin size={15} color="var(--ui-color-primary)" />
                        <span>{event.base_name || event.metadata?.base_name || "-"}</span>
                      </div>
                      <div>
                        <StatusBadge
                          label={event.event_label || (event.event_type ? getGpsBaseEventLabel(event.event_type) : "Evenement")}
                          tone={getEventTone(event.event_type)}
                        />
                      </div>
                      <div>{event.distance_m != null ? `${Math.round(event.distance_m)} m` : "-"}</div>
                      <div>{formatCoordinate(event.latitude)}</div>
                      <div>{formatCoordinate(event.longitude)}</div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                        color: "var(--ui-color-text-muted)",
                        fontSize: 13,
                      }}
                    >
                      <span>Rayon: {event.rayon_metres != null ? `${Math.round(event.rayon_metres)} m` : "-"}</span>
                      <span>Position: {event.gps_position_id || "-"}</span>
                      <span>Base: {event.base_id || "-"}</span>
                    </div>
                  </AppCard>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Liens rapides" subtitle="Validation et configuration.">
          <div className="ui-grid-auto">
            <AppCard tone="muted">
              <Link href="/direction/terrain">
                <div className="ui-stack-xs">
                  <strong>Cockpit terrain</strong>
                  <span className="ui-text-muted">Retour au suivi en direct</span>
                </div>
              </Link>
            </AppCard>
            <AppCard tone="muted">
              <Link href="/direction/ressources/bases-gps">
                <div className="ui-stack-xs">
                  <strong>Bases GPS</strong>
                  <span className="ui-text-muted">Verifier les rayons et la configuration</span>
                </div>
              </Link>
            </AppCard>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
