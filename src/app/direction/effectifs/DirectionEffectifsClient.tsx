"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CalendarRange,
  Clock,
  LayoutDashboard,
  LayoutGrid,
  Palmtree,
  Truck,
  UserCheck,
} from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import StatusBadge from "@/app/components/ui/StatusBadge";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import TagoraStatCard from "@/app/components/TagoraStatCard";
import type { TagoraStatTone } from "@/app/components/tagora-stat-tone";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getHomePathForRole } from "@/app/lib/auth/roles";
import {
  EFFECTIFS_DEPARTMENT_ENTRIES,
  departmentLabelFromKey,
  departmentMatchesCompany,
  isValidDynamicDepartmentKeySlug,
  slugifyDepartmentName,
  type EffectifsCompanyKey,
} from "@/app/lib/effectifs-departments.shared";
import { buildPlannedDeptDayCell } from "@/app/lib/effectifs-planned-day.shared";
import {
  buildApprovedOverrideMap,
  listRequestDates,
  scheduleRequestStatusLabel,
  scheduleRequestTypeLabel,
  type EffectifsScheduleRequest,
} from "@/app/lib/effectifs-schedule-request.shared";
import { EFFECTIFS_CALENDAR_EXCEPTION_TYPES } from "@/app/lib/effectifs-calendar-exception.shared";
import type {
  DirectionEffectifsPayload,
  EffectifsCoverageCategory,
  EffectifsCoverageRow,
  EffectifsDepartment,
  EffectifsDepartmentKey,
  EffectifsEmployee,
} from "@/app/lib/effectifs-payload.shared";
import { supabase } from "@/app/lib/supabase/client";
import DirectionEffectifsMonthCalendar from "./DirectionEffectifsMonthCalendar";
import DirectionEffectifsWeekCoverage from "./DirectionEffectifsWeekCoverage";
import {
  addDaysIso,
  buildPriorityGaps,
  enumerateMonthDates,
  effectifsWeekdayIndexFromIso,
  monthBounds,
  todayIsoLocal,
  type PriorityGap,
} from "./effectifs-calendar-shared";

type MainTab = "month" | "week" | "operational" | "requests" | "config";

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Lundi" },
  { value: 1, label: "Mardi" },
  { value: 2, label: "Mercredi" },
  { value: 3, label: "Jeudi" },
  { value: 4, label: "Vendredi" },
  { value: 5, label: "Samedi" },
  { value: 6, label: "Dimanche" },
];

type ClosedRuleMode = "enterprise" | "company" | "department" | "location";
const EFFECTIFS_CLOSED_MODE_OPTIONS: Array<{ value: ClosedRuleMode; label: string }> = [
  { value: "enterprise", label: "Toute l’entreprise" },
  { value: "company", label: "Par compagnie" },
  { value: "department", label: "Par département" },
  { value: "location", label: "Par emplacement" },
];

const EFFECTIFS_LOCATION_OPTIONS = [
  { value: "oliem", label: "Oliem" },
  { value: "titan", label: "Titan" },
  { value: "entrepot", label: "Entrepôt" },
  { value: "route", label: "Route" },
  { value: "teletravail", label: "Télétravail" },
  { value: "autre", label: "Autre" },
] as const;

type ClosedRuleScope = "company" | "department" | "location";
type ClosedRuleForm = {
  scope: ClosedRuleScope;
  companyKey: "all" | "oliem_solutions" | "titan_produits_industriels";
  departmentKey: string;
  locationKey: string;
  days: number[];
  active: boolean;
};

/**
 * Version locale de `EffectifsDepartment` incluant l'`id` SQL (quand la table
 * `effectifs_departments` est disponible). `id === null` pour les entrées
 * fallback servies depuis `EFFECTIFS_DEPARTMENT_ENTRIES`.
 */
type DirectoryDepartment = EffectifsDepartment & { id: string | null };

function categoryStyle(cat: EffectifsCoverageCategory): {
  bg: string;
  color: string;
} {
  switch (cat) {
    case "couvert":
      return { bg: "rgba(16,185,129,0.12)", color: "#047857" };
    case "surplus":
      return { bg: "rgba(59,130,246,0.12)", color: "#1d4ed8" };
    case "manque":
      return { bg: "rgba(239,68,68,0.12)", color: "#b91c1c" };
    case "partielle":
      return { bg: "rgba(245,158,11,0.15)", color: "#b45309" };
    case "inactive":
      return { bg: "rgba(100,116,139,0.15)", color: "#475569" };
    case "aucune_requise":
    default:
      return { bg: "rgba(148,163,184,0.15)", color: "#475569" };
  }
}

function dayCell(d: {
  active: boolean;
  startLocal: string | null;
  endLocal: string | null;
  plannedHours: number | null;
}): string {
  if (!d.active) return "Congé";
  if (d.startLocal && d.endLocal) {
    const prev =
      d.plannedHours != null && d.plannedHours > 0
        ? ` · ${d.plannedHours}h prév.`
        : "";
    return `${d.startLocal} – ${d.endLocal}${prev}`;
  }
  return "Quart";
}

type NewWindowForm = {
  company_key: "all" | "oliem_solutions" | "titan_produits_industriels";
  department_key: EffectifsDepartmentKey;
  location_key: string;
  location_label: string;
  weekday: number;
  start_local: string;
  end_local: string;
  min_employees: number;
  active: boolean;
};

type LivePresenceRow = {
  employeeId: number | null;
  employee_id?: number | null;
  fullName?: string | null;
  currentState?: string | null;
  companyName?: string | null;
};

const defaultNewForm = (): NewWindowForm => ({
  company_key: "all",
  department_key: "showroom_oliem",
  location_key: "principal",
  location_label: "",
  weekday: 0,
  start_local: "09:00",
  end_local: "17:00",
  min_employees: 1,
  active: true,
});

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function priorityGapTone(g: PriorityGap): "critical" | "warning" {
  const low = g.summary.trim().toLowerCase();
  if (g.severity >= 10 || low.includes("aucun assign")) return "critical";
  return "warning";
}

function formatPrioritySummaryLine(g: PriorityGap): string {
  const t = g.summary.trim();
  if (/aucun assign/i.test(t)) return "Aucun assigné";
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type PriorityGroupLine = {
  id: string;
  departmentLabel: string;
  departmentKey: EffectifsDepartmentKey;
  startLocal: string;
  endLocal: string;
  summaryLine: string;
  tone: ReturnType<typeof priorityGapTone>;
  dates: string[];
  gaps: PriorityGap[];
};

/** Regroupe les écarts identiques (même département, plage, libellé) sur plusieurs jours — affichage uniquement. */
function mergePriorityGapsToGroups(list: PriorityGap[]): PriorityGroupLine[] {
  const map = new Map<string, PriorityGap[]>();
  for (const g of list) {
    const sum = formatPrioritySummaryLine(g);
    const key = `${g.departmentKey}|${g.startLocal}|${g.endLocal}|${sum}`;
    const arr = map.get(key) ?? [];
    arr.push(g);
    map.set(key, arr);
  }
  const out: PriorityGroupLine[] = [];
  for (const [key, gaps] of map) {
    if (gaps.length === 0) continue;
    const sortedDates = [...new Set(gaps.map((x) => x.date))].sort();
    const template = gaps[0]!;
    const tone: ReturnType<typeof priorityGapTone> = gaps.some(
      (g) => priorityGapTone(g) === "critical"
    )
      ? "critical"
      : "warning";
    out.push({
      id: key,
      departmentLabel: template.departmentLabel,
      departmentKey: template.departmentKey,
      startLocal: template.startLocal,
      endLocal: template.endLocal,
      summaryLine: formatPrioritySummaryLine(template),
      tone,
      dates: sortedDates,
      gaps,
    });
  }
  return out;
}

function sortPriorityGroups(
  groups: PriorityGroupLine[],
  todayIso: string,
  tomorrowIso: string
): PriorityGroupLine[] {
  const score = (g: PriorityGroupLine) => {
    const tier = g.dates.includes(todayIso) ? 0 : g.dates.includes(tomorrowIso) ? 1 : 2;
    const crit = g.tone === "critical" ? 0 : 1;
    const minDate = g.dates[0] ?? "";
    return [tier, crit, minDate, g.departmentLabel] as const;
  };
  return [...groups].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i]! < sb[i]!) return -1;
      if (sa[i]! > sb[i]!) return 1;
    }
    return 0;
  });
}

function groupDetailSection(
  g: PriorityGroupLine,
  todayIso: string,
  tomorrowIso: string
): "today" | "tomorrow" | "week" {
  if (g.dates.includes(todayIso)) return "today";
  if (g.dates.includes(tomorrowIso)) return "tomorrow";
  return "week";
}

function locationLabelForGap(payload: DirectionEffectifsPayload, gap: PriorityGap): string | null {
  const row = payload.coverage.find(
    (r) => r.windowId === gap.windowId && r.departmentKey === gap.departmentKey
  );
  const s = row?.locationLabel?.trim();
  return s || null;
}

function formatShortFrDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" });
}

