"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, RefreshCw, Trash2 } from "lucide-react";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

type Department =
  | "Montage voiturette"
  | "Showroom Oliem"
  | "Showroom Titan"
  | "Opérations"
  | "Service après vente"
  | "Livreur"
  | "Design numérique"
  | "Administration"
  | "Autre";
type Location = "Oliem" | "Titan" | "Entrepôt" | "Route" | "Télétravail" | "Autre";
type CoverageStatus = "covered" | "watch" | "missing" | "surplus" | "not_required";

type CoverageRow = {
  date: string;
  department: Department;
  requiredEmployees: number;
  plannedEmployees: number;
  requiredHours: number;
  plannedHours: number;
  status: CoverageStatus;
  missingEmployees: number;
  missingHours: number;
  uncoveredWindows?: string[];
  partialWindows?: string[];
};

type AlertRow = {
  date: string;
  department: Department;
  type: string;
  message: string;
  severity: "low" | "medium" | "high";
  location?: string | null;
};

type EmployeeRow = {
  id: number;
  nom: string | null;
  actif: boolean | null;
  primary_department: string | null;
  secondary_departments: string[] | null;
  primary_location: string | null;
  secondary_locations: string[] | null;
  can_deliver: boolean | null;
  default_weekly_hours: number | null;
  schedule_active: boolean | null;
};

type CoverageWindowRow = {
  id: string;
  department: Department;
  location: Location | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  min_employees: number;
  active: boolean;
};

type EffectifsPayload = {
  summary: {
    totalPlannedHours: number;
    totalRequiredHours: number;
    totalMissingHours: number;
    totalCoverageAlerts: number;
    totalDeliveryDaysWithoutDriver: number;
  };
  days: Array<{ date: string; dayOfWeek: number; label: string }>;
  departments: Department[];
  locations: Location[];
  coverageWindows: CoverageWindowRow[];
  coverage: CoverageRow[];
  alerts: AlertRow[];
  alertsHistory?: Array<{
    alert_key: string;
    status: "resolue" | "ignoree" | "echue" | "archivee";
    department: string | null;
    location: string | null;
    alert_date: string | null;
    severity: string | null;
    message: string | null;
    first_seen_at: string | null;
    last_seen_at: string | null;
    resolved_at: string | null;
    ignored_at: string | null;
    expired_at: string | null;
    archived_at: string | null;
    note: string | null;
  }>;
  schedules: Array<{
    id: string;
    employee_id: number;
    employeeName: string;
    department: Department;
    location: Location;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    planned_hours: number | null;
    notes: string | null;
    isPrimaryDepartment: boolean;
    isOutsideUsualSchedule: boolean;
    warnings: string[];
  }>;
  employees: EmployeeRow[];
  deliveryNeeds: Array<{
    date: string;
    hasPlannedDeliveries: boolean;
    plannedDeliveriesCount: number;
    requiredDrivers: number;
  }>;
  weekStart: string;
};

type ScheduleForm = {
  employeeId: string;
  department: Department;
  location: Location;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  notes: string;
};

type CoverageWindowForm = {
  department: Department;
  location: Location | "";
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  minEmployees: number;
  active: boolean;
};

const DEFAULT_DEPARTMENTS: Department[] = [
  "Montage voiturette",
  "Showroom Oliem",
  "Showroom Titan",
  "Opérations",
  "Service après vente",
  "Livreur",
  "Design numérique",
  "Administration",
  "Autre",
];
const DEFAULT_LOCATIONS: Location[] = ["Oliem", "Titan", "Entrepôt", "Route", "Télétravail", "Autre"];
const DAY_LABELS: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Jeu",
  5: "Ven",
  6: "Sam",
  7: "Dim",
};