function hhmmNowLocal(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function isWithinRange(hhmm: string, start: string, end: string): boolean {
  return hhmm >= start && hhmm < end;
}

function requestPeriodLabel(req: EffectifsScheduleRequest): string {
  if (req.requestedDate) return req.requestedDate;
  if (req.requestedStartDate && req.requestedEndDate) {
    return `${req.requestedStartDate} → ${req.requestedEndDate}`;
  }
  return "—";
}

function pendingRequestImpactHint(
  req: EffectifsScheduleRequest,
  payload: DirectionEffectifsPayload
): string {
  if (req.status !== "pending") return "";
  const primaryDate = req.requestedDate ?? req.requestedStartDate ?? null;
  if (!primaryDate) return "Aucun impact critique automatique détecté.";
  if (req.requestType === "day_off" || req.requestType === "unavailable") {
    const wd = effectifsWeekdayIndexFromIso(primaryDate);
    const rows = payload.coverage.filter(
      (c) =>
        c.weekday === wd &&
        c.scheduledEmployees.some((e) => e.id === req.employeeId) &&
        (req.targetDepartmentKey == null || req.targetDepartmentKey === c.departmentKey)
    );
    if (
      rows.some(
        (r) =>
          r.scheduledEmployees.length === 1 && r.scheduledEmployees[0]?.id === req.employeeId
      )
    ) {
      return "Attention : cet employé est seul planifié sur au moins une plage ce jour — risque de manque si la demande est approuvée.";
    }
  }
  if (req.requestType === "leave_early" || req.requestType === "start_later") {
    return "Une approbation peut réduire la couverture sur une partie de la plage — vérifier le calendrier prévu.";
  }
  if (req.requestType === "vacation") {
    return "Une approbation retire l’employé de la couverture sur toute la période.";
  }
  if (req.requestType === "partial_absence" || req.requestType === "late_arrival") {
    return "Une approbation peut créer un manque ponctuel sur la plage concernée.";
  }
  return "Aucun impact critique automatique détecté.";
}

type DirectionEffectifsClientProps = {
  /** Page /employe/effectifs : force lecture seule côté UI. */
  readOnly?: boolean;
};

export default function DirectionEffectifsClient({
  readOnly = false,
}: DirectionEffectifsClientProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, role, loading: accessLoading } = useCurrentAccess();
  const homePath = readOnly
    ? "/employe/dashboard"
    : role
      ? getHomePathForRole(role)
      : "/direction/dashboard";

  const [mainTab, setMainTab] = useState<MainTab>("month");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [detailPanel, setDetailPanel] = useState<{
    departmentKey: EffectifsDepartmentKey;
    date: string;
  } | null>(null);
  const [expandedPriorityKey, setExpandedPriorityKey] = useState<string | null>(null);
  const [payload, setPayload] = useState<DirectionEffectifsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [newForm, setNewForm] = useState<NewWindowForm>(defaultNewForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<NewWindowForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [calExSaving, setCalExSaving] = useState(false);
  const [calExForm, setCalExForm] = useState(() => ({
    date: todayIsoLocal(),
    title: "",
    type: "holiday",
    is_closed: true,
    department_key: "",
    location: "",
    start_time: "",
    end_time: "",
    notes: "",
  }));
  const [coverageFilterDept, setCoverageFilterDept] = useState<string>("all");
  const [coverageFilterDay, setCoverageFilterDay] = useState<string>("all");
  const [coverageFilterActiveOnly, setCoverageFilterActiveOnly] = useState(false);
  const [operationalDate, setOperationalDate] = useState(() => todayIsoLocal());
  const [liveBoard, setLiveBoard] = useState<LivePresenceRow[]>([]);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [regularClosedDays, setRegularClosedDays] = useState<number[]>([5, 6]);
  const [closedRuleMode, setClosedRuleMode] = useState<ClosedRuleMode>("enterprise");
  const [closedRuleForm, setClosedRuleForm] = useState<ClosedRuleForm>({
    scope: "company",
    companyKey: "all",
    departmentKey: "",
    locationKey: "",
    days: [5, 6],
    active: true,
  });
  const [selectedCompany, setSelectedCompany] = useState<
    "all" | "oliem_solutions" | "titan_produits_industriels"
  >("all");
  const [viewCompany, setViewCompany] = useState<
    "comparative" | "all" | "oliem_solutions" | "titan_produits_industriels"
  >("comparative");
  const [requestFilter, setRequestFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "leave" | "vacation" | "late" | "partial" | "week" | "month"
  >("all");
  const [directoryDepartments, setDirectoryDepartments] = useState<
    DirectoryDepartment[]
  >(() =>
    EFFECTIFS_DEPARTMENT_ENTRIES.map((entry) => ({
      id: null,
      key: entry.key,
      label: entry.label,
      sortOrder: entry.sortOrder,
      companyKey: entry.companyKey,
      locationKey: entry.locationKey,
      active: entry.active,
    }))
  );
  const [directoryTablePresent, setDirectoryTablePresent] =
    useState<boolean>(true);
  const [directoryEditingId, setDirectoryEditingId] = useState<string | null>(
    null
  );
  const [directoryEditDraft, setDirectoryEditDraft] = useState<{
    label: string;
    companyKey: EffectifsCompanyKey;
    locationKey: string;
    sortOrder: number;
    active: boolean;
  } | null>(null);
  const [directoryCompanyFilter, setDirectoryCompanyFilter] = useState<
    "all" | "oliem_solutions" | "titan_produits_industriels"
  >("all");
  const [directoryActiveOnly, setDirectoryActiveOnly] = useState(false);
  const [addDepartmentOpen, setAddDepartmentOpen] = useState(false);
  const [newDeptKeyTouched, setNewDeptKeyTouched] = useState(false);
  const [newDeptForm, setNewDeptForm] = useState<{
    label: string;
    department_key: string;
    companyKey: EffectifsCompanyKey;
    locationKey: string;
    sortOrder: number;
    active: boolean;
  }>({
    label: "",
    department_key: "",
    companyKey: "all",
    locationKey: "",
    sortOrder: 100,
    active: true,
  });

  const [pendingScheduleRequestsCount, setPendingScheduleRequestsCount] = useState(0);

  const canEditOps = !readOnly && Boolean(payload?.meta.canEditCoverageWindows);

  const loadEffectifs = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      setMessage("Session expirée. Reconnectez-vous.");
      setMessageType("error");
      setPayload(null);
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/direction/effectifs?company=${selectedCompany}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? `Erreur ${res.status}`);
      setMessageType("error");
      setPayload(null);
      setLoading(false);
      return;
    }

    const data = (await res.json()) as DirectionEffectifsPayload;
    setPayload(data);
    setRegularClosedDays(
      Array.from(
        new Set(
          (data.regularClosedDays ?? [])
            .filter((d) => d.active && d.scope === "company")
            .map((d) => d.dayOfWeek)
        )
      ).sort((a, b) => a - b)
    );
    setLoading(false);
  }, [selectedCompany]);

  useEffect(() => {
    if (accessLoading || !user) {
      return;
    }
    void loadEffectifs();
  }, [accessLoading, user, loadEffectifs]);

  const loadLivePresence = useCallback(async () => {
    if (!user) return;
    setLiveRefreshing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLiveBoard([]);
        return;
      }
      const res = await fetch("/api/direction/horodateur/live", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setLiveBoard([]);
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { board?: LivePresenceRow[] }
        | null;
      setLiveBoard(Array.isArray(body?.board) ? body!.board : []);
    } finally {
      setLiveRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (accessLoading || user) {
      return;
    }
    router.replace(readOnly ? "/employe/login" : "/direction/login");
  }, [accessLoading, user, router, readOnly]);

  useEffect(() => {
    if (canEditOps || (mainTab !== "requests" && mainTab !== "config")) {
      return;
    }
    setMainTab("month");
  }, [canEditOps, mainTab]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!canEditOps) return;
    if (tab === "schedule-requests" || tab === "requests") {
      setMainTab("requests");
    }
  }, [searchParams, canEditOps]);

  useEffect(() => {
    if (readOnly || !canEditOps || accessLoading) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const res = await fetch("/api/direction/effectifs/pending-schedule-requests-count", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { count?: unknown };
        const n = Number(body.count);
        if (!cancelled) {
          setPendingScheduleRequestsCount(
            Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
          );
        }
      } catch {
        if (!cancelled) setPendingScheduleRequestsCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readOnly, canEditOps, accessLoading, payload]);

  useEffect(() => {
    if (accessLoading || !user) return;
    void loadLivePresence();
    const timer = window.setInterval(() => {
      void loadLivePresence();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [accessLoading, user, loadLivePresence]);

  const coverageByDepartment = useMemo(() => {
    const map = new Map<string, DirectionEffectifsPayload["coverage"]>();
    if (!payload) return map;
    for (const row of payload.coverage) {
      const list = map.get(row.departmentKey) ?? [];
      list.push(row);
      map.set(row.departmentKey, list);
    }
    return map;
  }, [payload]);

  const employeesByDepartment = useMemo(() => {
    const map = new Map<string, DirectionEffectifsPayload["employees"]>();
    if (!payload) return map;
    const push = (deptKey: string, emp: EffectifsEmployee) => {
      const list = map.get(deptKey) ?? [];
      list.push(emp);
      map.set(deptKey, list);
    };
    for (const emp of payload.employees) {
      const keys = new Set<EffectifsDepartmentKey>();
      if (emp.departmentKey) keys.add(emp.departmentKey);
      for (const s of emp.secondaryDepartmentKeys) keys.add(s);
      if (keys.size === 0) {
        push("_unassigned", emp);
      } else {
        for (const k of keys) push(k, emp);
      }
    }
    return map;
  }, [payload]);

  const todayIso = useMemo(() => todayIsoLocal(), []);

  const approvedOverrides = useMemo(() => {
    if (!payload) return undefined;
    return buildApprovedOverrideMap(
      payload.scheduleRequests,
      (empId, wd) => {
        const s = payload.schedules.find((x) => x.employeeId === empId);
        const day = s?.days.find((d) => d.weekday === wd);
        return {
          active: day?.active ?? false,
          start: day?.startLocal ?? null,
          end: day?.endLocal ?? null,
        };
      },
      effectifsWeekdayIndexFromIso
    );
  }, [payload]);

  const monthSummary = useMemo(() => {
    if (!payload) return null;
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const { start, end } = monthBounds(y, m);
    const dates = enumerateMonthDates(y, m);
    let daysWithManque = 0;
    const deptAlert = new Set<string>();
    let manqueWindows = 0;
    for (const date of dates) {
      let dayHasManque = false;
      for (const dept of payload.departments) {
        const cell = buildPlannedDeptDayCell({
          departmentKey: dept.key,
          date,
          windows: payload.coverageWindows,
          employees: payload.employees,
          schedules: payload.schedules,
          exceptions: payload.calendarExceptions,
          approvedOverrides,
          templateCoverageRows: payload.coverage,
        });
        if (cell.aggregateCategory === "manque") {
          dayHasManque = true;
          deptAlert.add(dept.key);
          manqueWindows += 1;
        } else if (cell.aggregateCategory === "partielle") {
          deptAlert.add(dept.key);
        }
      }
      if (dayHasManque) daysWithManque += 1;
    }
    const deliveryMap = new Map(payload.deliveryNeeds.map((d) => [d.date, d.count]));
    let livraisonsSansLivreur = 0;
    for (const date of dates) {
      const n = deliveryMap.get(date) ?? 0;
      if (n === 0) continue;
      const cell = buildPlannedDeptDayCell({
        departmentKey: "livreur",
        date,
        windows: payload.coverageWindows,
        employees: payload.employees,
        schedules: payload.schedules,
        exceptions: payload.calendarExceptions,
        approvedOverrides,
        templateCoverageRows: payload.coverage,
      });
      if (
        cell.aggregateCategory === "manque" ||
        cell.aggregateCategory === "partielle"
      ) {
        livraisonsSansLivreur += n;
      }
    }
    const criticalToday = buildPriorityGaps(
      payload.coverage,
      [todayIso],
      payload.calendarExceptions
    ).length;

    return {
      rangeLabel: `${start} → ${end}`,
      daysWithManque,
      deptAlerts: deptAlert.size,
      manqueWindows,
      criticalToday,
      livraisonsSansLivreur,
    };
  }, [payload, calendarMonth, todayIso, approvedOverrides]);

  const absencesAndVacations = useMemo(() => {
    if (!payload) {
      return {
        today: [] as EffectifsScheduleRequest[],
        week: [] as EffectifsScheduleRequest[],
        upcoming: [] as EffectifsScheduleRequest[],
        kpi: {
          leaveToday: 0,
          vacationToday: 0,
          leaveWeek: 0,
          vacationWeek: 0,
          pending: 0,
          impacting: 0,
        },
      };
    }
    const weekEnd = addDaysIso(todayIso, 6);
    const today: EffectifsScheduleRequest[] = [];
    const week: EffectifsScheduleRequest[] = [];
    const upcoming: EffectifsScheduleRequest[] = [];
    let leaveToday = 0;
    let vacationToday = 0;
    let leaveWeek = 0;
    let vacationWeek = 0;
    let pending = 0;
    let impacting = 0;
    for (const req of payload.scheduleRequests) {
      const dates = listRequestDates(req);
      const overlapsToday = dates.includes(todayIso);
      const overlapsWeek = dates.some((d) => d >= todayIso && d <= weekEnd);
      const startsAfterWeek = (req.requestedStartDate ?? req.requestedDate ?? "9999-12-31") > weekEnd;
      if (req.status === "pending") pending += 1;
      if (
        req.status === "pending" &&
        ["day_off", "vacation", "partial_absence", "late_arrival", "leave_early", "start_later"].includes(
          req.requestType
        )
      ) {
        impacting += 1;
      }
      if (overlapsToday) today.push(req);
      if (overlapsWeek) week.push(req);
      if (startsAfterWeek) upcoming.push(req);
      if (req.status === "approved" && overlapsToday && req.requestType === "day_off") leaveToday += 1;
      if (req.status === "approved" && overlapsToday && req.requestType === "vacation") vacationToday += 1;
      if (req.status === "approved" && overlapsWeek && req.requestType === "day_off") leaveWeek += 1;
      if (req.status === "approved" && overlapsWeek && req.requestType === "vacation") vacationWeek += 1;
    }
    return {
      today: today.slice(0, 20),
      week: week.slice(0, 30),
      upcoming: upcoming.slice(0, 30),
      kpi: { leaveToday, vacationToday, leaveWeek, vacationWeek, pending, impacting },
    };
  }, [payload, todayIso]);

  const filteredScheduleRequests = useMemo(() => {
    if (!payload) return [];
    const list = payload.scheduleRequests;
    if (requestFilter === "all") return list;
    if (requestFilter === "pending" || requestFilter === "approved" || requestFilter === "rejected") {
      return list.filter((r) => r.status === requestFilter);
    }
    if (requestFilter === "leave") return list.filter((r) => r.requestType === "day_off");
    if (requestFilter === "vacation") return list.filter((r) => r.requestType === "vacation");
    if (requestFilter === "late")
      return list.filter((r) => r.requestType === "late_arrival" || r.requestType === "start_later");
    if (requestFilter === "partial") return list.filter((r) => r.requestType === "partial_absence");
    if (requestFilter === "week") {
      const end = addDaysIso(todayIso, 6);
      return list.filter((r) =>
        listRequestDates(r).some((d) => d >= todayIso && d <= end)
      );
    }
    if (requestFilter === "month") {
      const monthKey = todayIso.slice(0, 7);
      return list.filter((r) => listRequestDates(r).some((d) => d.startsWith(monthKey)));
    }
    return list;
  }, [payload, requestFilter, todayIso]);

  const priorityBlocks = useMemo(() => {
    if (!payload) {
      return { today: [] as ReturnType<typeof buildPriorityGaps>, tomorrow: [], week: [] };
    }
    const t = todayIso;
    const tomorrow = addDaysIso(t, 1);
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      weekDates.push(addDaysIso(t, i));
    }
    const ex = payload.calendarExceptions;
    return {
      today: buildPriorityGaps(payload.coverage, [t], ex),
      tomorrow: buildPriorityGaps(payload.coverage, [tomorrow], ex),
      week: buildPriorityGaps(payload.coverage, weekDates, ex),
    };
  }, [payload, todayIso]);

  const mainTabItems = useMemo(() => {
    const items: (readonly [MainTab, string])[] = [
      ["month", "Calendrier mensuel"],
      ["week", "Vue hebdomadaire"],
      ["operational", "Vue opérationnelle"],
    ];
    if (canEditOps) {
      items.push(["requests", "Demandes d’horaire"]);
      items.push(["config", "Configuration"]);
    }
    return items;
  }, [canEditOps]);

  const filteredCoverageWindows = useMemo(() => {
    if (!payload) return [];
    return payload.coverageWindows.filter((w) => {
      if (coverageFilterDept !== "all" && w.departmentKey !== coverageFilterDept) return false;
      if (coverageFilterDay !== "all" && String(w.weekday) !== coverageFilterDay) return false;
      if (coverageFilterActiveOnly && !w.active) return false;
      return true;
    });
  }, [payload, coverageFilterDept, coverageFilterDay, coverageFilterActiveOnly]);

  const employeeById = useMemo(() => {
    const map = new Map<number, EffectifsEmployee>();
    if (!payload) return map;
    for (const e of payload.employees) map.set(e.id, e);
    return map;
  }, [payload]);

  const operationalDepartmentCards = useMemo(() => {
    if (!payload) return [];
    return payload.departments.map((dept) => {
      const cell = buildPlannedDeptDayCell({
        departmentKey: dept.key,
        date: operationalDate,
        windows: payload.coverageWindows,
        employees: payload.employees,
        schedules: payload.schedules,
        exceptions: payload.calendarExceptions,
        approvedOverrides,
        templateCoverageRows: payload.coverage,
      });
      const uniqueAssigned = Array.from(
        new Map(cell.rows.flatMap((r) => r.scheduledEmployees.map((e) => [e.id, e] as const))).values()
      );
      const required = cell.rows.reduce((sum, r) => sum + r.required, 0);
      const planned = cell.rows.reduce((sum, r) => sum + r.staffed, 0);
      const manque = Math.max(0, required - planned);
      return {
        dept,
        cell,
        required,
        planned,
        manque,
        uniqueAssigned,
      };
    });
  }, [payload, operationalDate, approvedOverrides]);

  const livePresenceByDepartment = useMemo(() => {
    if (!payload) {
      return {
        byDept: new Map<string, {
          requiredNow: number;
          plannedNow: number;
          presentNow: number;
          absentNow: number;
          approvedLeave: number;
          horsPoste: number;
          pauseDinner: number;
          status: string;
          presentEmployees: { id: number; nom: string | null; state: string }[];
          absentEmployees: { id: number; nom: string | null }[];
          outsideEmployees: { id: number; nom: string | null; state: string }[];
        }>(),
        summary: {
          presentNow: 0,
          coveredNow: 0,
          manqueNow: 0,
          outsideNow: 0,
          pauseNow: 0,
          nonAssignedPresent: 0,
          livraisonsSansLivreur: 0,
        },
      };
    }
    const now = hhmmNowLocal();
    const today = todayIso;
    const byId = new Map<number, EffectifsEmployee>();
    payload.employees.forEach((e) => byId.set(e.id, e));
    const presentStates = new Set(["en_quart", "en_pause", "en_diner"]);
    const pausedStates = new Set(["en_pause", "en_diner"]);
    const presentRows = liveBoard.filter((r) => {
      const state = (r.currentState ?? "").toString();
      return presentStates.has(state);
    });
    const presentById = new Map<number, LivePresenceRow>();
    presentRows.forEach((r) => {
      const id = Number(r.employeeId ?? r.employee_id ?? NaN);
      if (Number.isFinite(id)) presentById.set(id, r);
    });

    const result = new Map<string, {
      requiredNow: number;
      plannedNow: number;
      presentNow: number;
      absentNow: number;
      approvedLeave: number;
      horsPoste: number;
      pauseDinner: number;
      status: string;
      presentEmployees: { id: number; nom: string | null; state: string }[];
      absentEmployees: { id: number; nom: string | null }[];
      outsideEmployees: { id: number; nom: string | null; state: string }[];
    }>();
    let coveredNow = 0;
    let manqueNow = 0;
    let outsideNow = 0;
    let pauseNow = 0;
    let nonAssignedPresent = 0;
    const approvedLeaveToday = new Set<number>();
    for (const req of payload.scheduleRequests) {
      if (req.status !== "approved") continue;
      if (!["day_off", "vacation", "unavailable"].includes(req.requestType)) continue;
      if (listRequestDates(req).includes(today)) approvedLeaveToday.add(req.employeeId);
    }

    for (const dept of payload.departments) {
      const rowsNow = payload.coverage.filter(
        (r) =>
          r.departmentKey === dept.key &&
          r.referenceDate === today &&
          isWithinRange(now, r.startLocal, r.endLocal) &&
          r.coverageCategory !== "inactive"
      );
      const requiredNow = rowsNow.reduce((s, r) => s + r.required, 0);
      const plannedIds = Array.from(
        new Set(rowsNow.flatMap((r) => r.scheduledEmployees.map((e) => e.id)))
      );
      const plannedNow = plannedIds.length;
      const presentEmployees = plannedIds
        .filter((id) => presentById.has(id))
        .map((id) => ({
          id,
          nom: byId.get(id)?.nom ?? null,
          state: String(presentById.get(id)?.currentState ?? "en_quart"),
        }));
      const absentEmployees = plannedIds
        .filter((id) => !presentById.has(id) && !approvedLeaveToday.has(id))
        .map((id) => ({ id, nom: byId.get(id)?.nom ?? null }));
      const approvedLeaveCount = plannedIds.filter((id) => approvedLeaveToday.has(id)).length;

      const outsideEmployees = presentRows
        .map((row) => {
          const id = Number(row.employeeId ?? row.employee_id ?? NaN);
          if (!Number.isFinite(id)) return null;
          const emp = byId.get(id);
          if (!emp) return null;
          const matchesPrimary = emp.departmentKey === dept.key;
          const matchesSecondary = emp.secondaryDepartmentKeys.includes(
            dept.key as EffectifsDepartmentKey
          );
          if (matchesPrimary || matchesSecondary) return null;
          const inPlanned = plannedIds.includes(id);
          if (!inPlanned) return null;
          return { id, nom: emp.nom ?? null, state: String(row.currentState ?? "en_quart") };
        })
        .filter((v): v is { id: number; nom: string | null; state: string } => v != null);

      const presentNow = presentEmployees.length;
      const absentNow = Math.max(0, plannedNow - presentNow);
      const horsPoste = outsideEmployees.length;
      const pauseDinner = presentEmployees.filter((e) => pausedStates.has(e.state)).length;
      let status = "Non requis";
      if (requiredNow > 0 && presentNow >= requiredNow) status = "Couvert";
      else if (requiredNow > 0 && presentNow < requiredNow) status = `Manque ${requiredNow - presentNow}`;
      if (requiredNow === 0 && presentNow > 0) status = "Présent non prévu";
      if (approvedLeaveCount > 0 && requiredNow > 0 && presentNow < requiredNow) {
        status = `Manque ${requiredNow - presentNow} (congé approuvé: ${approvedLeaveCount})`;
      }

      if (status === "Couvert") coveredNow += 1;
      if (status.startsWith("Manque")) manqueNow += 1;
      outsideNow += horsPoste;
      pauseNow += pauseDinner;

      result.set(dept.key, {
        requiredNow,
        plannedNow,
        presentNow,
        absentNow,
        approvedLeave: approvedLeaveCount,
        horsPoste,
        pauseDinner,
        status,
        presentEmployees,
        absentEmployees,
        outsideEmployees,
      });
    }

    presentRows.forEach((row) => {
      const id = Number(row.employeeId ?? row.employee_id ?? NaN);
      if (!Number.isFinite(id)) return;
      const emp = byId.get(id);
      if (!emp || !emp.departmentKey) nonAssignedPresent += 1;
    });

    const livreurState = result.get("livreur");
    const livraisonsToday = payload.deliveryNeeds.find((d) => d.date === today)?.count ?? 0;
    const livraisonsSansLivreur =
      livraisonsToday > 0 && (livreurState?.presentNow ?? 0) === 0 ? livraisonsToday : 0;

    return {
      byDept: result,
      summary: {
        presentNow: presentRows.length,
        coveredNow,
        manqueNow,
        outsideNow,
        pauseNow,
        nonAssignedPresent,
        livraisonsSansLivreur,
      },
    };
  }, [payload, liveBoard, todayIso]);

  async function authJsonHeaders(): Promise<HeadersInit> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function handleCreateWindow(event: React.FormEvent) {
    event.preventDefault();
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/direction/effectifs", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          company_key: newForm.company_key,
          department_key: newForm.department_key,
          location_key: newForm.location_key,
          location_label: newForm.location_label,
          weekday: newForm.weekday,
          start_local: newForm.start_local,
          end_local: newForm.end_local,
          min_employees: newForm.min_employees,
          active: newForm.active,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur création.");
        setMessageType("error");
        return;
      }
      setMessage("Plage ajoutée.");
      setMessageType("success");
      setNewForm(defaultNewForm());
      await loadEffectifs();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateWindow(id: string) {
    if (!editDraft || !payload?.meta.canEditCoverageWindows || readOnly) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/direction/effectifs/${id}`, {
        method: "PATCH",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          company_key: editDraft.company_key,
          start_local: editDraft.start_local,
          end_local: editDraft.end_local,
          min_employees: editDraft.min_employees,
          location_key: editDraft.location_key,
          location_label: editDraft.location_label,
          active: editDraft.active,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur mise à jour.");
        setMessageType("error");
        return;
      }
      setMessage("Plage mise à jour.");
      setMessageType("success");
      setEditingId(null);
      setEditDraft(null);
      await loadEffectifs();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteWindow(id: string) {
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    if (!window.confirm("Supprimer cette plage horaire ?")) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/direction/effectifs/${id}`, {
        method: "DELETE",
        headers: await authJsonHeaders(),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur suppression.");
        setMessageType("error");
        return;
      }
      setMessage("Plage supprimée.");
      setMessageType("success");
      setEditingId(null);
      setEditDraft(null);
      await loadEffectifs();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCalendarException(ev: React.FormEvent) {
    ev.preventDefault();
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    setCalExSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch("/api/direction/effectifs/calendar-exceptions", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          date: calExForm.date,
          title: calExForm.title,
          type: calExForm.type,
          is_closed: calExForm.is_closed,
          department_key: calExForm.department_key.trim() || null,
          location: calExForm.location.trim() || null,
          start_time: calExForm.start_time.trim() || null,
          end_time: calExForm.end_time.trim() || null,
          notes: calExForm.notes.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur enregistrement.");
        setMessageType("error");
        return;
      }
      setMessage("Journée spéciale enregistrée.");
      setMessageType("success");
      setCalExForm((f) => ({
        ...f,
        title: "",
        notes: "",
        start_time: "",
        end_time: "",
      }));
      await loadEffectifs();
    } finally {
      setCalExSaving(false);
    }
  }

  async function handleDeleteCalendarException(id: string) {
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    if (!window.confirm("Supprimer cette entrée du calendrier prévu ?")) return;
    setCalExSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`/api/direction/effectifs/calendar-exceptions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur suppression.");
        setMessageType("error");
        return;
      }
      setMessage("Entrée supprimée.");
      setMessageType("success");
      await loadEffectifs();
    } finally {
      setCalExSaving(false);
    }
  }

  async function handleReviewScheduleRequest(id: string, status: "approved" | "rejected") {
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    setCalExSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/direction/effectifs/schedule-requests/${id}`, {
        method: "PATCH",
        headers: await authJsonHeaders(),
        body: JSON.stringify({ status }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur.");
        setMessageType("error");
        return;
      }
      setMessage(status === "approved" ? "Demande approuvée." : "Demande refusée.");
      setMessageType("success");
      await loadEffectifs();
    } finally {
      setCalExSaving(false);
    }
  }

  async function handleSaveRegularClosedDays(next: number[]) {
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch("/api/direction/effectifs/regular-closed-days", {
        method: "PUT",
        headers: await authJsonHeaders(),
        body: JSON.stringify({ closedDays: next, company_key: selectedCompany }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur mise à jour jours fermés.");
        setMessageType("error");
        return;
      }
      setRegularClosedDays(next);
      setMessage("Jours fermés réguliers mis à jour.");
      setMessageType("success");
      await loadEffectifs();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveClosedRule(form: ClosedRuleForm) {
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch("/api/direction/effectifs/regular-closed-days", {
        method: "PUT",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          scope: form.scope,
          company_key: form.companyKey,
          department_key: form.scope === "department" ? form.departmentKey || null : null,
          location_key: form.scope === "location" ? form.locationKey || null : null,
          closedDays: form.days,
          active: form.active,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur mise à jour fermeture régulière.");
        setMessageType("error");
        return;
      }
      setMessage("Fermeture régulière enregistrée.");
      setMessageType("success");
      await loadEffectifs();
    } finally {
      setSaving(false);
    }
  }

  const groupedRegularClosedRules = useMemo(() => {
    const rows = payload?.regularClosedDays ?? [];
    const map = new Map<
      string,
      {
        scope: ClosedRuleScope;
        companyKey: "all" | "oliem_solutions" | "titan_produits_industriels";
        departmentKey: string | null;
        locationKey: string | null;
        days: number[];
      }
    >();
    for (const r of rows) {
      const key = `${r.scope}|${r.companyKey}|${r.departmentKey ?? ""}|${r.locationKey ?? ""}`;
      const current = map.get(key);
      if (!current) {
        map.set(key, {
          scope: r.scope,
          companyKey: r.companyKey,
          departmentKey: r.departmentKey ?? null,
          locationKey: r.locationKey ?? null,
          days: r.active ? [r.dayOfWeek] : [],
        });
      } else if (r.active) {
        current.days.push(r.dayOfWeek);
      }
    }
    return Array.from(map.values()).map((x) => ({
      ...x,
      days: Array.from(new Set(x.days)).sort((a, b) => a - b),
      active: x.days.length > 0,
    }));
  }, [payload?.regularClosedDays]);

  function startEdit(w: DirectionEffectifsPayload["coverageWindows"][number]) {
    setEditingId(w.id);
    setEditDraft({
      company_key: w.companyKey,
      department_key: w.departmentKey,
      location_key: w.locationKey,
      location_label: w.locationLabel,
      weekday: w.weekday,
      start_local: w.startLocal,
      end_local: w.endLocal,
      min_employees: w.minEmployees,
      active: w.active,
    });
  }

  const loadDirectoryDepartments = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/direction/effectifs/departments", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as {
        departments?: DirectoryDepartment[];
        tablePresent?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body) {
        return;
      }
      if (Array.isArray(body.departments) && body.departments.length > 0) {
        setDirectoryDepartments(body.departments);
      }
      setDirectoryTablePresent(body.tablePresent !== false);
    } catch {
      // Silently fall back to seeded defaults.
    }
  }, []);

  useEffect(() => {
    if (accessLoading || !user) return;
    void loadDirectoryDepartments();
  }, [accessLoading, user, loadDirectoryDepartments]);

  async function handleUpdateDirectoryDepartment(
    id: string,
    patch: {
      label?: string;
      companyKey?: EffectifsCompanyKey;
      locationKey?: string | null;
      sortOrder?: number;
      active?: boolean;
    }
  ) {
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/direction/effectifs/departments/${id}`, {
        method: "PATCH",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          label: patch.label,
          company_key: patch.companyKey,
          location_key:
            patch.locationKey === undefined
              ? undefined
              : patch.locationKey == null || patch.locationKey.trim() === ""
                ? null
                : patch.locationKey,
          sort_order: patch.sortOrder,
          active: patch.active,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur mise à jour département.");
        setMessageType("error");
        return;
      }
      setMessage("Département mis à jour.");
      setMessageType("success");
      setDirectoryEditingId(null);
      setDirectoryEditDraft(null);
      await loadDirectoryDepartments();
      await loadEffectifs();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDirectoryDepartment(id: string) {
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/direction/effectifs/departments/${id}`, {
        method: "DELETE",
        headers: await authJsonHeaders(),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        mode?: "deleted" | "deactivated";
        reason?: string;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur suppression département.");
        setMessageType("error");
        return;
      }
      if (body?.mode === "deactivated") {
        setMessage(
          body.reason ??
            "Département référencé ailleurs : désactivé au lieu d'être supprimé."
        );
        setMessageType("success");
      } else {
        setMessage("Département supprimé.");
        setMessageType("success");
      }
      await loadDirectoryDepartments();
      await loadEffectifs();
    } finally {
      setSaving(false);
    }
  }

  function resetNewDepartmentForm() {
    setNewDeptForm({
      label: "",
      department_key: "",
      companyKey: "all",
      locationKey: "",
      sortOrder: 100,
      active: true,
    });
    setNewDeptKeyTouched(false);
  }

  function openAddDepartmentModal() {
    resetNewDepartmentForm();
    setAddDepartmentOpen(true);
  }

  async function handleSubmitNewDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!payload?.meta.canEditCoverageWindows || readOnly) return;
    const label = newDeptForm.label.trim();
    const key = newDeptForm.department_key.trim().toLowerCase();
    if (!label) {
      setMessage("Le nom du département est obligatoire.");
      setMessageType("error");
      return;
    }
    if (!key || !isValidDynamicDepartmentKeySlug(key)) {
      setMessage(
        "Clé invalide : minuscules, chiffres et underscores seulement (ex. atelier_titan)."
      );
      setMessageType("error");
      return;
    }
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch("/api/direction/effectifs/departments", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          department_key: key,
          label,
          company_key: newDeptForm.companyKey,
          location_key: newDeptForm.locationKey.trim() || null,
          sort_order: newDeptForm.sortOrder,
          active: newDeptForm.active,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur création département.");
        setMessageType("error");
        return;
      }
      setMessage("Département ajouté.");
      setMessageType("success");
      setAddDepartmentOpen(false);
      resetNewDepartmentForm();
      await loadDirectoryDepartments();
      await loadEffectifs();
    } finally {
      setSaving(false);
    }
  }

  const visibleDirectoryDepartments = useMemo(() => {
    return directoryDepartments
      .filter((d) => {
        if (directoryActiveOnly && !d.active) return false;
        if (directoryCompanyFilter === "all") return true;
        return d.companyKey === "all" || d.companyKey === directoryCompanyFilter;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }, [directoryDepartments, directoryCompanyFilter, directoryActiveOnly]);

  if (accessLoading) {
    return <TagoraLoadingScreen isLoading message="Chargement…" fullScreen />;
  }

  if (!user) {
    return null;
  }

  return (
    <main
      className="tagora-app-shell"
      style={{ background: "linear-gradient(180deg, #e8eef6 0%, #f1f4fa 35%, #f6f8fc 100%)" }}
    >
      <div
        className="tagora-app-content ui-stack-lg mx-auto w-full max-w-[1500px] px-4 pb-12 pt-2 sm:px-6"
        style={{ minHeight: "100%" }}
      >
        <AuthenticatedPageHeader
          title="Effectifs et couverture"
          subtitle=""
          showNavigation={false}
          showUserIdentity
          compact
          actions={
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--ui-space-3)",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              {!canEditOps ? <StatusBadge label="Lecture seule" tone="info" /> : null}
              <Link
                href={homePath}
                className="tagora-dark-outline-action"
                style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center" }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <ArrowLeft size={16} aria-hidden />
                  Retour
                </span>
              </Link>
              {!!canEditOps ? (
                <Link
                  href="/direction/dashboard"
                  className="tagora-dark-action"
                  style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center" }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <LayoutDashboard size={16} aria-hidden />
                    Tableau de bord direction
                  </span>
                </Link>
              ) : null}
            </div>
          }
        />

        <div
          className="rounded-2xl border border-slate-200/70 bg-white/90 p-1.5 shadow-[0_10px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm"
          style={{ width: "100%" }}
        >
          <div
            role="tablist"
            aria-label="Vues effectifs"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {mainTabItems.map(([id, label]) => {
              const active = mainTab === id;
              const pendingBadge =
                id === "requests" && pendingScheduleRequestsCount > 0 ? pendingScheduleRequestsCount : 0;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMainTab(id)}
                  style={{
                    border: active ? "1px solid rgba(59,130,246,0.45)" : "1px solid transparent",
                    borderRadius: 14,
                    padding: "12px 18px",
                    fontWeight: 800,
                    fontSize: "0.84rem",
                    cursor: active ? "default" : "pointer",
                    background: active
                      ? "linear-gradient(180deg, rgba(239,246,255,0.95) 0%, rgba(255,255,255,1) 100%)"
                      : "transparent",
                    color: active ? "#1e3a8a" : "#475569",
                    boxShadow: active ? "0 2px 8px rgba(37,99,235,0.12)" : "none",
                    transition: "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{label}</span>
                    {pendingBadge > 0 ? (
                      <span
                        aria-label={`${pendingBadge} demande${pendingBadge > 1 ? "s" : ""} en attente`}
                        style={{
                          minWidth: 20,
                          height: 20,
                          padding: "0 6px",
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#ffffff",
                          background:
                            "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                          border: "1px solid rgba(127,29,29,0.22)",
                          flexShrink: 0,
                        }}
                      >
                        {pendingBadge > 99 ? "99+" : pendingBadge}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 12,
              paddingRight: 6,
            }}
          >
            {mainTab === "month" ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span className="ui-eyebrow" style={{ margin: 0 }}>
                  Affichage
                </span>
                {(
                  [
                    ["all", "Toutes"],
                    ["oliem_solutions", "Oliem"],
                    ["titan_produits_industriels", "Titan"],
                    ["comparative", "Comparatif Oliem / Titan"],
                  ] as const
                ).map(([key, label]) => {
                  const isActive = viewCompany === key;
                  return (
                    <button
                      key={`view-top-${key}`}
                      type="button"
                      onClick={() => setViewCompany(key)}
                      style={{
                        border: isActive
                          ? "1px solid rgba(59,130,246,0.5)"
                          : "1px solid #dbe4ee",
                        borderRadius: 999,
                        padding: "6px 12px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        background: isActive ? "rgba(59,130,246,0.14)" : "#fff",
                        color: isActive ? "#1e3a8a" : "#334155",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="ui-eyebrow" style={{ margin: 0 }}>
                Compagnie (données)
              </span>
              <select
                className="tagora-input"
                value={selectedCompany}
                onChange={(e) =>
                  setSelectedCompany(
                    (e.target.value as "all" | "oliem_solutions" | "titan_produits_industriels")
                  )
                }
                style={{ minWidth: 210 }}
              >
                <option value="all">Toutes</option>
                <option value="oliem_solutions">Oliem Solutions</option>
                <option value="titan_produits_industriels">Titan Produits Industriels</option>
              </select>
            </label>
          </div>
        </div>

        {message ? (
          <FeedbackMessage message={message} type={messageType ?? "error"} />
        ) : null}

        {loading || !payload ? (
          <p className="ui-eyebrow" style={{ margin: 0 }}>
            Chargement des données effectifs…
          </p>
        ) : (
          <>
            <AppCard className="rounded-2xl ui-stack-sm" tone="muted">
              <p
                style={{
                  margin: 0,
                  fontSize: "0.9rem",
                  color: "#334155",
                  lineHeight: 1.55,
                }}
              >
                <strong>Référence horaire prévu :</strong>{" "}
                {payload.meta.plannedTimeReferenceNote}
              </p>
            </AppCard>
            {mainTab === "month" ? (
              <div className="ui-stack-lg" style={{ display: "grid", gap: 24 }}>
                {payload.meta.windowsLoadError ? (
                  <FeedbackMessage
                    message={`Fenêtres de couverture : ${payload.meta.windowsLoadError}`}
                    type="error"
                  />
                ) : null}
                {!payload.meta.coverageWindowsConfigured ? (
                  <AppCard className="rounded-2xl ui-stack-sm" tone="muted">
                    <p style={{ margin: 0, color: "#92400e" }}>
                      Les plages « heures à couvrir » ne sont pas encore configurées en base.
                      {!canEditOps ? (
                        <>
                          {" "}
                          Contactez la direction pour finaliser la configuration.
                        </>
                      ) : (
                        <>
                          {" "}
                          Ouvrez l&apos;onglet <strong>Configuration</strong> pour la marche à
                          suivre.
                        </>
                      )}
                    </p>
                    {!!canEditOps ? (
                      <SecondaryButton type="button" onClick={() => setMainTab("config")}>
                        Aller à la configuration
                      </SecondaryButton>
                    ) : null}
                  </AppCard>
                ) : null}
                {monthSummary ? (
                  <div className="tagora-stat-grid">
                    {(
                      [
                        {
                          k: "present-now",
                          t: "Présents maintenant",
                          v: String(livePresenceByDepartment.summary.presentNow),
                          tone: "green" as TagoraStatTone,
                          Icon: UserCheck,
                        },
                        {
                          k: "miss-now",
                          t: "Postes en manque maintenant",
                          v: String(livePresenceByDepartment.summary.manqueNow),
                          tone: "red",
                          Icon: AlertTriangle,
                        },
                        {
                          k: "plages",
                          t: "Heures non couvertes",
                          v: String(monthSummary.manqueWindows),
                          tone: "orange",
                          Icon: LayoutGrid,
                        },
                        {
                          k: "liv",
                          t: "Livraisons sans livreur",
                          v: String(
                            Math.max(
                              monthSummary.livraisonsSansLivreur,
                              livePresenceByDepartment.summary.livraisonsSansLivreur
                            )
                          ),
                          tone: "orange",
                          Icon: Truck,
                        },
                        {
                          k: "leave-today",
                          t: "En congé aujourd’hui",
                          v: String(absencesAndVacations.kpi.leaveToday),
                          tone: "slate",
                          Icon: Calendar,
                        },
                        {
                          k: "vacation-today",
                          t: "En vacances aujourd’hui",
                          v: String(absencesAndVacations.kpi.vacationToday),
                          tone: "cyan",
                          Icon: Palmtree,
                        },
                        {
                          k: "leave-week",
                          t: "Congé cette semaine",
                          v: String(absencesAndVacations.kpi.leaveWeek),
                          tone: "slate",
                          Icon: CalendarRange,
                        },
                        {
                          k: "vacation-week",
                          t: "Vacances cette semaine",
                          v: String(absencesAndVacations.kpi.vacationWeek),
                          tone: "cyan",
                          Icon: CalendarRange,
                        },
                        {
                          k: "pending-req",
                          t: "Demandes en attente",
                          v: String(absencesAndVacations.kpi.pending),
                          tone: "orange",
                          Icon: Clock,
                        },
                        {
                          k: "impact-req",
                          t: "Absences à impact couverture",
                          v: String(absencesAndVacations.kpi.impacting),
                          tone: "red",
                          Icon: AlertOctagon,
                        },
                      ] as const
                    ).map((card) => {
                      const Ico = card.Icon;
                      return (
                        <TagoraStatCard
                          key={card.k}
                          title={card.t}
                          value={card.v}
                          tone={card.tone}
                          icon={<Ico strokeWidth={2} aria-hidden />}
                        />
                      );
                    })}
                  </div>
                ) : null}
                <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
                  <h2 style={{ margin: "0 0 12px", fontSize: "1.05rem", fontWeight: 900, color: "#0f172a" }}>
                    Absences et vacances
                  </h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {(
                      [
                        ["Aujourd’hui", absencesAndVacations.today],
                        ["Cette semaine", absencesAndVacations.week],
                        ["À venir", absencesAndVacations.upcoming],
                      ] as const
                    ).map(([title, list]) => (
                      <div key={title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{title}</div>
                        {list.length === 0 ? (
                          <div style={{ color: "#64748b", fontSize: "0.85rem" }}>Aucune absence.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {list.slice(0, 8).map((req) => (
                              <div
                                key={`${title}-${req.id}`}
                                style={{
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 10,
                                  background: "#fff",
                                  padding: "8px 10px",
                                }}
                              >
                                <div style={{ fontSize: "0.83rem", fontWeight: 700, color: "#0f172a" }}>
                                  {req.employeeNom?.trim() || `Employé #${req.employeeId}`} —{" "}
                                  {scheduleRequestTypeLabel(req.requestType)}
                                </div>
                                <div style={{ fontSize: "0.78rem", color: "#475569" }}>
                                  {requestPeriodLabel(req)}
                                  {req.startLocal && req.endLocal ? ` · ${req.startLocal}-${req.endLocal}` : ""}
                                  {" · "}
                                  {scheduleRequestStatusLabel(req.status)}
                                </div>
                                <div style={{ fontSize: "0.76rem", color: "#92400e", marginTop: 4 }}>
                                  Impact : {pendingRequestImpactHint(req, payload)}
                                </div>
                                {!!canEditOps && req.reason ? (
                                  <div style={{ fontSize: "0.76rem", color: "#334155", marginTop: 4 }}>
                                    Justification : {req.reason}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                {viewCompany === "comparative" ? (
                  <div className="effectifs-dual-calendar">
                    <DirectionEffectifsMonthCalendar
                      payload={payload}
                      year={calendarMonth.getFullYear()}
                      monthIndex0={calendarMonth.getMonth()}
                      todayIso={todayIso}
                      companyFilter="oliem_solutions"
                      headerLabel={`Oliem · ${new Intl.DateTimeFormat("fr-CA", {
                        month: "long",
                        year: "numeric",
                      }).format(calendarMonth)}`}
                      onPrevMonth={() =>
                        setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                      }
                      onNextMonth={() =>
                        setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                      }
                      onCellClick={(departmentKey, date) =>
                        setDetailPanel({ departmentKey, date })
                      }
                    />
                    <DirectionEffectifsMonthCalendar
                      payload={payload}
                      year={calendarMonth.getFullYear()}
                      monthIndex0={calendarMonth.getMonth()}
                      todayIso={todayIso}
                      companyFilter="titan_produits_industriels"
                      headerLabel={`Titan · ${new Intl.DateTimeFormat("fr-CA", {
                        month: "long",
                        year: "numeric",
                      }).format(calendarMonth)}`}
                      onPrevMonth={() =>
                        setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                      }
                      onNextMonth={() =>
                        setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                      }
                      onCellClick={(departmentKey, date) =>
                        setDetailPanel({ departmentKey, date })
                      }
                    />
                  </div>
                ) : (
                  <DirectionEffectifsMonthCalendar
                    payload={payload}
                    year={calendarMonth.getFullYear()}
                    monthIndex0={calendarMonth.getMonth()}
                    todayIso={todayIso}
                    companyFilter={
                      viewCompany === "all" ? undefined : (viewCompany as EffectifsCompanyKey)
                    }
                    onPrevMonth={() =>
                      setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                    }
                    onNextMonth={() =>
                      setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                    }
                    onCellClick={(departmentKey, date) =>
                      setDetailPanel({ departmentKey, date })
                    }
                  />
                )}
                <section className="rounded-2xl border border-slate-200/95 bg-white px-5 py-5 shadow-[0_4px_28px_rgba(15,23,42,0.04)]">
                  <div style={{ marginBottom: 18 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: "1.125rem",
                        fontWeight: 900,
                        letterSpacing: "-0.02em",
                        color: "#0f172a",
                      }}
                    >
                      Priorités immédiates
                    </h2>
                    <p
                      className="ui-text-muted"
                      style={{ margin: "6px 0 0", fontSize: "0.8rem", lineHeight: 1.4 }}
                    >
                      Synthèse par compagnie — détail sur demande.
                    </p>
                  </div>
                  {(() => {
                    const departmentCompanyByKey = new Map<string, EffectifsCompanyKey>(
                      payload.departments.map((d) => [d.key, d.companyKey])
                    );
                    const filterGapsByCompany = (
                      list: ReturnType<typeof buildPriorityGaps>,
                      companyFilter?: EffectifsCompanyKey
                    ) => {
                      if (!companyFilter || companyFilter === "all") return list;
                      return list.filter((g) => {
                        const deptCompany = departmentCompanyByKey.get(g.departmentKey) ?? "all";
                        return deptCompany === "all" || deptCompany === companyFilter;
                      });
                    };

                    const tomorrowIso = addDaysIso(todayIso, 1);

                    const buildPrioritySlices = (companyFilter?: EffectifsCompanyKey) => {
                      const todayG = filterGapsByCompany(priorityBlocks.today, companyFilter);
                      const tomorrowG = filterGapsByCompany(priorityBlocks.tomorrow, companyFilter);
                      const weekAll = filterGapsByCompany(priorityBlocks.week, companyFilter);
                      const restWeekG = weekAll.filter(
                        (g) => g.date !== todayIso && g.date !== tomorrowIso
                      );
                      const merged = [...todayG, ...tomorrowG, ...restWeekG];
                      const criticalCount = merged.filter((g) => priorityGapTone(g) === "critical")
                        .length;
                      return { todayG, tomorrowG, restWeekG, criticalCount, merged };
                    };

                    const companyShortFromDept = (deptKey: EffectifsDepartmentKey): string => {
                      const ck = departmentCompanyByKey.get(deptKey) ?? "all";
                      if (ck === "oliem_solutions") return "Oliem";
                      if (ck === "titan_produits_industriels") return "Titan";
                      return "—";
                    };

                    const companyPriorityColumn = (
                      label: string,
                      companyFilter: EffectifsCompanyKey | undefined,
                      cardKey: string
                    ) => {
                      const { todayG, tomorrowG, restWeekG, criticalCount, merged } =
                        buildPrioritySlices(companyFilter);
                      const total = todayG.length + tomorrowG.length + restWeekG.length;
                      const grouped = mergePriorityGapsToGroups(merged);
                      const sortedGroups = sortPriorityGroups(grouped, todayIso, tomorrowIso);
                      const top3 = sortedGroups.slice(0, 3);
                      const otherGroups = Math.max(0, sortedGroups.length - 3);
                      const showDetails = expandedPriorityKey === cardKey;

                      const detailToday: PriorityGroupLine[] = [];
                      const detailTomorrow: PriorityGroupLine[] = [];
                      const detailWeek: PriorityGroupLine[] = [];
                      for (const g of sortedGroups) {
                        const s = groupDetailSection(g, todayIso, tomorrowIso);
                        if (s === "today") detailToday.push(g);
                        else if (s === "tomorrow") detailTomorrow.push(g);
                        else detailWeek.push(g);
                      }

                      const criticalAccent = readOnly ? "text-slate-600" : "text-rose-600";
                      const cardShell =
                        "flex flex-col gap-2 min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)]";

                      return (
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className={cardShell}>
                            <div className="flex items-start gap-3">
                              <div
                                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500"
                                aria-hidden
                              >
                                <Building2 className="h-4 w-4" strokeWidth={1.75} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-extrabold tracking-tight text-slate-900">
                                  {label}
                                </div>
                                {total === 0 ? (
                                  <p className="mt-1 text-xs font-medium text-slate-500">
                                    Aucune priorité
                                  </p>
                                ) : (
                                  <>
                                    <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                                      <span
                                        className={`text-xl font-black tabular-nums tracking-tight ${readOnly ? "text-slate-700" : criticalCount > 0 ? criticalAccent : "text-slate-800"}`}
                                      >
                                        {criticalCount}
                                      </span>
                                      <span className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
                                        priorité{criticalCount !== 1 ? "s" : ""} critique
                                        {criticalCount !== 1 ? "s" : ""}
                                      </span>
                                    </p>
                                    <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-50/90 px-2 py-2 text-center">
                                      {(
                                        [
                                          ["Aujourd'hui", todayG.length],
                                          ["Demain", tomorrowG.length],
                                          ["Cette semaine", restWeekG.length],
                                        ] as const
                                      ).map(([t, n]) => (
                                        <div key={t} className="min-w-0">
                                          <div className="text-[0.6rem] font-extrabold uppercase tracking-wider text-slate-400">
                                            {t}
                                          </div>
                                          <div className="text-base font-bold tabular-nums text-slate-900">
                                            {n}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-3">
                                      <div className="text-[0.6rem] font-extrabold uppercase tracking-wider text-slate-400">
                                        Top priorités
                                      </div>
                                      <ul className="mt-1.5 space-y-1.5">
                                        {top3.map((g) => (
                                          <li key={g.id} className="min-w-0">
                                            <div className="truncate text-[0.8125rem] font-semibold leading-snug text-slate-900">
                                              {g.departmentLabel}
                                              <span className="font-medium text-slate-400"> · </span>
                                              <span className="font-medium tabular-nums text-slate-600">
                                                {g.startLocal}–{g.endLocal}
                                              </span>
                                            </div>
                                            {g.dates.length > 1 ? (
                                              <p className="text-[0.72rem] font-medium leading-snug text-slate-500">
                                                {g.dates.length} jours non couverts cette semaine
                                              </p>
                                            ) : null}
                                          </li>
                                        ))}
                                      </ul>
                                      {otherGroups > 0 ? (
                                        <p className="mt-1.5 text-[0.72rem] font-semibold text-slate-500">
                                          + {otherGroups} autre{otherGroups > 1 ? "s" : ""}{" "}
                                          priorité{otherGroups > 1 ? "s" : ""}
                                        </p>
                                      ) : null}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            {total > 0 ? (
                              <SecondaryButton
                                type="button"
                                className="mt-1 w-full justify-center text-[0.8125rem]"
                                onClick={() =>
                                  setExpandedPriorityKey((k) => (k === cardKey ? null : cardKey))
                                }
                              >
                                {showDetails ? "Masquer les détails" : "Voir les détails"}
                              </SecondaryButton>
                            ) : null}
                          </div>
                          {showDetails && total > 0 ? (
                            <div
                              className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-[0_4px_24px_rgba(15,23,42,0.05)]"
                              role="region"
                              aria-label={`Détail des priorités ${label}`}
                            >
                              {(
                                [
                                  ["Aujourd'hui", detailToday],
                                  ["Demain", detailTomorrow],
                                  ["Cette semaine", detailWeek],
                                ] as const
                              ).map(([title, list]) =>
                                list.length === 0 ? null : (
                                  <div key={title} className="mb-4 last:mb-0">
                                    <div className="text-[0.65rem] font-extrabold uppercase tracking-wider text-slate-400">
                                      {title}
                                    </div>
                                    <ul className="mt-2 space-y-2">
                                      {list.map((group) => {
                                        const sample = group.gaps[0]!;
                                        const loc = locationLabelForGap(payload, sample);
                                        const comp =
                                          companyFilter && companyFilter !== "all"
                                            ? label
                                            : companyShortFromDept(group.departmentKey);
                                        const tone = group.tone;
                                        const borderL = readOnly
                                          ? "border-l-slate-300"
                                          : tone === "critical"
                                            ? "border-l-rose-400"
                                            : "border-l-amber-300";
                                        return (
                                          <li
                                            key={`${title}-${group.id}`}
                                            className={`rounded-xl border border-slate-100 border-l-[3px] ${borderL} bg-slate-50/50 px-3 py-2`}
                                          >
                                            <div className="text-[0.8125rem] font-bold text-slate-900">
                                              {group.departmentLabel}
                                            </div>
                                            {group.dates.length > 1 ? (
                                              <div className="text-[0.72rem] font-medium text-slate-600">
                                                {group.dates.length} jours non couverts cette semaine
                                              </div>
                                            ) : (
                                              <div className="text-[0.72rem] text-slate-500">
                                                {formatShortFrDate(group.dates[0]!)}
                                              </div>
                                            )}
                                            <div className="mt-0.5 text-[0.72rem] tabular-nums text-slate-600">
                                              {group.startLocal} – {group.endLocal}
                                            </div>
                                            <div className="mt-1 grid gap-0.5 text-[0.72rem] leading-snug text-slate-600">
                                              <div>
                                                <span className="font-semibold text-slate-500">
                                                  Statut :{" "}
                                                </span>
                                                {group.summaryLine}
                                              </div>
                                              <div>
                                                <span className="font-semibold text-slate-500">
                                                  Compagnie :{" "}
                                                </span>
                                                {comp}
                                              </div>
                                              {loc ? (
                                                <div>
                                                  <span className="font-semibold text-slate-500">
                                                    Emplacement :{" "}
                                                  </span>
                                                  {loc}
                                                </div>
                                              ) : null}
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                )
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    };

                    if (viewCompany === "comparative") {
                      return (
                        <div
                          className="effectifs-priority-company-grid"
                          style={{ alignItems: "stretch", width: "100%" }}
                        >
                          {companyPriorityColumn("Oliem", "oliem_solutions", "prio-oliem")}
                          {companyPriorityColumn("Titan", "titan_produits_industriels", "prio-titan")}
                        </div>
                      );
                    }

                    if (viewCompany === "all") {
                      return (
                        <div style={{ width: "100%" }}>
                          {companyPriorityColumn("Toutes compagnies", undefined, "prio-all")}
                        </div>
                      );
                    }

                    const singleLabel =
                      viewCompany === "oliem_solutions" ? "Oliem" : "Titan";
                    return (
                      <div style={{ width: "100%" }}>
                        {companyPriorityColumn(
                          singleLabel,
                          viewCompany as EffectifsCompanyKey,
                          "prio-single"
                        )}
                      </div>
                    );
                  })()}
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f172a" }}>
                      Présence actuelle
                    </h2>
                    <SecondaryButton
                      type="button"
                      onClick={() => void loadLivePresence()}
                      disabled={liveRefreshing}
                    >
                      {liveRefreshing ? "Actualisation..." : "Actualiser"}
                    </SecondaryButton>
                  </div>
                  {(() => {
                    const renderDeptCards = (companyFilter?: EffectifsCompanyKey) => {
                      const depts = companyFilter
                        ? payload.departments.filter((d) =>
                            departmentMatchesCompany(d, companyFilter)
                          )
                        : payload.departments;
                      if (depts.length === 0) {
                        return (
                          <p style={{ margin: 0, color: "#64748b", fontSize: "0.86rem" }}>
                            Aucun département pour cette compagnie.
                          </p>
                        );
                      }
                      return (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(255px, 1fr))",
                            gap: 12,
                          }}
                        >
                          {depts.map((dept) => {
                            const p = livePresenceByDepartment.byDept.get(dept.key);
                            const status = p?.status ?? "Non requis";
                            const statusColor = status.startsWith("Manque")
                              ? "#b91c1c"
                              : status === "Couvert"
                                ? "#047857"
                                : status === "Présent non prévu"
                                  ? "#1d4ed8"
                                  : "#64748b";
                            const crossCompanyContext = p?.presentEmployees?.some((pe) => {
                              const em = employeeById.get(pe.id);
                              return Boolean(
                                em?.primaryCompany &&
                                dept.companyKey !== "all" &&
                                em.primaryCompany !== dept.companyKey
                              );
                            });
                            return (
                              <AppCard key={`presence-${dept.key}`} className="rounded-2xl ui-stack-xs" tone="elevated">
                                <div style={{ fontWeight: 800, color: "#0f172a" }}>{dept.label}</div>
                                {crossCompanyContext ? (
                                  <div
                                    style={{
                                      fontSize: "0.72rem",
                                      color: "#64748b",
                                      lineHeight: 1.35,
                                    }}
                                  >
                                    Contexte : présence live / compagnie principale (fiche) et périmètre
                                    du département diffèrent.
                                  </div>
                                ) : null}
                                <div style={{ fontSize: "0.83rem", color: "#334155" }}>
                                  Requis: <strong>{p?.requiredNow ?? 0}</strong> · Planifiés:{" "}
                                  <strong>{p?.plannedNow ?? 0}</strong>
                                </div>
                                <div style={{ fontSize: "0.83rem", color: "#334155" }}>
                                  Présents: <strong>{p?.presentNow ?? 0}</strong> · Absents:{" "}
                                  <strong>{p?.absentNow ?? 0}</strong>
                                </div>
                                <div style={{ fontSize: "0.83rem", color: "#334155" }}>
                                  Congé/Vacances approuvés: <strong>{p?.approvedLeave ?? 0}</strong>
                                </div>
                                <div style={{ fontSize: "0.83rem", color: "#334155" }}>
                                  Hors poste: <strong>{p?.horsPoste ?? 0}</strong> · Pause/Dîner:{" "}
                                  <strong>{p?.pauseDinner ?? 0}</strong>
                                </div>
                                <div style={{ fontSize: "0.82rem", fontWeight: 900, color: statusColor }}>
                                  Statut: {status}
                                </div>
                              </AppCard>
                            );
                          })}
                        </div>
                      );
                    };
                    if (viewCompany === "comparative") {
                      return (
                        <div className="effectifs-dual-calendar">
                          <div>
                            <div
                              className="ui-eyebrow"
                              style={{ marginBottom: 8, fontSize: "0.78rem" }}
                            >
                              Présence Oliem
                            </div>
                            {renderDeptCards("oliem_solutions")}
                          </div>
                          <div>
                            <div
                              className="ui-eyebrow"
                              style={{ marginBottom: 8, fontSize: "0.78rem" }}
                            >
                              Présence Titan
                            </div>
                            {renderDeptCards("titan_produits_industriels")}
                          </div>
                        </div>
                      );
                    }
                    if (viewCompany === "all") {
                      return renderDeptCards();
                    }
                    return renderDeptCards(viewCompany as EffectifsCompanyKey);
                  })()}
                </section>
                {(payload.longTermAbsences?.length ?? 0) > 0 ? (
                  <section className="rounded-2xl border border-amber-200/80 bg-amber-50/40 px-5 py-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
                    <h2
                      style={{
                        margin: "0 0 12px",
                        fontSize: "1.05rem",
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                    >
                      Absences longues durées
                    </h2>
                    <p style={{ margin: "0 0 12px", fontSize: "0.88rem", color: "#64748b" }}>
                      Employés en congé prolongé ou absence longue durée — non comptés comme disponibles pour la
                      couverture.
                    </p>
                    <div style={{ display: "grid", gap: 10 }}>
                      {payload.longTermAbsences!.map((a) => (
                        <div
                          key={a.employeeId}
                          className="rounded-xl border border-amber-200/90 bg-white p-3"
                        >
                          <div style={{ fontWeight: 800, color: "#0f172a" }}>
                            {a.employeeName?.trim() || `Employé #${a.employeeId}`} — {a.publicLeaveLabel} — depuis
                            le {a.startDate}
                            {a.isIndefinite ? " — retour indéterminé" : ` — retour prévu : ${a.expectedReturnSummary}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
            {mainTab === "week" ? (
              <div className="ui-stack-lg">
                {payload.meta.windowsLoadError ? (
                  <FeedbackMessage
                    message={`Fenêtres de couverture : ${payload.meta.windowsLoadError}`}
                    type="error"
                  />
                ) : null}
                <DirectionEffectifsWeekCoverage
                  payload={payload}
                  weekStartIso={payload.meta.referenceWeekStart}
                  todayIso={todayIso}
                  onCellClick={(departmentKey, date) =>
                    setDetailPanel({ departmentKey, date })
                  }
                />
              </div>
            ) : null}
            {mainTab === "requests" && !!canEditOps ? (
              <div className="ui-stack-lg">
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  {(
                    [
                      ["all", "Toutes"],
                      ["pending", "En attente"],
                      ["approved", "Approuvées"],
                      ["rejected", "Refusées"],
                      ["leave", "Congés"],
                      ["vacation", "Vacances"],
                      ["late", "Retards"],
                      ["partial", "Absences partielles"],
                      ["week", "Cette semaine"],
                      ["month", "Ce mois"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRequestFilter(key)}
                      style={{
                        border: "1px solid #dbe4ee",
                        borderRadius: 999,
                        padding: "6px 12px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        background: requestFilter === key ? "rgba(59,130,246,0.14)" : "#fff",
                        color: requestFilter === key ? "#1e3a8a" : "#334155",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <SectionCard
                  title="Demandes d’horaire à approuver"
                  subtitle="Après approbation, le prévu est recalculé (exceptions ponctuelles). L’horaire habituel en fiche employé n’est pas modifié par défaut."
                >
                  {filteredScheduleRequests.filter((r) => r.status === "pending").length ===
                  0 ? (
                    <p style={{ margin: 0, color: "#64748b" }}>Aucune demande en attente.</p>
                  ) : (
                    <div className="ui-stack-md">
                      {filteredScheduleRequests
                        .filter((r) => r.status === "pending")
                        .map((req) => (
                          <AppCard key={req.id} className="rounded-2xl ui-stack-sm" tone="elevated">
                            <div style={{ fontWeight: 800, color: "#0f172a" }}>
                              {req.employeeNom?.trim() || `Employé #${req.employeeId}`}
                            </div>
                            <div style={{ fontSize: "0.88rem", color: "#475569" }}>
                              {scheduleRequestTypeLabel(req.requestType)} ·{" "}
                              {req.requestedDate ??
                                (req.requestedStartDate && req.requestedEndDate
                                  ? `${req.requestedStartDate} → ${req.requestedEndDate}`
                                  : "—")}
                              {req.startLocal && req.endLocal
                                ? ` · ${req.startLocal}–${req.endLocal}`
                                : ""}
                            </div>
                            {req.reason ? (
                              <div style={{ fontSize: "0.85rem" }}>Motif : {req.reason}</div>
                            ) : null}
                            <div
                              className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2"
                              style={{ fontSize: "0.82rem", color: "#92400e" }}
                            >
                              Impact (estim.) : {pendingRequestImpactHint(req, payload)}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <PrimaryButton
                                type="button"
                                disabled={calExSaving}
                                onClick={() => void handleReviewScheduleRequest(req.id, "approved")}
                              >
                                Approuver
                              </PrimaryButton>
                              <SecondaryButton
                                type="button"
                                disabled={calExSaving}
                                onClick={() => void handleReviewScheduleRequest(req.id, "rejected")}
                              >
                                Refuser
                              </SecondaryButton>
                            </div>
                          </AppCard>
                        ))}
                    </div>
                  )}
                </SectionCard>
                <SectionCard title="Historique récent" subtitle="Dernières demandes traitées (extrait).">
                  <ul style={{ margin: 0, paddingLeft: 18, color: "#334155", fontSize: "0.88rem" }}>
                    {payload.scheduleRequests
                      .filter((req) =>
                        filteredScheduleRequests.some((f) => f.id === req.id)
                      )
                      .filter((r) => r.status !== "pending")
                      .slice(0, 40)
                      .map((req) => (
                        <li key={req.id} style={{ marginBottom: 6 }}>
                          {req.employeeNom?.trim() || `#${req.employeeId}`} —{" "}
                          {scheduleRequestTypeLabel(req.requestType)} —{" "}
                          {req.requestedDate ??
                            (req.requestedStartDate && req.requestedEndDate
                              ? `${req.requestedStartDate} → ${req.requestedEndDate}`
                              : "—")}{" "}
                          —{" "}
                          {scheduleRequestStatusLabel(req.status)}
                        </li>
                      ))}
                  </ul>
                </SectionCard>
              </div>
            ) : null}
            {mainTab === "config" ? (
            <>
            {!payload.meta.coverageWindowsConfigured ? (
              <AppCard
                id="effectifs-migration-hint"
                className="ui-stack-md rounded-2xl"
                tone="muted"
                style={{
                  border: "1px solid rgba(245,158,11,0.35)",
                  background:
                    "linear-gradient(135deg, rgba(255,251,235,0.9) 0%, rgba(255,255,255,0.95) 100%)",
                }}
              >
                <div className="ui-stack-xs">
                  <h2 className="ui-section-card-title" style={{ margin: 0 }}>
                    Configuration requise — heures à couvrir
                  </h2>
                  <p
                    className="ui-section-card-subtitle"
                    style={{ margin: 0, maxWidth: 720, lineHeight: 1.55 }}
                  >
                    La table <code>department_coverage_windows</code> est absente
                    ou inaccessible. Appliquez les migrations Supabase du dépôt
                    (par ex. <code>npx supabase db push</code> ou déploiement CI)
                    puis rechargez cette page. Sans cette table, les plages
                    «&nbsp;heures à couvrir&nbsp;» ne peuvent pas être
                    enregistrées.
                  </p>
                </div>
                {canEditOps ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <PrimaryButton
                      type="button"
                      onClick={() => void loadEffectifs()}
                      disabled={saving}
                    >
                      Vérifier après migration
                    </PrimaryButton>
                    <SecondaryButton
                      type="button"
                      onClick={() => scrollToId("effectifs-migration-hint")}
                    >
                      Aide configuration
                    </SecondaryButton>
                  </div>
                ) : null}
              </AppCard>
            ) : null}

            {payload.meta.windowsLoadError ? (
              <FeedbackMessage
                message={`Fenêtres de couverture : ${payload.meta.windowsLoadError}`}
                type="error"
              />
            ) : null}

            <SectionCard
              title="Départements"
              subtitle="Répertoire des pôles (libellé, compagnie, emplacement). Chaque département a une clé unique ; elle sert aux plages de couverture, fermetures et fiches."
              actions={
                canEditOps && directoryTablePresent ? (
                  <PrimaryButton type="button" onClick={openAddDepartmentModal}>
                    Ajouter un département
                  </PrimaryButton>
                ) : null
              }
            >
              {!directoryTablePresent ? (
                <p style={{ margin: "0 0 12px", color: "#92400e", fontSize: "0.88rem" }}>
                  Table <code>effectifs_departments</code> absente : liste de secours côté
                  application. Appliquez les migrations pour persister les modifications.
                </p>
              ) : null}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 12,
                  alignItems: "flex-end",
                }}
              >
                <label className="ui-stack-xs" style={{ margin: 0 }}>
                  <span className="ui-eyebrow">Compagnie</span>
                  <select
                    className="tagora-input"
                    value={directoryCompanyFilter}
                    onChange={(e) =>
                      setDirectoryCompanyFilter(
                        e.target.value as typeof directoryCompanyFilter
                      )
                    }
                  >
                    <option value="all">Toutes</option>
                    <option value="oliem_solutions">Oliem</option>
                    <option value="titan_produits_industriels">Titan</option>
                  </select>
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={directoryActiveOnly}
                    onChange={(e) => setDirectoryActiveOnly(e.target.checked)}
                  />
                  <span className="ui-eyebrow" style={{ margin: 0 }}>
                    Actifs seulement
                  </span>
                </label>
              </div>
              {addDepartmentOpen && canEditOps && directoryTablePresent ? (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="effectifs-add-dept-title"
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 60,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16,
                    background: "rgba(15,23,42,0.45)",
                  }}
                  onClick={() => setAddDepartmentOpen(false)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Escape") setAddDepartmentOpen(false);
                  }}
                >
                  <AppCard
                    className="ui-stack-md"
                    tone="elevated"
                    style={{
                      maxWidth: 480,
                      width: "100%",
                      maxHeight: "90vh",
                      overflow: "auto",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3
                      id="effectifs-add-dept-title"
                      style={{ margin: 0, fontSize: "1.15rem", color: "#0f172a" }}
                    >
                      Nouveau département
                    </h3>
                    <form className="ui-stack-md" onSubmit={(e) => void handleSubmitNewDepartment(e)}>
                      <label className="ui-stack-xs">
                        <span className="ui-eyebrow">Nom du département</span>
                        <input
                          className="tagora-input"
                          required
                          value={newDeptForm.label}
                          onChange={(e) => {
                            const v = e.target.value;
                            setNewDeptForm((f) => {
                              const next = { ...f, label: v };
                              if (!newDeptKeyTouched) {
                                next.department_key = slugifyDepartmentName(v);
                              }
                              return next;
                            });
                          }}
                          placeholder="ex. Atelier Titan"
                        />
                      </label>
                      <label className="ui-stack-xs">
                        <span className="ui-eyebrow">Clé département (technique)</span>
                        <input
                          className="tagora-input"
                          required
                          value={newDeptForm.department_key}
                          onChange={(e) => {
                            setNewDeptKeyTouched(true);
                            setNewDeptForm((f) => ({
                              ...f,
                              department_key: e.target.value.toLowerCase(),
                            }));
                          }}
                          placeholder="ex. atelier_titan"
                          pattern="[a-z0-9_]{1,80}"
                          title="Lettres minuscules, chiffres et underscores uniquement"
                        />
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          Générée depuis le nom ; vous pouvez l’ajuster. Unique dans le répertoire.
                        </span>
                      </label>
                      <label className="ui-stack-xs">
                        <span className="ui-eyebrow">Compagnie</span>
                        <select
                          className="tagora-input"
                          value={newDeptForm.companyKey}
                          onChange={(e) =>
                            setNewDeptForm((f) => ({
                              ...f,
                              companyKey: e.target.value as EffectifsCompanyKey,
                            }))
                          }
                        >
                          <option value="all">Toutes</option>
                          <option value="oliem_solutions">Oliem</option>
                          <option value="titan_produits_industriels">Titan</option>
                        </select>
                      </label>
                      <label className="ui-stack-xs">
                        <span className="ui-eyebrow">Emplacement</span>
                        <input
                          className="tagora-input"
                          list="effectifs-new-dept-locations"
                          value={newDeptForm.locationKey}
                          onChange={(e) =>
                            setNewDeptForm((f) => ({ ...f, locationKey: e.target.value }))
                          }
                          placeholder="Oliem, Titan, entrepot, route… ou saisie libre"
                        />
                        <datalist id="effectifs-new-dept-locations">
                          {EFFECTIFS_LOCATION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} label={o.label} />
                          ))}
                        </datalist>
                      </label>
                      <label className="ui-stack-xs">
                        <span className="ui-eyebrow">Ordre d’affichage</span>
                        <input
                          className="tagora-input"
                          type="number"
                          value={newDeptForm.sortOrder}
                          onChange={(e) =>
                            setNewDeptForm((f) => ({
                              ...f,
                              sortOrder: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={newDeptForm.active}
                          onChange={(e) =>
                            setNewDeptForm((f) => ({ ...f, active: e.target.checked }))
                          }
                        />
                        <span className="ui-eyebrow" style={{ margin: 0 }}>
                          Actif
                        </span>
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        <PrimaryButton type="submit" disabled={saving}>
                          Enregistrer
                        </PrimaryButton>
                        <SecondaryButton
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setAddDepartmentOpen(false);
                            resetNewDepartmentForm();
                          }}
                        >
                          Annuler
                        </SecondaryButton>
                      </div>
                    </form>
                  </AppCard>
                </div>
              ) : null}
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.86rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        color: "#64748b",
                        textAlign: "left",
                      }}
                    >
                      {(
                        [
                          "Département",
                          "Compagnie",
                          "Emplacement",
                          "Ordre",
                          "Actif",
                          ...(!canEditOps ? [] : ["Actions"]),
                        ] as const
                      ).map((h) => (
                        <th key={h} style={{ padding: "8px 10px" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDirectoryDepartments.map((d) => {
                      const rowKey = d.id ?? d.key;
                      const editing =
                        directoryEditingId === rowKey && directoryEditDraft != null;
                      return (
                        <tr key={rowKey} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                            {editing && directoryEditDraft ? (
                              <input
                                className="tagora-input"
                                value={directoryEditDraft.label}
                                onChange={(e) =>
                                  setDirectoryEditDraft((prev) =>
                                    prev ? { ...prev, label: e.target.value } : prev
                                  )
                                }
                              />
                            ) : (
                              <strong style={{ color: "#0f172a" }}>{d.label}</strong>
                            )}
                            <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{d.key}</div>
                          </td>
                          <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                            {editing && directoryEditDraft ? (
                              <select
                                className="tagora-input"
                                value={directoryEditDraft.companyKey}
                                onChange={(e) =>
                                  setDirectoryEditDraft((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          companyKey: e.target.value as EffectifsCompanyKey,
                                        }
                                      : prev
                                  )
                                }
                              >
                                <option value="all">Toutes</option>
                                <option value="oliem_solutions">Oliem</option>
                                <option value="titan_produits_industriels">Titan</option>
                              </select>
                            ) : (
                              (d.companyKey === "all"
                                ? "Toutes"
                                : d.companyKey === "oliem_solutions"
                                  ? "Oliem"
                                  : "Titan")
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                            {editing && directoryEditDraft ? (
                              <input
                                className="tagora-input"
                                value={directoryEditDraft.locationKey}
                                onChange={(e) =>
                                  setDirectoryEditDraft((prev) =>
                                    prev ? { ...prev, locationKey: e.target.value } : prev
                                  )
                                }
                                placeholder="ex. oliem"
                              />
                            ) : (
                              (d.locationKey ?? "—")
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                            {editing && directoryEditDraft ? (
                              <input
                                className="tagora-input"
                                type="number"
                                value={directoryEditDraft.sortOrder}
                                onChange={(e) =>
                                  setDirectoryEditDraft((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          sortOrder: Number(e.target.value),
                                        }
                                      : prev
                                  )
                                }
                              />
                            ) : (
                              d.sortOrder
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                            {editing && directoryEditDraft ? (
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={directoryEditDraft.active}
                                  onChange={(e) =>
                                    setDirectoryEditDraft((prev) =>
                                      prev ? { ...prev, active: e.target.checked } : prev
                                    )
                                  }
                                />
                                <span>Actif</span>
                              </label>
                            ) : (
                              (d.active ? "Oui" : "Non")
                            )}
                          </td>
                          {!!canEditOps ? (
                            <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                              {canEditOps && d.id ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {editing && directoryEditDraft ? (
                                    <>
                                      <SecondaryButton
                                        type="button"
                                        disabled={saving}
                                        onClick={() => {
                                          void handleUpdateDirectoryDepartment(d.id as string, {
                                            label: directoryEditDraft.label,
                                            companyKey: directoryEditDraft.companyKey,
                                            locationKey: directoryEditDraft.locationKey.trim() || null,
                                            sortOrder: directoryEditDraft.sortOrder,
                                            active: directoryEditDraft.active,
                                          });
                                        }}
                                      >
                                        Enregistrer
                                      </SecondaryButton>
                                      <SecondaryButton
                                        type="button"
                                        disabled={saving}
                                        onClick={() => {
                                          setDirectoryEditingId(null);
                                          setDirectoryEditDraft(null);
                                        }}
                                      >
                                        Annuler
                                      </SecondaryButton>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="tagora-dark-outline-action"
                                        onClick={() => {
                                          setDirectoryEditingId(rowKey);
                                          setDirectoryEditDraft({
                                            label: d.label,
                                            companyKey: d.companyKey,
                                            locationKey: d.locationKey ?? "",
                                            sortOrder: d.sortOrder,
                                            active: d.active,
                                          });
                                        }}
                                      >
                                        Modifier
                                      </button>
                                      <button
                                        type="button"
                                        className="tagora-dark-outline-action"
                                        onClick={() =>
                                          void handleUpdateDirectoryDepartment(d.id as string, {
                                            active: false,
                                          })
                                        }
                                      >
                                        Désactiver
                                      </button>
                                      <button
                                        type="button"
                                        className="tagora-dark-outline-action"
                                        onClick={() =>
                                          void handleDeleteDirectoryDepartment(d.id as string)
                                        }
                                      >
                                        Supprimer
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                                  {canEditOps
                                    ? "Migration requise pour éditer (pas d’identifiant ligne)."
                                    : "—"}
                                </span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {canEditOps ? (
              <SectionCard
                title="Jours fermés réguliers"
                subtitle="Définir les journées fermées pour toute l’entreprise, une compagnie, un département ou un emplacement."
              >
                <div className="ui-stack-md">
                  <AppCard tone="muted">
                    <strong style={{ color: "#0f172a" }}>Fermeture appliquée à : Toute l’entreprise</strong>
                    <div className="ui-text-muted" style={{ marginTop: 6 }}>
                      Toute l’entreprise est fermée :{" "}
                      {WEEKDAY_OPTIONS.filter((o) => regularClosedDays.includes(o.value))
                        .map((o) => o.label)
                        .join(", ") || "Aucun jour"}
                    </div>
                  </AppCard>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 10,
                    }}
                  >
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Type de fermeture</span>
                      <select
                        className="tagora-input"
                        value={closedRuleMode}
                        onChange={(e) => {
                          const mode = e.target.value as ClosedRuleMode;
                          setClosedRuleMode(mode);
                          setClosedRuleForm((f) => ({
                            ...f,
                            scope: mode === "department" ? "department" : mode === "location" ? "location" : "company",
                            companyKey: mode === "enterprise" ? "all" : f.companyKey,
                          }));
                        }}
                      >
                        {EFFECTIFS_CLOSED_MODE_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(closedRuleMode === "company" || closedRuleMode === "enterprise") ? (
                      <label className="ui-stack-xs">
                        <span className="ui-eyebrow">Compagnie</span>
                        <select
                          className="tagora-input"
                          value={closedRuleMode === "enterprise" ? "all" : closedRuleForm.companyKey}
                          onChange={(e) =>
                            setClosedRuleForm((f) => ({
                              ...f,
                              companyKey: e.target.value as ClosedRuleForm["companyKey"],
                            }))
                          }
                          disabled={closedRuleMode === "enterprise"}
                        >
                          <option value="all">Toutes les compagnies</option>
                          <option value="oliem_solutions">Oliem</option>
                          <option value="titan_produits_industriels">Titan</option>
                        </select>
                      </label>
                    ) : null}
                    {closedRuleMode === "department" ? (
                      <label className="ui-stack-xs">
                        <span className="ui-eyebrow">Département</span>
                        <select
                          className="tagora-input"
                          value={closedRuleForm.departmentKey}
                          onChange={(e) =>
                            setClosedRuleForm((f) => ({ ...f, departmentKey: e.target.value }))
                          }
                        >
                          <option value="">Choisir</option>
                          {payload.departments.map((d) => (
                            <option key={d.key} value={d.key}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {closedRuleMode === "location" ? (
                      <label className="ui-stack-xs">
                        <span className="ui-eyebrow">Emplacement</span>
                        <select
                          className="tagora-input"
                          value={closedRuleForm.locationKey}
                          onChange={(e) =>
                            setClosedRuleForm((f) => ({ ...f, locationKey: e.target.value }))
                          }
                        >
                          <option value="">Choisir</option>
                          {EFFECTIFS_LOCATION_OPTIONS.map((loc) => (
                            <option key={loc.value} value={loc.value}>
                              {loc.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {WEEKDAY_OPTIONS.map((o) => {
                      const checked = closedRuleForm.days.includes(o.value);
                      return (
                        <label key={`closed-day-form-${o.value}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setClosedRuleForm((f) => ({
                                ...f,
                                days: e.target.checked
                                  ? Array.from(new Set([...f.days, o.value])).sort((a, b) => a - b)
                                  : f.days.filter((d) => d !== o.value),
                              }))
                            }
                          />
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <PrimaryButton
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void handleSaveClosedRule({
                          ...closedRuleForm,
                          companyKey: closedRuleMode === "enterprise" ? "all" : closedRuleForm.companyKey,
                          scope:
                            closedRuleMode === "department"
                              ? "department"
                              : closedRuleMode === "location"
                                ? "location"
                                : "company",
                        })
                      }
                    >
                      Ajouter une fermeture régulière
                    </PrimaryButton>
                    <SecondaryButton
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSaveRegularClosedDays(regularClosedDays)}
                    >
                      Synchroniser fermeture entreprise
                    </SecondaryButton>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", textAlign: "left" }}>
                          {["Niveau", "Compagnie", "Département", "Emplacement", "Jours fermés", "Statut", "Actions"].map((h) => (
                            <th key={h} style={{ padding: "8px 10px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupedRegularClosedRules.map((r, idx) => (
                          <tr key={`${r.scope}-${r.companyKey}-${r.departmentKey ?? ""}-${r.locationKey ?? ""}-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "8px 10px" }}>
                              {r.scope === "company" ? (r.companyKey === "all" ? "Toute l’entreprise" : "Compagnie") : r.scope === "department" ? "Département" : "Emplacement"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {r.companyKey === "all" ? "Toutes" : r.companyKey === "oliem_solutions" ? "Oliem" : "Titan"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {r.departmentKey ? departmentLabelFromKey(r.departmentKey as EffectifsDepartmentKey) : "Tous"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>{r.locationKey ?? "Tous"}</td>
                            <td style={{ padding: "8px 10px" }}>
                              {r.days.map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? `J${d}`).join(", ") || "Aucun"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>{r.active ? "Actif" : "Inactif"}</td>
                            <td style={{ padding: "8px 10px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="tagora-dark-outline-action"
                                onClick={() => {
                                  setClosedRuleMode(
                                    r.scope === "department"
                                      ? "department"
                                      : r.scope === "location"
                                        ? "location"
                                        : r.companyKey === "all"
                                          ? "enterprise"
                                          : "company"
                                  );
                                  setClosedRuleForm({
                                    scope: r.scope,
                                    companyKey: r.companyKey,
                                    departmentKey: r.departmentKey ?? "",
                                    locationKey: r.locationKey ?? "",
                                    days: r.days,
                                    active: true,
                                  });
                                }}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className="tagora-dark-outline-action"
                                onClick={() =>
                                  void handleSaveClosedRule({
                                    scope: r.scope,
                                    companyKey: r.companyKey,
                                    departmentKey: r.departmentKey ?? "",
                                    locationKey: r.locationKey ?? "",
                                    days: [],
                                    active: false,
                                  })
                                }
                              >
                                Désactiver
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            ) : (
              <SectionCard
                title="Jours fermés réguliers"
                subtitle="Lecture seule"
              >
                <div className="ui-stack-sm">
                  <div className="ui-text-muted">
                    Toute l’entreprise est fermée :{" "}
                    {WEEKDAY_OPTIONS.filter((o) => regularClosedDays.includes(o.value))
                      .map((o) => o.label)
                      .join(", ") || "Aucun jour"}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", textAlign: "left" }}>
                          {["Niveau", "Compagnie", "Département", "Emplacement", "Jours fermés", "Statut"].map((h) => (
                            <th key={h} style={{ padding: "8px 10px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupedRegularClosedRules.map((r, idx) => (
                          <tr key={`${r.scope}-${r.companyKey}-${r.departmentKey ?? ""}-${r.locationKey ?? ""}-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "8px 10px" }}>
                              {r.scope === "company" ? (r.companyKey === "all" ? "Toute l’entreprise" : "Compagnie") : r.scope === "department" ? "Département" : "Emplacement"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {r.companyKey === "all" ? "Toutes" : r.companyKey === "oliem_solutions" ? "Oliem" : "Titan"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {r.departmentKey ? departmentLabelFromKey(r.departmentKey as EffectifsDepartmentKey) : "Tous"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>{r.locationKey ?? "Tous"}</td>
                            <td style={{ padding: "8px 10px" }}>
                              {r.days.map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? `J${d}`).join(", ") || "Aucun"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>{r.active ? "Actif" : "Inactif"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            )}

            {canEditOps ? (
              <SectionCard
                id="effectifs-calendrier-prevu"
                title="Jours spéciaux et fermetures"
                subtitle="Calendrier prévu officiel : fériés, fermetures, horaires réduits ou spéciaux. Laisser le département vide pour toute l’entreprise."
              >
                <form className="ui-stack-md" onSubmit={(e) => void handleCreateCalendarException(e)}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Date</span>
                      <input
                        className="tagora-input"
                        type="date"
                        value={calExForm.date}
                        onChange={(e) => setCalExForm((f) => ({ ...f, date: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Titre</span>
                      <input
                        className="tagora-input"
                        value={calExForm.title}
                        onChange={(e) => setCalExForm((f) => ({ ...f, title: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Type</span>
                      <select
                        className="tagora-input"
                        value={calExForm.type}
                        onChange={(e) => setCalExForm((f) => ({ ...f, type: e.target.value }))}
                      >
                        {EFFECTIFS_CALENDAR_EXCEPTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label
                      className="ui-stack-xs"
                      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <input
                        type="checkbox"
                        checked={calExForm.is_closed}
                        onChange={(e) =>
                          setCalExForm((f) => ({ ...f, is_closed: e.target.checked }))
                        }
                      />
                      <span className="ui-eyebrow" style={{ margin: 0 }}>
                        Fermé (pas d’exigence de couverture)
                      </span>
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Département (optionnel)</span>
                      <select
                        className="tagora-input"
                        value={calExForm.department_key}
                        onChange={(e) =>
                          setCalExForm((f) => ({ ...f, department_key: e.target.value }))
                        }
                      >
                        <option value="">Toute l’entreprise</option>
                        {payload.departments.map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Emplacement (optionnel)</span>
                      <input
                        className="tagora-input"
                        value={calExForm.location}
                        onChange={(e) => setCalExForm((f) => ({ ...f, location: e.target.value }))}
                        placeholder="ex. principal"
                      />
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Début (optionnel)</span>
                      <input
                        className="tagora-input"
                        type="time"
                        value={calExForm.start_time}
                        onChange={(e) =>
                          setCalExForm((f) => ({ ...f, start_time: e.target.value }))
                        }
                      />
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Fin (optionnel)</span>
                      <input
                        className="tagora-input"
                        type="time"
                        value={calExForm.end_time}
                        onChange={(e) =>
                          setCalExForm((f) => ({ ...f, end_time: e.target.value }))
                        }
                      />
                    </label>
                    <label className="ui-stack-xs" style={{ gridColumn: "1 / -1" }}>
                      <span className="ui-eyebrow">Note</span>
                      <textarea
                        className="tagora-input"
                        rows={2}
                        value={calExForm.notes}
                        onChange={(e) => setCalExForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </label>
                  </div>
                  <PrimaryButton type="submit" disabled={calExSaving}>
                    Enregistrer la journée spéciale
                  </PrimaryButton>
                </form>
                <div className="ui-stack-sm" style={{ marginTop: 24 }}>
                  <h3 className="ui-eyebrow" style={{ margin: 0 }}>
                    Entrées chargées
                  </h3>
                  {payload.calendarExceptions.length === 0 ? (
                    <p style={{ margin: 0, color: "#64748b" }}>Aucune entrée.</p>
                  ) : (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        fontSize: "0.88rem",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      {payload.calendarExceptions.map((ex) => (
                        <li key={ex.id} style={{ marginBottom: 4 }}>
                          <strong>{ex.date}</strong> — {ex.title}{" "}
                          <span style={{ color: "#64748b" }}>({ex.type})</span>
                          {ex.departmentKey
                            ? ` · ${departmentLabelFromKey(ex.departmentKey)}`
                            : " · Entreprise"}
                          {ex.location ? ` · ${ex.location}` : ""}
                          <div style={{ marginTop: 6 }}>
                            <SecondaryButton
                              type="button"
                              disabled={calExSaving}
                              onClick={() => void handleDeleteCalendarException(ex.id)}
                            >
                              Supprimer
                            </SecondaryButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              id="effectifs-heures-liste"
              title="Heures à couvrir"
              subtitle={
                !canEditOps
                  ? "Consultation des plages configurées par la direction (lecture seule)."
                  : payload.meta.coverageWindowsConfigured &&
                      payload.coverageWindows.length === 0
                    ? "Aucune heure à couvrir configurée. Utilisez le formulaire ci-dessous pour ajouter des plages."
                    : "Pour chaque plage : département, emplacement, jour, horaire, nombre de personnes requises, actif ou non."
              }
              actions={
                canEditOps &&
                payload.meta.coverageWindowsConfigured ? (
                  <PrimaryButton
                    type="button"
                    onClick={() => scrollToId("effectifs-heures-config")}
                  >
                    Configurer les heures à couvrir
                  </PrimaryButton>
                ) : null
              }
            >
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  marginBottom: 14,
                }}
              >
                <label className="ui-stack-xs">
                  <span className="ui-eyebrow">Filtre département</span>
                  <select
                    className="tagora-input"
                    value={coverageFilterDept}
                    onChange={(e) => setCoverageFilterDept(e.target.value)}
                  >
                    <option value="all">Tous</option>
                    {payload.departments.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ui-stack-xs">
                  <span className="ui-eyebrow">Filtre jour</span>
                  <select
                    className="tagora-input"
                    value={coverageFilterDay}
                    onChange={(e) => setCoverageFilterDay(e.target.value)}
                  >
                    <option value="all">Tous</option>
                    {WEEKDAY_OPTIONS.map((o) => (
                      <option key={o.value} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="ui-stack-xs"
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={coverageFilterActiveOnly}
                    onChange={(e) => setCoverageFilterActiveOnly(e.target.checked)}
                  />
                  <span className="ui-eyebrow" style={{ margin: 0 }}>
                    Actif seulement
                  </span>
                </label>
              </div>
              {filteredCoverageWindows.length === 0 && payload.meta.coverageWindowsConfigured ? (
                <p style={{ margin: 0, color: "#64748b" }}>
                  {coverageFilterDay !== "all" &&
                  regularClosedDays.includes(Number(coverageFilterDay))
                    ? "Commerce fermé ce jour-là. Aucune plage requise."
                    : "Aucune plage ne correspond aux filtres."}
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      minWidth: 1020,
                      borderCollapse: "collapse",
                      fontSize: "0.86rem",
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        {["Compagnie", "Département", "Emplacement", "Jour", "Heure début", "Heure fin", "Personnes requises", "Statut", "Actions"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCoverageWindows.map((w) => {
                        const deptLabel =
                          payload.departments.find((d) => d.key === w.departmentKey)?.label ??
                          w.departmentKey;
                        const isEditing = canEditOps && editingId === w.id && editDraft;
                        const isClosedRegularDay = regularClosedDays.includes(w.weekday);
                        return (
                          <tr key={w.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "8px 10px" }}>
                              {w.companyKey === "all"
                                ? "Toutes"
                                : w.companyKey === "oliem_solutions"
                                  ? "Oliem"
                                  : "Titan"}
                            </td>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>{deptLabel}</td>
                            <td style={{ padding: "8px 10px" }}>
                              {w.locationLabel?.trim() || w.locationKey || "—"}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {w.weekdayLabelLong}
                              {isClosedRegularDay ? (
                                <span
                                  style={{
                                    marginLeft: 8,
                                    fontSize: "0.72rem",
                                    borderRadius: 999,
                                    padding: "2px 7px",
                                    background: "rgba(51,65,85,0.14)",
                                    color: "#334155",
                                    fontWeight: 700,
                                  }}
                                >
                                  Commerce fermé
                                </span>
                              ) : null}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {isEditing ? (
                                <input
                                  className="tagora-input"
                                  type="time"
                                  value={editDraft.start_local}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, start_local: e.target.value })
                                  }
                                />
                              ) : (
                                w.startLocal
                              )}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {isEditing ? (
                                <input
                                  className="tagora-input"
                                  type="time"
                                  value={editDraft.end_local}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, end_local: e.target.value })
                                  }
                                />
                              ) : (
                                w.endLocal
                              )}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {isEditing ? (
                                <input
                                  className="tagora-input"
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={editDraft.min_employees}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      min_employees: Number(e.target.value),
                                    })
                                  }
                                />
                              ) : (
                                w.minEmployees
                              )}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: 8,
                                  background: w.active
                                    ? "rgba(16,185,129,0.12)"
                                    : "rgba(100,116,139,0.2)",
                                  color: w.active ? "#047857" : "#475569",
                                  fontWeight: 700,
                                }}
                              >
                                {isClosedRegularDay
                                  ? "Ignorée car commerce fermé"
                                  : w.active
                                    ? "Actif"
                                    : "Inactif"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {canEditOps ? (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {isEditing ? (
                                    <PrimaryButton
                                      type="button"
                                      disabled={saving}
                                      onClick={() => void handleUpdateWindow(w.id)}
                                    >
                                      Enregistrer
                                    </PrimaryButton>
                                  ) : null}
                                  <SecondaryButton
                                    type="button"
                                    disabled={saving}
                                    onClick={() =>
                                      editingId === w.id
                                        ? (setEditingId(null), setEditDraft(null))
                                        : startEdit(w)
                                    }
                                  >
                                    {editingId === w.id ? "Fermer" : "Modifier"}
                                  </SecondaryButton>
                                  <SecondaryButton
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void handleDeleteWindow(w.id)}
                                  >
                                    Supprimer
                                  </SecondaryButton>
                                </div>
                              ) : (
                                <span style={{ color: "#94a3b8" }}>Lecture seule</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {canEditOps && payload.meta.coverageWindowsConfigured ? (
              <SectionCard
                id="effectifs-heures-config"
                title="Configurer les heures à couvrir"
                subtitle="Ajouter une plage : département, emplacement, jour, horaires, nombre de personnes requises, actif."
              >
                <form className="ui-stack-md" onSubmit={(e) => void handleCreateWindow(e)}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Compagnie</span>
                      <select
                        className="tagora-input"
                        value={newForm.company_key}
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            company_key: e.target.value as
                              | "all"
                              | "oliem_solutions"
                              | "titan_produits_industriels",
                          })
                        }
                      >
                        <option value="all">Toutes les compagnies</option>
                        <option value="oliem_solutions">Oliem Solutions</option>
                        <option value="titan_produits_industriels">Titan Produits Industriels</option>
                      </select>
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Département</span>
                      <select
                        className="tagora-input"
                        value={newForm.department_key}
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            department_key: e.target.value as EffectifsDepartmentKey,
                          })
                        }
                      >
                        {payload.departments.map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Jour</span>
                      <select
                        className="tagora-input"
                        value={newForm.weekday}
                        onChange={(e) =>
                          setNewForm({ ...newForm, weekday: Number(e.target.value) })
                        }
                      >
                        {WEEKDAY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Heure début</span>
                      <input
                        className="tagora-input"
                        type="time"
                        value={newForm.start_local}
                        onChange={(e) =>
                          setNewForm({ ...newForm, start_local: e.target.value })
                        }
                      />
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Heure fin</span>
                      <input
                        className="tagora-input"
                        type="time"
                        value={newForm.end_local}
                        onChange={(e) =>
                          setNewForm({ ...newForm, end_local: e.target.value })
                        }
                      />
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Nombre de personnes requises</span>
                      <input
                        className="tagora-input"
                        type="number"
                        min={0}
                        step={1}
                        value={newForm.min_employees}
                        onChange={(e) =>
                          setNewForm({ ...newForm, min_employees: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Emplacement (clé)</span>
                      <input
                        className="tagora-input"
                        value={newForm.location_key}
                        onChange={(e) =>
                          setNewForm({ ...newForm, location_key: e.target.value })
                        }
                      />
                    </label>
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">Libellé emplacement</span>
                      <input
                        className="tagora-input"
                        value={newForm.location_label}
                        onChange={(e) =>
                          setNewForm({ ...newForm, location_label: e.target.value })
                        }
                      />
                    </label>
                    <label
                      className="ui-stack-xs"
                      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <input
                        type="checkbox"
                        checked={newForm.active}
                        onChange={(e) =>
                          setNewForm({ ...newForm, active: e.target.checked })
                        }
                      />
                      <span>Actif</span>
                    </label>
                  </div>
                  <PrimaryButton type="submit" disabled={saving}>
                    Ajouter la plage
                  </PrimaryButton>
                </form>
              </SectionCard>
            ) : null}
            </>
            ) : null}

            {mainTab === "operational" ? (
            <>
            {payload.meta.windowsLoadError ? (
              <FeedbackMessage
                message={`Fenêtres de couverture : ${payload.meta.windowsLoadError}`}
                type="error"
              />
            ) : null}

            <SectionCard
              title="Vue opérationnelle du jour"
              subtitle="Cartes par département pour la journée sélectionnée : requis, planifié, manques et employés assignés."
            >
              {operationalDepartmentCards.length === 0 ? (
                <p style={{ margin: 0, color: "#64748b" }}>Aucune ligne à afficher.</p>
              ) : (
                <div className="ui-stack-md">
                  <label className="ui-stack-xs" style={{ maxWidth: 260 }}>
                    <span className="ui-eyebrow">Date sélectionnée</span>
                    <input
                      className="tagora-input"
                      type="date"
                      value={operationalDate}
                      onChange={(e) => setOperationalDate(e.target.value)}
                    />
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: 14,
                    }}
                  >
                    {operationalDepartmentCards.map(({ dept, cell, required, planned, manque, uniqueAssigned }) => {
                      const live = livePresenceByDepartment.byDept.get(dept.key);
                      const st = categoryStyle(cell.aggregateCategory);
                      return (
                        <AppCard key={`${dept.key}-${operationalDate}`} className="rounded-2xl ui-stack-sm" tone="elevated">
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <h3 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800 }}>{dept.label}</h3>
                            <span style={{ fontSize: "0.75rem", borderRadius: 999, padding: "3px 10px", background: st.bg, color: st.color, fontWeight: 800 }}>
                              {cell.primaryLabel}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.84rem", color: "#475569" }}>{operationalDate}</div>
                          <div style={{ fontSize: "0.84rem", color: "#0f172a" }}>
                            Heures à couvrir: {cell.rows.length} plage{cell.rows.length > 1 ? "s" : ""}
                          </div>
                          <div style={{ fontSize: "0.84rem", color: "#0f172a" }}>
                            Requis: <strong>{live?.requiredNow ?? required}</strong> · Planifiés:{" "}
                            <strong>{live?.plannedNow ?? planned}</strong> · Présents:{" "}
                            <strong>{live?.presentNow ?? 0}</strong> · Manques:{" "}
                            <strong style={{ color: (live?.status ?? "").startsWith("Manque") || manque > 0 ? "#b91c1c" : "#047857" }}>
                              {Math.max(0, (live?.requiredNow ?? required) - (live?.presentNow ?? 0))}
                            </strong>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {uniqueAssigned.length === 0 ? (
                              <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>Aucun assigné</span>
                            ) : (
                              uniqueAssigned.slice(0, 6).map((e) => {
                                const emp = employeeById.get(e.id);
                                return (
                                  <span
                                    key={e.id}
                                    style={{
                                      fontSize: "0.78rem",
                                      padding: "3px 8px",
                                      borderRadius: 8,
                                      background: "#f1f5f9",
                                      border: "1px solid #e2e8f0",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    {e.nom?.trim() || `#${e.id}`}
                                    {emp?.isMultiCompany ? (
                                      <span
                                        title="Travaille pour Oliem et Titan"
                                        style={{
                                          fontSize: "0.62rem",
                                          fontWeight: 600,
                                          color: "#475569",
                                          background: "rgba(148,163,184,0.2)",
                                          border: "1px solid rgba(148,163,184,0.45)",
                                          borderRadius: 999,
                                          padding: "1px 6px",
                                          lineHeight: 1.6,
                                        }}
                                      >
                                        Multi-compagnie
                                      </span>
                                    ) : null}
                                  </span>
                                );
                              })
                            )}
                          </div>
                          {cell.rows.length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: 16, fontSize: "0.8rem", color: "#64748b", display: "grid", gap: 4 }}>
                              {cell.rows.slice(0, 3).map((row) => (
                                <li key={row.windowId}>
                                  {row.startLocal}–{row.endLocal} · requis {row.required} · planifiés {row.staffed}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {live && live.absentEmployees.length > 0 ? (
                            <div style={{ fontSize: "0.78rem", color: "#b91c1c" }}>
                              Absents attendus:{" "}
                              {live.absentEmployees
                                .slice(0, 4)
                                .map((e) => e.nom?.trim() || `#${e.id}`)
                                .join(", ")}
                            </div>
                          ) : null}
                          {live && live.outsideEmployees.length > 0 ? (
                            <div style={{ fontSize: "0.78rem", color: "#b45309" }}>
                              Hors poste:{" "}
                              {live.outsideEmployees
                                .slice(0, 4)
                                .map((e) => e.nom?.trim() || `#${e.id}`)
                                .join(", ")}
                            </div>
                          ) : null}
                        </AppCard>
                      );
                    })}
                  </div>
                </div>
              )}
            </SectionCard>

            {payload.alerts.length > 0 ? (
              <SectionCard title="Alertes" tone="muted">
                <ul style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
                  {payload.alerts.map((a, i) => (
                    <li key={`${a.windowId}-${a.weekday}-${i}`} style={{ marginBottom: 6 }}>
                      {a.message}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            <SectionCard
              title="Départements"
              subtitle="Affectation depuis la fiche employé (principal / secondaire). La couverture compte les employés dont le département correspond et l’horaire est actif pour la planification."
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
                  gap: "var(--ui-space-4)",
                  alignItems: "stretch",
                }}
              >
                {payload.departments.map((dept) => {
                  const cov = coverageByDepartment.get(dept.key) ?? [];
                  const emps = employeesByDepartment.get(dept.key) ?? [];
                  const manque = cov.filter((c: EffectifsCoverageRow) => c.coverageCategory === "manque").length;
                  const partial = cov.filter(
                    (c: EffectifsCoverageRow) => c.coverageCategory === "partielle"
                  ).length;

                  return (
                    <AppCard
                      key={dept.key}
                      className="ui-stack-sm h-full rounded-2xl"
                      tone="elevated"
                      style={{ minHeight: 220 }}
                    >
                      <h3 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 800 }}>
                        {dept.label}
                      </h3>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                        {cov.length} ligne{cov.length > 1 ? "s" : ""} de couverture
                        {manque > 0 ? ` · ${manque} manque${manque > 1 ? "s" : ""}` : ""}
                        {partial > 0 ? ` · ${partial} partielle${partial > 1 ? "s" : ""}` : ""}
                      </p>
                      <div className="ui-stack-xs" style={{ marginTop: 8, flex: 1 }}>
                        <span className="ui-eyebrow">
                          Employés ({emps.length})
                        </span>
                        {emps.length === 0 ? (
                          <span style={{ color: "#94a3b8", fontSize: "0.88rem" }}>
                            Aucun employé affecté à ce département.
                          </span>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            {emps.map((e: EffectifsEmployee) => {
                              const isPrimary = e.departmentKey === dept.key;
                              const hasPlanMismatch =
                                e.planningMismatchDepartments.length > 0;
                              return (
                                <div
                                  key={`${dept.key}-${e.id}`}
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 10px",
                                    borderRadius: 12,
                                    background: "rgba(248,250,252,0.95)",
                                    border: "1px solid #e2e8f0",
                                  }}
                                >
                                  {!canEditOps ? (
                                    <span
                                      style={{
                                        fontSize: "0.82rem",
                                        padding: "4px 10px",
                                        fontWeight: 600,
                                        color: "#0f172a",
                                      }}
                                    >
                                      {e.nom?.trim() || `#${e.id}`}
                                    </span>
                                  ) : (
                                    <Link
                                      href={`/direction/ressources/employes/${e.id}`}
                                      className="tagora-dark-outline-action"
                                      style={{
                                        fontSize: "0.82rem",
                                        padding: "4px 10px",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {e.nom?.trim() || `#${e.id}`}
                                    </Link>
                                  )}
                                  <span
                                    style={{
                                      fontSize: "0.72rem",
                                      fontWeight: 700,
                                      padding: "2px 8px",
                                      borderRadius: 8,
                                      background: isPrimary
                                        ? "rgba(59,130,246,0.15)"
                                        : "rgba(148,163,184,0.2)",
                                      color: isPrimary ? "#1d4ed8" : "#475569",
                                    }}
                                  >
                                    {isPrimary ? "Principal" : "Secondaire"}
                                  </span>
                                  {e.canDeliver ? (
                                    <span
                                      style={{
                                        fontSize: "0.72rem",
                                        fontWeight: 700,
                                        padding: "2px 8px",
                                        borderRadius: 8,
                                        background: "rgba(16,185,129,0.15)",
                                        color: "#047857",
                                      }}
                                      title="Peut faire des livraisons"
                                    >
                                      Livreur
                                    </span>
                                  ) : null}
                                  {!e.scheduleActive ? (
                                    <span
                                      style={{
                                        fontSize: "0.72rem",
                                        color: "#b45309",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Horaire inactif (planif.)
                                    </span>
                                  ) : null}
                                  {hasPlanMismatch ? (
                                    <span
                                      style={{
                                        fontSize: "0.72rem",
                                        color: "#b91c1c",
                                        fontWeight: 600,
                                      }}
                                      title={`Horaire sur plages hors affectation : ${e.planningMismatchDepartments.map((k) => departmentLabelFromKey(k)).join(", ")}`}
                                    >
                                      Écart planification
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </AppCard>
                  );
                })}
              </div>
            </SectionCard>

            {payload.deliveryNeeds.length > 0 ? (
              <SectionCard
                title="Besoins livraison (lecture)"
                subtitle="Volume planifié sur 14 jours."
                tone="muted"
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {payload.deliveryNeeds.map((d) => (
                    <span
                      key={d.date}
                      style={{
                        display: "inline-flex",
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "rgba(59,130,246,0.1)",
                        fontSize: "0.85rem",
                      }}
                    >
                      {d.date}: {d.count} opération{d.count > 1 ? "s" : ""}
                    </span>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            {employeesByDepartment.has("_unassigned") ? (
              <SectionCard
                title="Employés non assignés à un département plancher"
                subtitle="Attribuez un département principal ou des secondaires dans la fiche employé."
                tone="muted"
              >
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
                  }}
                >
                  {(employeesByDepartment.get("_unassigned") ?? []).map(
                    (e: EffectifsEmployee) => (
                      <AppCard
                        key={e.id}
                        className="ui-stack-sm rounded-2xl"
                        tone="elevated"
                        style={{ margin: 0 }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div className="ui-stack-xs">
                            <div style={{ fontWeight: 800, color: "#0f172a" }}>
                              {e.nom?.trim() || `Employé #${e.id}`}
                            </div>
                            {e.planningMismatchDepartments.length > 0 ? (
                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  color: "#b45309",
                                  maxWidth: 320,
                                }}
                              >
                                Horaire présent sur des plages (
                                {e.planningMismatchDepartments
                                  .map((k) => departmentLabelFromKey(k))
                                  .join(", ")}
                                ) sans affectation — à corriger.
                              </div>
                            ) : null}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {!!canEditOps ? (
                              <Link
                                href={`/direction/ressources/employes/${e.id}?effectifs=1#affectation-effectifs`}
                                className="tagora-dark-action"
                                style={{
                                  fontSize: "0.82rem",
                                  padding: "8px 14px",
                                  borderRadius: 12,
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                }}
                              >
                                Configurer
                              </Link>
                            ) : null}
                            {!!canEditOps ? (
                              <Link
                                href={`/direction/ressources/employes/${e.id}`}
                                className="tagora-dark-outline-action"
                                style={{
                                  fontSize: "0.82rem",
                                  padding: "8px 14px",
                                  borderRadius: 12,
                                }}
                              >
                                Fiche
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </AppCard>
                    )
                  )}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              title="Grille horaires employés"
              subtitle="Planning hebdomadaire déclaré (lecture seule)."
            >
              <AppCard className="ui-stack-md rounded-2xl" style={{ overflowX: "auto" }}>
            <p className="ui-eyebrow" style={{ margin: 0 }}>
              Grille horaire hebdomadaire (tous employés actifs)
            </p>
            {payload.schedules.length === 0 ? (
              <p style={{ color: "#64748b" }}>Aucune donnée.</p>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.9rem",
                  minWidth: 720,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ textAlign: "left", padding: "10px 12px" }}>Employé</th>
                    {payload.schedules[0]?.days.map((d) => (
                      <th
                        key={d.weekday}
                        style={{
                          textAlign: "center",
                          padding: "10px 8px",
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        {d.weekdayLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.schedules.map((sched) => {
                    const nom =
                      payload.employees.find((e) => e.id === sched.employeeId)?.nom ?? null;
                    return (
                      <tr key={sched.employeeId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 12px" }}>
                          {!canEditOps ? (
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "4px 10px",
                                fontSize: "0.88rem",
                                fontWeight: 600,
                                color: "#0f172a",
                              }}
                            >
                              {nom?.trim() || `Employé #${sched.employeeId}`}
                            </span>
                          ) : (
                            <Link
                              href={`/direction/ressources/employes/${sched.employeeId}`}
                              className="tagora-dark-outline-action"
                              style={{
                                display: "inline-flex",
                                padding: "4px 10px",
                                fontSize: "0.88rem",
                              }}
                            >
                              {nom?.trim() || `Employé #${sched.employeeId}`}
                            </Link>
                          )}
                        </td>
                        {sched.days.map((d) => (
                          <td
                            key={d.weekday}
                            style={{
                              padding: "10px 8px",
                              textAlign: "center",
                              color: "#0f172a",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {dayCell(d)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </AppCard>
            </SectionCard>
            </>
            ) : null}

            {detailPanel && payload ? (
              <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setDetailPanel(null)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    border: "none",
                    background: "rgba(15,23,42,0.42)",
                    cursor: "pointer",
                  }}
                />
                <aside
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: "min(460px, 100vw)",
                    background: "#fff",
                    boxShadow: "-16px 0 48px rgba(15,23,42,0.18)",
                    overflowY: "auto",
                    padding: 24,
                    borderTopLeftRadius: 20,
                    borderBottomLeftRadius: 20,
                  }}
                >
                  {(() => {
                    const cell = buildPlannedDeptDayCell({
                      departmentKey: detailPanel.departmentKey,
                      date: detailPanel.date,
                      windows: payload.coverageWindows,
                      employees: payload.employees,
                      schedules: payload.schedules,
                      exceptions: payload.calendarExceptions,
                      approvedOverrides,
                      templateCoverageRows: payload.coverage,
                    });
                    const deliveryCount =
                      payload.deliveryNeeds.find((d) => d.date === detailPanel.date)?.count ?? 0;
                    const st = categoryStyle(cell.aggregateCategory);
                    const deptEmployees =
                      employeesByDepartment.get(detailPanel.departmentKey) ?? [];
                    const liveDept = livePresenceByDepartment.byDept.get(detailPanel.departmentKey);
                    return (
                      <div className="ui-stack-md">
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 12,
                          }}
                        >
                          <div>
                            <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 900 }}>
                              {departmentLabelFromKey(detailPanel.departmentKey)}
                            </h2>
                            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                              {detailPanel.date}
                            </p>
                          </div>
                          <SecondaryButton type="button" onClick={() => setDetailPanel(null)}>
                            Fermer
                          </SecondaryButton>
                        </div>
                        <div
                          style={{
                            borderRadius: 14,
                            padding: "12px 14px",
                            background: st.bg,
                            color: st.color,
                            fontWeight: 800,
                          }}
                        >
                          {cell.primaryLabel}
                          {cell.secondaryLabel ? ` · ${cell.secondaryLabel}` : ""}
                        </div>
                        <div className="ui-eyebrow">Plages à couvrir ce jour</div>
                        {cell.rows.length === 0 ? (
                          <p style={{ margin: 0, color: "#94a3b8" }}>Aucune plage configurée.</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10 }}>
                            {cell.rows.map((row) => (
                              <li key={row.windowId} style={{ fontSize: "0.88rem", color: "#334155" }}>
                                <strong>
                                  {row.startLocal} – {row.endLocal}
                                </strong>{" "}
                                · requis {row.required} · planifiés {row.staffed} ·{" "}
                                {row.locationLabel}
                                <div style={{ marginTop: 4, fontSize: "0.8rem", color: "#64748b" }}>
                                  {row.coveragePrimary}
                                  {row.coverageSecondary ? ` — ${row.coverageSecondary}` : ""}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="ui-eyebrow">Employés assignés</div>
                        {cell.rows.flatMap((r) => r.scheduledEmployees).length === 0 ? (
                          <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>
                            Aucun employé ne couvre ces plages sur ce jour.
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {Array.from(
                              new Map(
                                cell.rows.flatMap((r) =>
                                  r.scheduledEmployees.map((e) => [e.id, e] as const)
                                )
                              ).values()
                            ).map((e) => {
                              const emp = employeeById.get(e.id);
                              const multiBadge = emp?.isMultiCompany ? (
                                <span
                                  title="Travaille pour Oliem et Titan"
                                  style={{
                                    fontSize: "0.62rem",
                                    fontWeight: 600,
                                    color: "#475569",
                                    background: "rgba(148,163,184,0.2)",
                                    border: "1px solid rgba(148,163,184,0.45)",
                                    borderRadius: 999,
                                    padding: "1px 6px",
                                    marginLeft: 6,
                                  }}
                                >
                                  Multi-compagnie
                                </span>
                              ) : null;
                              if (!canEditOps) {
                                return (
                                  <span
                                    key={e.id}
                                    style={{
                                      fontSize: "0.82rem",
                                      padding: "6px 12px",
                                      borderRadius: 10,
                                      background: "rgba(241,245,249,0.95)",
                                      border: "1px solid #e2e8f0",
                                      fontWeight: 600,
                                      display: "inline-flex",
                                      alignItems: "center",
                                    }}
                                  >
                                    {e.nom?.trim() || `#${e.id}`}
                                    {multiBadge}
                                  </span>
                                );
                              }
                              return (
                                <Link
                                  key={e.id}
                                  href={`/direction/ressources/employes/${e.id}`}
                                  className="tagora-dark-outline-action"
                                  style={{
                                    fontSize: "0.82rem",
                                    padding: "6px 12px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                  }}
                                >
                                  {e.nom?.trim() || `#${e.id}`}
                                  {multiBadge}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                        {liveDept ? (
                          <>
                            <div className="ui-eyebrow">Présence live (horodateur)</div>
                            <div style={{ fontSize: "0.84rem", color: "#334155" }}>
                              Requis: {liveDept.requiredNow} · Planifiés: {liveDept.plannedNow} · Présents:{" "}
                              {liveDept.presentNow} · Absents: {liveDept.absentNow}
                            </div>
                            <div style={{ fontSize: "0.84rem", color: "#334155" }}>
                              Hors poste: {liveDept.horsPoste} · Pause/Dîner: {liveDept.pauseDinner}
                            </div>
                            <div style={{ fontSize: "0.84rem", fontWeight: 800, color: liveDept.status.startsWith("Manque") ? "#b91c1c" : "#047857" }}>
                              Action recommandée:{" "}
                              {liveDept.status.startsWith("Manque")
                                ? "Ajouter un quart ou redéployer un employé immédiatement."
                                : liveDept.horsPoste > 0
                                  ? "Vérifier les employés hors poste."
                                  : "Maintenir la couverture actuelle."}
                            </div>
                          </>
                        ) : null}
                        {detailPanel.departmentKey === "livreur" && deliveryCount > 0 ? (
                          <div
                            className="rounded-xl border border-blue-200 bg-blue-50/80 p-3"
                            style={{ fontSize: "0.88rem" }}
                          >
                            <strong>Besoin livraison ce jour :</strong> {deliveryCount} opération
                            {deliveryCount > 1 ? "s" : ""} planifiée
                            {deliveryCount > 1 ? "s" : ""}.
                          </div>
                        ) : null}
                        {!!canEditOps ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            <Link
                              href="/direction/ressources"
                              className="tagora-dark-action"
                              style={{
                                fontSize: "0.82rem",
                                padding: "8px 14px",
                                borderRadius: 12,
                                textDecoration: "none",
                              }}
                            >
                              Attribuer un employé
                            </Link>
                            {deptEmployees[0] ? (
                              <Link
                                href={`/direction/ressources/employes/${deptEmployees[0].id}?effectifs=1#affectation-effectifs`}
                                className="tagora-dark-outline-action"
                                style={{
                                  fontSize: "0.82rem",
                                  padding: "8px 14px",
                                  borderRadius: 12,
                                }}
                              >
                                Fiche effectifs
                              </Link>
                            ) : null}
                            {canEditOps ? (
                              <button
                                type="button"
                                className="tagora-dark-outline-action"
                                onClick={() => {
                                  setMainTab("config");
                                  setDetailPanel(null);
                                }}
                                style={{ fontSize: "0.82rem", padding: "8px 14px", borderRadius: 12 }}
                              >
                                Modifier la plage
                              </button>
                            ) : null}
                            {detailPanel.departmentKey === "livreur" ? (
                              <Link
                                href="/direction/livraisons"
                                className="tagora-dark-outline-action"
                                style={{
                                  fontSize: "0.82rem",
                                  padding: "8px 14px",
                                  borderRadius: 12,
                                }}
                              >
                                Ouvrir livraisons
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </aside>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