function startOfIsoWeek(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const result = new Date(date);
  result.setDate(date.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function toDateOnly(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getAlertPriority(alert: AlertRow) {
  if (alert.type === "delivery_without_driver") return 0;
  if (alert.type === "window_uncovered") return 1;
  if (alert.type === "window_partial") return 2;
  return 3;
}

function getCoverageLabel(row: CoverageRow | undefined, hasPlannedDeliveries: boolean) {
  if (!row) return "Aucune couverture requise";
  if (row.department === "Livreur" && hasPlannedDeliveries && row.plannedEmployees <= 0) {
    return "Livreur requis";
  }
  if ((row.uncoveredWindows?.length ?? 0) > 0) return `Manque couverture ${row.uncoveredWindows?.join(", ")}`;
  if ((row.partialWindows?.length ?? 0) > 0) return `Couvre partiellement ${row.partialWindows?.join(", ")}`;
  if (row.status === "not_required") return "Aucune couverture requise";
  return "Couvert selon horaire requis";
}

const STATUS_STYLES: Record<CoverageStatus, CSSProperties> = {
  covered: { border: "1px solid #86efac", background: "#dcfce7", color: "#166534" },
  watch: { border: "1px solid #fdba74", background: "#ffedd5", color: "#9a3412" },
  missing: { border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b" },
  surplus: { border: "1px solid #93c5fd", background: "#dbeafe", color: "#1d4ed8" },
  not_required: { border: "1px solid #cbd5e1", background: "#f1f5f9", color: "#475569" },
};

export default function DirectionEffectifsClient() {
  const router = useRouter();
  const { user, role, loading } = useCurrentAccess();
  const [weekStart, setWeekStart] = useState<string>(() => toDateOnly(startOfIsoWeek(new Date())));
  const [payload, setPayload] = useState<EffectifsPayload | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showAddShift, setShowAddShift] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCoverageConfig, setShowCoverageConfig] = useState(false);
  const [showAlertsHistory, setShowAlertsHistory] = useState(false);
  const [coverageWindowSaving, setCoverageWindowSaving] = useState(false);
  const [alertsFilter, setAlertsFilter] = useState<
    "actives" | "critiques" | "ignorees" | "resolues" | "echues" | "archivees"
  >("actives");
  const [postWarnings, setPostWarnings] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<Department | "tous">("tous");
  const [locationFilter, setLocationFilter] = useState<Location | "tous">("tous");
  const [employeeFilter, setEmployeeFilter] = useState("tous");
  const [form, setForm] = useState<ScheduleForm>({
    employeeId: "",
    department: "Montage voiturette",
    location: "Oliem",
    scheduledDate: "",
    startTime: "08:00",
    endTime: "17:00",
    notes: "",
  });
  const [coverageWindowForm, setCoverageWindowForm] = useState<CoverageWindowForm>({
    department: "Showroom Oliem",
    location: "Oliem",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    minEmployees: 1,
    active: true,
  });

  const canView = role === "admin" || role === "direction" || role === "employe";
  const canConfigure = role === "admin" || role === "direction";

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setAccessToken(data.session?.access_token ?? null);
    };
    void init();
  }, []);

  useEffect(() => {
    if (loading || user) return;
    router.replace("/direction/login");
  }, [loading, router, user]);

  const fetchEffectifs = useCallback(async () => {
    if (!accessToken || !canView) return;
    setFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("weekStart", weekStart);
      if (departmentFilter !== "tous") params.set("department", departmentFilter);
      if (locationFilter !== "tous") params.set("location", locationFilter);
      if (employeeFilter !== "tous") params.set("employeeId", employeeFilter);
      const res = await fetch(`/api/direction/effectifs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Chargement des effectifs impossible.");
      }
      const data = (await res.json()) as EffectifsPayload;
      setPayload(data);
      const fallbackDate = data.days[0]?.date ?? "";
      setSelectedDate((current) =>
        current && data.days.some((day) => day.date === current) ? current : fallbackDate
      );
      setForm((current) => ({ ...current, scheduledDate: current.scheduledDate || fallbackDate }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erreur chargement effectifs.");
    } finally {
      setFetching(false);
    }
  }, [accessToken, canView, departmentFilter, employeeFilter, locationFilter, weekStart]);

  useEffect(() => {
    void fetchEffectifs();
  }, [fetchEffectifs]);

  const selectedEmployees = useMemo(
    () =>
      (payload?.employees ?? []).filter((employee) => employee.actif !== false && employee.schedule_active !== false),
    [payload]
  );

  const coverageByKey = useMemo(() => {
    const map = new Map<string, CoverageRow>();
    for (const row of payload?.coverage ?? []) map.set(`${row.department}::${row.date}`, row);
    return map;
  }, [payload]);

  const windowsByDepartment = useMemo(() => {
    const grouped = new Map<Department, CoverageWindowRow[]>();
    for (const window of payload?.coverageWindows ?? []) {
      const list = grouped.get(window.department) ?? [];
      list.push(window);
      grouped.set(window.department, list);
    }
    for (const [department, list] of grouped.entries()) {
      list.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
      grouped.set(department, list);
    }
    return grouped;
  }, [payload]);

  const sortedAlerts = useMemo(
    () => [...(payload?.alerts ?? [])].sort((a, b) => getAlertPriority(a) - getAlertPriority(b)),
    [payload]
  );
  const limitedActiveAlerts = useMemo(() => sortedAlerts.slice(0, 10), [sortedAlerts]);
  const hasMoreThanTenAlerts = sortedAlerts.length > 10;
  const historyAlerts = useMemo(() => payload?.alertsHistory ?? [], [payload]);
  const filteredHistoryAlerts = useMemo(() => {
    if (alertsFilter === "actives") return [];
    if (alertsFilter === "critiques") return historyAlerts.filter((alert) => alert.severity === "high");
    if (alertsFilter === "ignorees") return historyAlerts.filter((alert) => alert.status === "ignoree");
    if (alertsFilter === "resolues") return historyAlerts.filter((alert) => alert.status === "resolue");
    if (alertsFilter === "echues") return historyAlerts.filter((alert) => alert.status === "echue");
    if (alertsFilter === "archivees") return historyAlerts.filter((alert) => alert.status === "archivee");
    return historyAlerts;
  }, [alertsFilter, historyAlerts]);

  const selectedDaySchedules = useMemo(
    () => (payload?.schedules ?? []).filter((row) => row.scheduled_date === selectedDate),
    [payload, selectedDate]
  );

  const handleCreateSchedule = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!accessToken || !canConfigure) return;
      setSaving(true);
      setError(null);
      setPostWarnings([]);
      try {
        const res = await fetch("/api/direction/effectifs/schedules", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            employeeId: Number(form.employeeId),
            department: form.department,
            location: form.location,
            scheduledDate: form.scheduledDate || selectedDate,
            startTime: form.startTime,
            endTime: form.endTime,
            notes: form.notes,
          }),
        });
        const body = (await res.json().catch(() => null)) as { error?: string; warnings?: string[] } | null;
        if (!res.ok) throw new Error(body?.error || "Création du quart impossible.");
        setPostWarnings(Array.isArray(body?.warnings) ? body.warnings : []);
        setShowAddShift(false);
        setForm((current) => ({ ...current, employeeId: "", notes: "" }));
        await fetchEffectifs();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Erreur création quart.");
      } finally {
        setSaving(false);
      }
    },
    [accessToken, canConfigure, fetchEffectifs, form, selectedDate]
  );

  const handleDeleteShift = useCallback(
    async (scheduleId: string) => {
      if (!accessToken || !canConfigure) return;
      if (!window.confirm("Retirer ce quart planifié ?")) return;
      const res = await fetch(`/api/direction/effectifs/schedules/${scheduleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) await fetchEffectifs();
    },
    [accessToken, canConfigure, fetchEffectifs]
  );

  const handleCreateCoverageWindow = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!accessToken || !canConfigure) return;
      setCoverageWindowSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/direction/effectifs/coverage-windows", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(coverageWindowForm),
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error || "Création plage impossible.");
        await fetchEffectifs();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Erreur création plage.");
      } finally {
        setCoverageWindowSaving(false);
      }
    },
    [accessToken, canConfigure, coverageWindowForm, fetchEffectifs]
  );

  const handleToggleCoverageWindow = useCallback(
    async (id: string, active: boolean) => {
      if (!accessToken || !canConfigure) return;
      const res = await fetch(`/api/direction/effectifs/coverage-windows/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) await fetchEffectifs();
    },
    [accessToken, canConfigure, fetchEffectifs]
  );

  const handleDeleteCoverageWindow = useCallback(
    async (id: string) => {
      if (!accessToken || !canConfigure) return;
      if (!window.confirm("Supprimer cette plage horaire ?")) return;
      const res = await fetch(`/api/direction/effectifs/coverage-windows/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) await fetchEffectifs();
    },
    [accessToken, canConfigure, fetchEffectifs]
  );

  const handleUpdateAlertStatus = useCallback(
    async (alert: AlertRow, status: "resolue" | "ignoree" | "archivee") => {
      if (!accessToken || !canConfigure) return;
      const alertKey = [
        alert.date,
        alert.department,
        alert.location ?? "",
        alert.type,
        alert.message,
      ]
        .map((part) => String(part).trim().toLowerCase())
        .join("|");
      const res = await fetch(
        `/api/direction/effectifs/alerts/${encodeURIComponent(alertKey)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status }),
        }
      );
      if (res.ok) {
        await fetchEffectifs();
      }
    },
    [accessToken, canConfigure, fetchEffectifs]
  );

  if (loading || (canView && !payload && fetching)) {
    return <TagoraLoadingScreen isLoading message="Chargement des effectifs..." fullScreen />;
  }
  if (!user) return null;
  if (!canView) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader
            title="Calendrier des effectifs"
            subtitle="Accès réservé."
            showNavigation={false}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Calendrier des effectifs"
          subtitle="Planification et couverture des équipes par département."
          showNavigation={false}
          actions={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <SecondaryButton onClick={() => router.push("/direction/dashboard")}>
                <ArrowLeft size={14} /> Retour tableau de bord direction
              </SecondaryButton>
              <button type="button" className="tagora-dark-action" onClick={() => void fetchEffectifs()}>
                <RefreshCw size={14} /> Actualiser
              </button>
            </div>
          }
        />

        {error ? (
          <AppCard style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#9f1239" }}>
            {error}
          </AppCard>
        ) : null}

        <SectionCard title="Filtres" subtitle="Semaine, département, emplacement et employé.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <input type="date" className="tagora-input" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            <select className="tagora-input" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value as Department | "tous")}>
              <option value="tous">Tous les départements</option>
              {DEFAULT_DEPARTMENTS.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            <select className="tagora-input" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value as Location | "tous")}>
              <option value="tous">Tous les emplacements</option>
              {(payload?.locations ?? DEFAULT_LOCATIONS).map((location) => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
            <select className="tagora-input" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
              <option value="tous">Tous les employés</option>
              {selectedEmployees.map((employee) => (
                <option key={employee.id} value={String(employee.id)}>{employee.nom ?? `Employé #${employee.id}`}</option>
              ))}
            </select>
          </div>
        </SectionCard>

        <SectionCard title="Calendrier hebdomadaire" subtitle="Statut de couverture selon les heures requises.">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Département</th>
                  {(payload?.days ?? []).map((day) => (
                    <th key={day.date} style={thStyle}>
                      <button
                        type="button"
                        onClick={() => setSelectedDate(day.date)}
                        style={{ border: "none", background: "transparent", cursor: "pointer" }}
                      >
                        {day.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(payload?.departments ?? DEFAULT_DEPARTMENTS).map((department) => (
                  <tr key={department}>
                    <td style={tdStyle}><strong>{department}</strong></td>
                    {(payload?.days ?? []).map((day) => {
                      const row = coverageByKey.get(`${department}::${day.date}`);
                      const deliveryNeed = (payload?.deliveryNeeds ?? []).find((item) => item.date === day.date);
                      const label = getCoverageLabel(row, deliveryNeed?.hasPlannedDeliveries ?? false);
                      const style = STATUS_STYLES[row?.status ?? "not_required"];
                      return (
                        <td key={`${department}-${day.date}`} style={tdStyle}>
                          <div style={{ ...style, borderRadius: 12, padding: 10, display: "grid", gap: 4 }}>
                            <strong style={{ fontSize: 12 }}>{label}</strong>
                            <span style={{ fontSize: 12 }}>{row?.plannedEmployees ?? 0} planifiés / {row?.requiredEmployees ?? 0} requis</span>
                            <span style={{ fontSize: 12 }}>{row?.plannedHours ?? 0} h / {row?.requiredHours ?? 0} h</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Heures à couvrir" subtitle="Plages configurables par département et par journée.">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong>Plages de couverture</strong>
            {canConfigure ? (
              <button type="button" className="tagora-dark-action" onClick={() => setShowCoverageConfig((c) => !c)}>
                {showCoverageConfig ? "Fermer la configuration" : "Configurer les heures à couvrir"}
              </button>
            ) : (
              <span style={{ color: "#64748b", fontSize: 13 }}>Lecture seule</span>
            )}
          </div>

          {showCoverageConfig && canConfigure ? (
            <AppCard style={{ marginBottom: 10 }}>
              <form onSubmit={handleCreateCoverageWindow} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                <select className="tagora-input" value={coverageWindowForm.department} onChange={(e) => setCoverageWindowForm((c) => ({ ...c, department: e.target.value as Department }))}>
                  {DEFAULT_DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                <select className="tagora-input" value={coverageWindowForm.location} onChange={(e) => setCoverageWindowForm((c) => ({ ...c, location: e.target.value as Location | "" }))}>
                  <option value="">Sans emplacement</option>
                  {(payload?.locations ?? DEFAULT_LOCATIONS).map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
                <select className="tagora-input" value={coverageWindowForm.dayOfWeek} onChange={(e) => setCoverageWindowForm((c) => ({ ...c, dayOfWeek: Number(e.target.value) }))}>
                  <option value={1}>Lundi</option><option value={2}>Mardi</option><option value={3}>Mercredi</option>
                  <option value={4}>Jeudi</option><option value={5}>Vendredi</option><option value={6}>Samedi</option><option value={7}>Dimanche</option>
                </select>
                <input type="time" className="tagora-input" value={coverageWindowForm.startTime} onChange={(e) => setCoverageWindowForm((c) => ({ ...c, startTime: e.target.value }))} />
                <input type="time" className="tagora-input" value={coverageWindowForm.endTime} onChange={(e) => setCoverageWindowForm((c) => ({ ...c, endTime: e.target.value }))} />
                <input type="number" min={0} className="tagora-input" value={coverageWindowForm.minEmployees} onChange={(e) => setCoverageWindowForm((c) => ({ ...c, minEmployees: Number(e.target.value) }))} />
                <button type="submit" className="tagora-dark-action" disabled={coverageWindowSaving}>
                  {coverageWindowSaving ? "Ajout..." : "Ajouter une plage"}
                </button>
              </form>
            </AppCard>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            {(payload?.departments ?? DEFAULT_DEPARTMENTS).map((department) => {
              const windows = windowsByDepartment.get(department) ?? [];
              return (
                <AppCard key={department}>
                  <strong>{department}</strong>
                  {windows.length === 0 ? (
                    <p style={{ margin: "8px 0 0", color: "#64748b" }}>Aucune plage active (fermé).</p>
                  ) : (
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {windows.map((window) => (
                        <div key={window.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <span>
                            {DAY_LABELS[window.day_of_week]} {window.start_time}-{window.end_time} | min {window.min_employees}
                            {window.location ? ` | ${window.location}` : ""}
                            {!window.active ? " | inactif" : ""}
                          </span>
                          {canConfigure ? (
                            <span style={{ display: "flex", gap: 8 }}>
                              <button type="button" className="tagora-dark-outline-action" onClick={() => void handleToggleCoverageWindow(window.id, window.active)}>
                                {window.active ? "Désactiver" : "Activer"}
                              </button>
                              <button type="button" className="tagora-dark-outline-action" onClick={() => void handleDeleteCoverageWindow(window.id)}>
                                Supprimer
                              </button>
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </AppCard>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Alertes de couverture" subtitle="Priorisées par criticité.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button type="button" className="tagora-dark-outline-action" onClick={() => setAlertsFilter("actives")}>
              Actives
            </button>
            <button type="button" className="tagora-dark-outline-action" onClick={() => setAlertsFilter("critiques")}>
              Critiques
            </button>
            <button type="button" className="tagora-dark-outline-action" onClick={() => setAlertsFilter("ignorees")}>
              Ignorées
            </button>
            <button type="button" className="tagora-dark-outline-action" onClick={() => setAlertsFilter("resolues")}>
              Résolues
            </button>
            <button type="button" className="tagora-dark-outline-action" onClick={() => setAlertsFilter("echues")}>
              Échues
            </button>
            <button type="button" className="tagora-dark-outline-action" onClick={() => setAlertsFilter("archivees")}>
              Archivées
            </button>
            <button type="button" className="tagora-dark-action" onClick={() => setShowAlertsHistory((current) => !current)}>
              {showAlertsHistory ? "Masquer historique" : "Voir historique des alertes"}
            </button>
          </div>

          {limitedActiveAlerts.length === 0 ? (
            <AppCard>
              Aucune alerte active pour cette semaine.
              {historyAlerts.length > 0 ? (
                <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                  Certaines alertes sont résolues, ignorées ou échues et sont disponibles dans l’historique.
                </p>
              ) : null}
            </AppCard>
          ) : (
            <div className="ui-stack-sm">
              {limitedActiveAlerts.map((alert, index) => (
                <AppCard
                  key={`${alert.date}-${alert.department}-${index}`}
                  style={{ border: `1px solid ${alert.severity === "high" ? "#fecaca" : "#fed7aa"}`, background: alert.severity === "high" ? "#fff1f2" : "#fff7ed" }}
                >
                  <strong>{alert.date} - {alert.department}</strong>
                  <p style={{ margin: "6px 0 0", color: "#7c2d12" }}>{alert.message}</p>
                  {canConfigure ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="tagora-dark-outline-action" onClick={() => void handleUpdateAlertStatus(alert, "resolue")}>
                        Marquer comme résolue
                      </button>
                      <button type="button" className="tagora-dark-outline-action" onClick={() => void handleUpdateAlertStatus(alert, "ignoree")}>
                        Ignorer
                      </button>
                      <button type="button" className="tagora-dark-outline-action" onClick={() => void handleUpdateAlertStatus(alert, "archivee")}>
                        Archiver
                      </button>
                    </div>
                  ) : null}
                </AppCard>
              ))}
            </div>
          )}
          {hasMoreThanTenAlerts ? (
            <AppCard>Plus de 10 alertes actives. Utilisez "Voir toutes les alertes" via les filtres/historique.</AppCard>
          ) : null}
          {showAlertsHistory ? (
            <div className="ui-stack-sm" style={{ marginTop: 10 }}>
              {(alertsFilter === "actives" ? historyAlerts : filteredHistoryAlerts).slice(0, 50).map((alert) => (
                <AppCard key={alert.alert_key}>
                  <strong>
                    {alert.alert_date ?? "-"} - {alert.department ?? "-"} ({alert.status})
                  </strong>
                  <p style={{ margin: "6px 0 0", color: "#64748b" }}>{alert.message ?? "-"}</p>
                </AppCard>
              ))}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Détail journée sélectionnée" subtitle={selectedDate || "Sélectionnez une journée"}>
          <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Quarts planifiés</strong>
            {canConfigure ? (
              <button type="button" className="tagora-dark-action" onClick={() => setShowAddShift((c) => !c)}>
                <Plus size={14} /> Ajouter un quart
              </button>
            ) : (
              <span style={{ color: "#64748b", fontSize: 13 }}>Lecture seule</span>
            )}
          </div>

          {showAddShift && canConfigure ? (
            <AppCard style={{ marginBottom: 10 }}>
              <form onSubmit={handleCreateSchedule} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                <select className="tagora-input" value={form.employeeId} onChange={(e) => setForm((c) => ({ ...c, employeeId: e.target.value }))} required>
                  <option value="">Sélectionner un employé</option>
                  {selectedEmployees.map((employee) => <option key={employee.id} value={String(employee.id)}>{employee.nom ?? `Employé #${employee.id}`}</option>)}
                </select>
                <select className="tagora-input" value={form.department} onChange={(e) => setForm((c) => ({ ...c, department: e.target.value as Department }))}>
                  {DEFAULT_DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                <select className="tagora-input" value={form.location} onChange={(e) => setForm((c) => ({ ...c, location: e.target.value as Location }))}>
                  {(payload?.locations ?? DEFAULT_LOCATIONS).map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
                <input type="date" className="tagora-input" value={form.scheduledDate || selectedDate} onChange={(e) => setForm((c) => ({ ...c, scheduledDate: e.target.value }))} required />
                <input type="time" className="tagora-input" value={form.startTime} onChange={(e) => setForm((c) => ({ ...c, startTime: e.target.value }))} required />
                <input type="time" className="tagora-input" value={form.endTime} onChange={(e) => setForm((c) => ({ ...c, endTime: e.target.value }))} required />
                <input type="text" className="tagora-input" value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Optionnel" />
                <button type="submit" className="tagora-dark-action" disabled={saving}>{saving ? "Ajout..." : "Ajouter"}</button>
              </form>
            </AppCard>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            {selectedDaySchedules.length === 0 ? (
              <AppCard>Aucun quart planifié pour cette journée.</AppCard>
            ) : (
              selectedDaySchedules.map((row) => (
                <AppCard key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <strong>{row.employeeName}</strong>
                    <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                      {row.department} - {row.location} - {row.start_time} à {row.end_time}
                    </p>
                    {row.warnings.length > 0 ? (
                      <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#b45309" }}>
                        {row.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    ) : null}
                  </div>
                  {canConfigure ? (
                    <button type="button" className="tagora-dark-outline-action" onClick={() => void handleDeleteShift(row.id)} title="Retirer ce quart">
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </AppCard>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  padding: "10px 8px",
  fontSize: 13,
  color: "#334155",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #f1f5f9",
  padding: "10px 8px",
  verticalAlign: "top",
};
