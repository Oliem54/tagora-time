"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  PenLine,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import HorodateurRetroCorrectionModal from "@/app/components/horodateur/HorodateurRetroCorrectionModal";
import HorodateurLiveRowActions from "@/app/direction/horodateur/HorodateurLiveRowActions";
import HorodateurDirectionPageShell from "@/app/direction/horodateur/HorodateurDirectionPageShell";
import HorodateurDirectionPrimaryActions from "@/app/direction/horodateur/HorodateurDirectionPrimaryActions";
import HorodateurDirectionAlertConfigPanel from "@/app/direction/horodateur/HorodateurDirectionAlertConfigPanel";
import HorodateurPendingExceptionCard from "@/app/direction/horodateur/HorodateurPendingExceptionCard";
import AppCard from "@/app/components/ui/AppCard";
import TagoraIconBadge from "@/app/components/TagoraIconBadge";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  isStaffRetroCorrectionException,
  type StaffRetroForgottenEventType,
} from "@/app/lib/horodateur-retro-correction.shared";
import { MISSING_EXPECTED_PUNCH_PRIORITY_REASON_LABEL } from "@/app/lib/horodateur-expected-punch-missing.shared";
import { resolveHorodateurPendingExceptionDisplay } from "@/app/lib/horodateur-exception-display.shared";
import { getLocalWorkDate } from "@/app/lib/horodateur-v1/rules";
import { supabase } from "@/app/lib/supabase/client";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import { normalizePhoneNumber } from "@/app/lib/timeclock-api.client";

type LiveRow = {
  employeeId: number;
  employee_id?: number | null;
  fullName: string | null;
  email: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  primaryCompany: "oliem_solutions" | "titan_produits_industriels" | null;
  currentState: string;
  status?: string | null;
  currentEventType?: string | null;
  startedAt?: string | null;
  activeExceptionCount?: number;
  alertFlags?: {
    hasOpenException?: boolean;
    weeklyOvertime?: boolean;
    missingSchedule?: boolean;
  } | null;
  lastEventAt: string | null;
  lastEventType: string | null;
  todayShift: {
    shift_start_at: string | null;
    shift_end_at?: string | null;
    payable_minutes: number;
    worked_minutes?: number;
    pending_exception_minutes?: number;
    anomalies_count?: number;
    status?: string;
  } | null;
  weekWorkedMinutes: number;
  weekTargetMinutes: number;
  weekRemainingMinutes: number;
  projectedOverflowMinutes: number;
  hasOpenException: boolean;
  todayTimeDisplay?: {
    officialPayableMinutes: number;
    livePayableMinutes: number;
    hasOpenShiftAccrual: boolean;
    pendingPunchBlocksAccrual: boolean;
    openShiftWorkDateMismatch: boolean;
    openShiftWorkDate: string | null;
    openShiftSafetyCapReached?: boolean;
  } | null;
};

type PendingException = {
  id: string;
  employee_id: number;
  exception_type: string;
  reason_label: string;
  details: string | null;
  impact_minutes: number;
  status: string;
  direction_email_notified_at?: string | null;
  direction_sms_notified_at?: string | null;
  direction_reminder_email_notified_at?: string | null;
  direction_reminder_sms_notified_at?: string | null;
  employee: {
    employeeId: number;
    fullName: string | null;
    email: string | null;
  } | null;
  event: {
    event_type: string;
    occurredAt?: string | null;
    occurred_at?: string | null;
    event_time?: string | null;
    notes?: string | null;
    note?: string | null;
  } | null;
};

type AlertConfig = {
  email_enabled: boolean;
  sms_enabled: boolean;
  reminder_delay_minutes: number;
  direction_emails: string[];
  direction_sms_numbers: string[];
};

type LiveFilter = "tous" | "en_quart" | "en_attente" | "exceptions";

type WeeklyProjectionPayload = {
  workedMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  projectedOverflowMinutes: number;
};

type RouteDebugPayload = {
  userId?: string | null;
  email?: string | null;
  authSource?: "cookie" | "bearer" | "none";
  directionCheck?: boolean;
  reason?: string | null;
};

type DirectionMutationPayload = {
  currentState?: {
    current_state?: string;
    status?: string | null;
    last_event_at: string | null;
    last_event_type: string | null;
    has_open_exception: boolean;
    currentEventType?: string | null;
    startedAt?: string | null;
  };
  shift?: LiveRow["todayShift"];
  weeklyProjection?: WeeklyProjectionPayload;
  event?: {
    employee_id: number;
    event_type: string;
    occurredAt: string | null;
  };
  exception?: {
    employee_id: number;
    id: string;
    exception_type?: string;
    reason_label?: string;
    details?: string | null;
    impact_minutes?: number;
    status?: string;
  };
};

const HORODATEUR_NOTIFICATION_CONFIG_MISSING_MESSAGE =
  "Configuration des notifications à compléter";

const DIRECTION_EVENT_TYPES = [
  "punch_in",
  "break_start",
  "break_end",
  "meal_start",
  "meal_end",
  "punch_out",
] as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("fr-CA");
}

function formatShortDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("fr-CA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function collectLiveShiftHints(row: LiveRow): string[] {
  const hints: string[] = [];

  if (row.todayTimeDisplay?.pendingPunchBlocksAccrual) {
    hints.push("Punch en attente");
  }
  if (row.todayTimeDisplay?.openShiftSafetyCapReached) {
    hints.push("Quart > 14 h — à approuver");
  }
  if (row.todayTimeDisplay?.openShiftWorkDateMismatch) {
    hints.push(`Quart ouvert depuis ${row.todayTimeDisplay.openShiftWorkDate ?? "?"}`);
  }
  if (row.todayShift?.status === "en_attente") {
    hints.push("Quart en attente");
  }
  if ((row.todayShift?.anomalies_count ?? 0) > 0) {
    hints.push("Anomalie détectée");
  }

  return hints;
}

function toIsoWithOptionalTime(
  baseIso: string | null | undefined,
  maybeTime: string | null
): string | null {
  const trimmed = String(maybeTime ?? "").trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match || !baseIso) return null;
  const base = new Date(baseIso);
  if (!Number.isFinite(base.getTime())) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  const corrected = new Date(base);
  corrected.setHours(hh, mm, 0, 0);
  return corrected.toISOString();
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, totalMinutes || 0);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function getStateLabel(value: string | null | undefined) {
  switch (value) {
    case "en_quart":
      return "En quart";
    case "en_pause":
      return "En pause";
    case "en_diner":
      return "En diner";
    case "termine":
      return "Termine";
    default:
      return "Hors quart";
  }
}

function getStateTone(value: string | null | undefined) {
  switch (value) {
    case "en_quart":
      return "success" as const;
    case "en_pause":
    case "en_diner":
      return "warning" as const;
    case "termine":
      return "info" as const;
    default:
      return "default" as const;
  }
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function getProgressTone(options: {
  ratio: number;
  hasOpenException: boolean;
  anomaliesCount: number;
}) {
  if (options.hasOpenException || options.anomaliesCount > 0 || options.ratio > 1) {
    return {
      bar: "#dc2626",
      track: "rgba(220, 38, 38, 0.14)",
      text: "#991b1b",
    };
  }

  if (options.ratio >= 0.85) {
    return {
      bar: "#f59e0b",
      track: "rgba(245, 158, 11, 0.16)",
      text: "#b45309",
    };
  }

  return {
    bar: "#16a34a",
    track: "rgba(22, 163, 74, 0.14)",
    text: "#166534",
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function splitListInput(value: string) {
  return value
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEmailList(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => splitListInput(value))
        .map((value) => value.toLowerCase())
        .filter(Boolean)
    )
  );
}

function normalizePhoneList(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => splitListInput(value))
        .map((value) => normalizePhoneNumber(value))
        .filter(Boolean)
    )
  );
}

function resolveOccurredAt(value: {
  occurredAt?: string | null;
  occurred_at?: string | null;
  event_time?: string | null;
}) {
  return value.occurredAt ?? value.occurred_at ?? value.event_time ?? null;
}

function getRowState(row: LiveRow) {
  return row.currentState || row.status || "hors_quart";
}

function resolveDisplayedPayableMinutes(row: LiveRow) {
  if (row.todayTimeDisplay?.hasOpenShiftAccrual) {
    return Math.max(0, row.todayTimeDisplay.livePayableMinutes);
  }
  return Math.max(
    0,
    row.todayTimeDisplay?.officialPayableMinutes ?? row.todayShift?.payable_minutes ?? 0
  );
}

function liveRowNeedsAttention(row: LiveRow) {
  return (
    row.hasOpenException ||
    (row.activeExceptionCount ?? 0) > 0 ||
    (row.todayShift?.anomalies_count ?? 0) > 0 ||
    row.todayShift?.status === "en_attente" ||
    Boolean(row.todayTimeDisplay?.openShiftSafetyCapReached) ||
    Boolean(row.todayTimeDisplay?.openShiftWorkDateMismatch) ||
    Boolean(row.todayTimeDisplay?.pendingPunchBlocksAccrual)
  );
}

function resolveEmployeePhoneHref(row: LiveRow): string | null {
  const raw = (row.phone ?? row.phoneNumber ?? "").trim();
  if (!raw) {
    return null;
  }

  const normalized = normalizePhoneNumber(raw);
  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/\D/g, "");
  return digits ? `tel:${digits}` : null;
}

function countRowExceptions(row: LiveRow, pending: PendingException[]) {
  const employeeId = row.employeeId || row.employee_id || 0;
  return Math.max(
    pending.filter((item) => item.employee_id === employeeId).length,
    row.activeExceptionCount ?? 0,
    row.alertFlags?.hasOpenException ? 1 : 0
  );
}

function normalizeLiveRow(raw: unknown): LiveRow {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const employeeIdValue = Number(row.employeeId ?? row.employee_id);
  const employeeId = Number.isFinite(employeeIdValue) && employeeIdValue > 0 ? employeeIdValue : 0;
  const currentState =
    typeof row.currentState === "string"
      ? row.currentState
      : typeof row.status === "string"
        ? row.status
        : "hors_quart";
  const todayShift =
    row.todayShift && typeof row.todayShift === "object"
      ? (row.todayShift as LiveRow["todayShift"])
      : row.shift && typeof row.shift === "object"
        ? (row.shift as LiveRow["todayShift"])
        : null;
  const activeExceptionCount =
    typeof row.activeExceptionCount === "number"
      ? row.activeExceptionCount
      : typeof row.openExceptionCount === "number"
        ? row.openExceptionCount
        : 0;
  const alertFlags =
    row.alertFlags && typeof row.alertFlags === "object"
      ? (row.alertFlags as LiveRow["alertFlags"])
      : null;
  const timeDisplayRaw =
    row.todayTimeDisplay && typeof row.todayTimeDisplay === "object"
      ? (row.todayTimeDisplay as Record<string, unknown>)
      : null;
  const todayTimeDisplay = timeDisplayRaw
    ? {
        officialPayableMinutes:
          typeof timeDisplayRaw.officialPayableMinutes === "number"
            ? timeDisplayRaw.officialPayableMinutes
            : 0,
        livePayableMinutes:
          typeof timeDisplayRaw.livePayableMinutes === "number"
            ? timeDisplayRaw.livePayableMinutes
            : 0,
        hasOpenShiftAccrual: Boolean(timeDisplayRaw.hasOpenShiftAccrual),
        pendingPunchBlocksAccrual: Boolean(timeDisplayRaw.pendingPunchBlocksAccrual),
        openShiftWorkDateMismatch: Boolean(timeDisplayRaw.openShiftWorkDateMismatch),
        openShiftWorkDate:
          typeof timeDisplayRaw.openShiftWorkDate === "string"
            ? timeDisplayRaw.openShiftWorkDate
            : null,
        openShiftSafetyCapReached: Boolean(timeDisplayRaw.openShiftSafetyCapReached),
      }
    : null;

  return {
    employeeId,
    employee_id: employeeId || null,
    fullName: typeof row.fullName === "string" ? row.fullName : null,
    email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : typeof row.phoneNumber === "string" ? row.phoneNumber : null,
    phoneNumber:
      typeof row.phoneNumber === "string" ? row.phoneNumber : typeof row.phone === "string" ? row.phone : null,
    primaryCompany:
      row.primaryCompany === "oliem_solutions" || row.primaryCompany === "titan_produits_industriels"
        ? row.primaryCompany
        : null,
    currentState,
    status: typeof row.status === "string" ? row.status : currentState,
    currentEventType:
      typeof row.currentEventType === "string"
        ? row.currentEventType
        : typeof row.lastEventType === "string"
          ? row.lastEventType
          : null,
    startedAt:
      typeof row.startedAt === "string"
        ? row.startedAt
        : todayShift?.shift_start_at ?? null,
    activeExceptionCount,
    alertFlags,
    lastEventAt:
      typeof row.lastEventAt === "string"
        ? row.lastEventAt
        : typeof row.last_event_at === "string"
          ? row.last_event_at
          : null,
    lastEventType:
      typeof row.lastEventType === "string"
        ? row.lastEventType
        : typeof row.currentEventType === "string"
          ? row.currentEventType
          : typeof row.last_event_type === "string"
            ? row.last_event_type
            : null,
    todayShift,
    weekWorkedMinutes:
      typeof row.weekWorkedMinutes === "number"
        ? row.weekWorkedMinutes
        : typeof row.weeklyProgressMinutes === "number"
          ? row.weeklyProgressMinutes
          : 0,
    weekTargetMinutes:
      typeof row.weekTargetMinutes === "number"
        ? row.weekTargetMinutes
        : typeof row.weeklyTargetMinutes === "number"
          ? row.weeklyTargetMinutes
          : 40 * 60,
    weekRemainingMinutes:
      typeof row.weekRemainingMinutes === "number"
        ? row.weekRemainingMinutes
        : 0,
    projectedOverflowMinutes:
      typeof row.projectedOverflowMinutes === "number"
        ? row.projectedOverflowMinutes
        : 0,
    hasOpenException:
      Boolean(row.hasOpenException) ||
      Boolean(alertFlags?.hasOpenException) ||
      activeExceptionCount > 0,
    todayTimeDisplay,
  };
}

function normalizePendingException(raw: unknown): PendingException | null {
  const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!item) {
    return null;
  }

  return {
    id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
    employee_id: Number(item.employee_id ?? item.employeeId) || 0,
    exception_type: typeof item.exception_type === "string" ? item.exception_type : "unknown",
    reason_label: typeof item.reason_label === "string" ? item.reason_label : "Exception",
    details: typeof item.details === "string" ? item.details : null,
    impact_minutes: typeof item.impact_minutes === "number" ? item.impact_minutes : 0,
    status: typeof item.status === "string" ? item.status : "en_attente",
    direction_email_notified_at:
      typeof item.direction_email_notified_at === "string"
        ? item.direction_email_notified_at
        : null,
    direction_sms_notified_at:
      typeof item.direction_sms_notified_at === "string"
        ? item.direction_sms_notified_at
        : null,
    direction_reminder_email_notified_at:
      typeof item.direction_reminder_email_notified_at === "string"
        ? item.direction_reminder_email_notified_at
        : null,
    direction_reminder_sms_notified_at:
      typeof item.direction_reminder_sms_notified_at === "string"
        ? item.direction_reminder_sms_notified_at
        : null,
    employee:
      item.employee && typeof item.employee === "object"
        ? {
            employeeId:
              Number(
                (item.employee as Record<string, unknown>).employeeId ??
                  (item.employee as Record<string, unknown>).employee_id
              ) || 0,
            fullName:
              typeof (item.employee as Record<string, unknown>).fullName === "string"
                ? ((item.employee as Record<string, unknown>).fullName as string)
                : null,
            email:
              typeof (item.employee as Record<string, unknown>).email === "string"
                ? ((item.employee as Record<string, unknown>).email as string)
                : null,
          }
        : null,
    event:
      item.event && typeof item.event === "object"
        ? {
            event_type:
              typeof (item.event as Record<string, unknown>).event_type === "string"
                ? ((item.event as Record<string, unknown>).event_type as string)
                : "unknown",
            occurredAt: resolveOccurredAt(item.event as Record<string, unknown>),
            occurred_at: resolveOccurredAt(item.event as Record<string, unknown>),
            event_time: resolveOccurredAt(item.event as Record<string, unknown>),
            notes:
              typeof (item.event as Record<string, unknown>).notes === "string"
                ? ((item.event as Record<string, unknown>).notes as string)
                : typeof (item.event as Record<string, unknown>).note === "string"
                  ? ((item.event as Record<string, unknown>).note as string)
                  : null,
            note:
              typeof (item.event as Record<string, unknown>).note === "string"
                ? ((item.event as Record<string, unknown>).note as string)
                : typeof (item.event as Record<string, unknown>).notes === "string"
                  ? ((item.event as Record<string, unknown>).notes as string)
                  : null,
          }
        : null,
  };
}

export default function DirectionHorodateurPage() {
  const { loading: accessLoading, hasPermission, role } = useCurrentAccess();
  const canUseTerrain = hasPermission("terrain");
  const isAdmin = role === "admin";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [board, setBoard] = useState<LiveRow[]>([]);
  const [exceptions, setExceptions] = useState<PendingException[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEventType, setSelectedEventType] =
    useState<(typeof DIRECTION_EVENT_TYPES)[number]>("punch_in");
  const [note, setNote] = useState("");
  const [liveFilter, setLiveFilter] = useState<LiveFilter>("tous");
  const [refusingExceptionId, setRefusingExceptionId] = useState<string | null>(null);
  const [refuseNoteById, setRefuseNoteById] = useState<Record<string, string>>({});
  const [timeCorrectionById, setTimeCorrectionById] = useState<
    Record<string, { main: string; related: string }>
  >({});
  /** Date `work_date` utilisée pour la colonne « Quart du jour » (alignée sur l’API live, Toronto). */
  const [liveTodayWorkDate, setLiveTodayWorkDate] = useState<string | null>(null);
  const [config, setConfig] = useState<AlertConfig>({
    email_enabled: true,
    sms_enabled: false,
    reminder_delay_minutes: 5,
    direction_emails: [],
    direction_sms_numbers: [],
  });
  const [retroModalOpen, setRetroModalOpen] = useState(false);
  const [retroSaving, setRetroSaving] = useState(false);
  const [retroError, setRetroError] = useState<string | null>(null);
  const [retroEmployeeId, setRetroEmployeeId] = useState("");
  const [retroWorkDate, setRetroWorkDate] = useState("");
  const [retroEventType, setRetroEventType] =
    useState<StaffRetroForgottenEventType>("punch_in");
  const [retroTime, setRetroTime] = useState("");
  const [retroReason, setRetroReason] = useState("");
  const [liveDetailEmployeeId, setLiveDetailEmployeeId] = useState<number | null>(null);
  const [highlightedExceptionEmployeeId, setHighlightedExceptionEmployeeId] = useState<
    number | null
  >(null);
  const punchManualSectionRef = useRef<HTMLDivElement>(null);
  const exceptionsSectionRef = useRef<HTMLDivElement>(null);

  const retroEmployeeOptions = useMemo(
    () =>
      board.map((row) => ({
        id: row.employeeId,
        label: row.fullName || row.email || `#${row.employeeId}`,
      })),
    [board]
  );

  const counts = useMemo(() => {
    const active = board.filter((row) => getRowState(row) === "en_quart").length;
    const paused = board.filter(
      (row) => getRowState(row) === "en_pause" || getRowState(row) === "en_diner"
    ).length;
    const pending = exceptions.length;

    return {
      employees: board.length,
      active,
      paused,
      pending,
    };
  }, [board, exceptions.length]);

  const hasEmployees = board.length > 0;
  const hasExceptions = exceptions.length > 0;
  const isBusy = activeActionKey !== null;
  const invalidEmails = useMemo(
    () =>
      config.direction_emails.filter((item) => item.trim().length > 0 && !isValidEmail(item)),
    [config.direction_emails]
  );
  const globalMetrics = useMemo(() => {
    const employeesInShift = board.filter((row) => getRowState(row) === "en_quart").length;
    const totalTodayMinutes = board.reduce(
      (sum, row) => sum + resolveDisplayedPayableMinutes(row),
      0
    );
    const totalWeekWorkedMinutes = board.reduce(
      (sum, row) => sum + Math.max(0, row.weekWorkedMinutes ?? 0),
      0
    );
    const totalWeekTargetMinutes = board.reduce(
      (sum, row) => sum + Math.max(0, row.weekTargetMinutes ?? 0),
      0
    );

    return {
      employeesInShift,
      inShiftPercent:
        board.length > 0 ? Math.round((employeesInShift / board.length) * 100) : 0,
      totalTodayMinutes,
      totalWeekWorkedMinutes,
      totalWeekTargetMinutes,
      teamProgressPercent:
        totalWeekTargetMinutes > 0
          ? Math.round((totalWeekWorkedMinutes / totalWeekTargetMinutes) * 100)
          : 0,
    };
  }, [board]);
  const filteredBoard = useMemo(() => {
    switch (liveFilter) {
      case "en_quart":
        return board.filter((row) => getRowState(row) === "en_quart");
      case "en_attente":
        return board.filter((row) => row.todayShift?.status === "en_attente");
      case "exceptions":
        return board.filter(
          (row) => row.hasOpenException || (row.activeExceptionCount ?? 0) > 0
        );
      default:
        return board;
    }
  }, [board, liveFilter]);

  const withToken = useCallback(async <T,>(
    runner: (token: string) => Promise<T>
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Session introuvable.");
    }

    return runner(session.access_token);
  }, []);

  const loadData = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      options?: { preserveMessage?: boolean }
    ) => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      try {
        const result = await withToken(async (_token) => {
          void _token;

          const [liveResponse, exceptionsResponse, configResponse] = await Promise.all([
            fetch("/api/direction/horodateur/live", {
              credentials: "same-origin",
            }),
            fetch("/api/direction/horodateur/exceptions", {
              credentials: "same-origin",
            }),
            fetch("/api/direction/horodateur/notifications/config", {
              credentials: "same-origin",
            }),
          ]);

          const [livePayload, exceptionsPayload, configPayload] = await Promise.all([
            liveResponse.json().catch(() => ({})),
            exceptionsResponse.json().catch(() => ({})),
            configResponse.json().catch(() => ({})),
          ]);

          return {
            live: {
              ok: liveResponse.ok,
              payload: livePayload as {
                error?: string;
                details?: string;
                hint?: string;
                board?: LiveRow[];
                todayWorkDate?: string;
                debug?: RouteDebugPayload;
              },
            },
            exceptions: {
              ok: exceptionsResponse.ok,
              payload: exceptionsPayload as {
                error?: string;
                details?: string;
                hint?: string;
                exceptions?: PendingException[];
              },
            },
            config: {
              ok: configResponse.ok,
              payload: configPayload as {
                error?: string;
                code?: string;
                details?: string;
                hint?: string;
                config?: AlertConfig;
              },
            },
          };
        });

        if (result.live.ok) {
          const twd = result.live.payload.todayWorkDate;
          setLiveTodayWorkDate(typeof twd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(twd) ? twd : null);
          setBoard(
            Array.isArray(result.live.payload.board)
              ? result.live.payload.board.map(normalizeLiveRow)
              : []
          );
        } else {
          setLiveTodayWorkDate(null);
          setBoard([]);
        }

        if (result.exceptions.ok) {
          setExceptions(
            Array.isArray(result.exceptions.payload.exceptions)
              ? result.exceptions.payload.exceptions
                  .map(normalizePendingException)
                  .filter((item): item is PendingException => item != null)
              : []
          );
        } else {
          setExceptions([]);
        }

        if (result.config.ok && result.config.payload.config) {
          setConfig(result.config.payload.config);
        }

        const errors: string[] = [];

        if (!result.live.ok) {
          errors.push(
            [
              "GET /api/direction/horodateur/live",
              result.live.payload.error ?? "erreur inconnue",
              result.live.payload.debug?.reason
                ? `reason=${result.live.payload.debug.reason}`
                : null,
              result.live.payload.debug?.authSource
                ? `source=${result.live.payload.debug.authSource}`
                : null,
              result.live.payload.debug?.userId
                ? `user=${result.live.payload.debug.userId}`
                : null,
              result.live.payload.debug?.email
                ? `email=${result.live.payload.debug.email}`
                : null,
              typeof result.live.payload.debug?.directionCheck === "boolean"
                ? `direction=${String(result.live.payload.debug.directionCheck)}`
                : null,
              result.live.payload.details,
              result.live.payload.hint,
            ]
              .filter(Boolean)
              .join(" - ")
          );
        }

        if (!result.exceptions.ok) {
          errors.push(
            [
              "GET /api/direction/horodateur/exceptions",
              result.exceptions.payload.error ?? "erreur inconnue",
              result.exceptions.payload.details,
              result.exceptions.payload.hint,
            ]
              .filter(Boolean)
              .join(" - ")
          );
        }

        if (!result.config.ok) {
          const cfgPayload = result.config.payload;
          if (
            cfgPayload.code === "horodateur_notification_config_unavailable" ||
            cfgPayload.error === HORODATEUR_NOTIFICATION_CONFIG_MISSING_MESSAGE
          ) {
            errors.push(HORODATEUR_NOTIFICATION_CONFIG_MISSING_MESSAGE);
          } else {
            errors.push(
              [
                "GET /api/direction/horodateur/notifications/config",
                cfgPayload.error ?? "erreur inconnue",
                cfgPayload.details,
                cfgPayload.hint,
              ]
                .filter(Boolean)
                .join(" - ")
            );
          }
        }

        if (errors.length > 0) {
          setError(errors.join(" | "));
        }

        if (!options?.preserveMessage) {
          setMessage("");
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Erreur de chargement."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [withToken]
  );

  useEffect(() => {
    if (accessLoading) {
      return;
    }

    if (!canUseTerrain) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    void loadData();
  }, [accessLoading, canUseTerrain, loadData]);

  function patchBoardRow(employeeId: number, payload: DirectionMutationPayload) {
    setBoard((current) =>
      current.map((row) => {
        if (row.employeeId !== employeeId) {
          if ((row.employee_id ?? null) !== employeeId) {
            return row;
          }
        }

        const currentStateValue =
          payload.currentState?.current_state ??
          payload.currentState?.status ??
          row.currentState;
        const openExceptionCount = row.activeExceptionCount ?? 0;
        const hasOpenException =
          payload.currentState?.has_open_exception ??
          (row.hasOpenException || openExceptionCount > 0);

        return {
          ...row,
          currentState: currentStateValue,
          status: currentStateValue,
          currentEventType:
            payload.currentState?.currentEventType ??
            payload.currentState?.last_event_type ??
            row.currentEventType,
          startedAt: payload.currentState?.startedAt ?? row.startedAt,
          lastEventAt: payload.currentState?.last_event_at ?? row.lastEventAt,
          lastEventType:
            payload.currentState?.last_event_type ??
            payload.currentState?.currentEventType ??
            row.lastEventType,
          hasOpenException,
          activeExceptionCount:
            hasOpenException && openExceptionCount === 0
              ? 1
              : row.activeExceptionCount,
          todayShift: payload.shift ?? row.todayShift,
          weekWorkedMinutes:
            payload.weeklyProjection?.workedMinutes ?? row.weekWorkedMinutes,
          weekTargetMinutes:
            payload.weeklyProjection?.targetMinutes ?? row.weekTargetMinutes,
          weekRemainingMinutes:
            payload.weeklyProjection?.remainingMinutes ?? row.weekRemainingMinutes,
          projectedOverflowMinutes:
            payload.weeklyProjection?.projectedOverflowMinutes ??
            row.projectedOverflowMinutes,
        };
      })
    );
  }

  function updateEmailRow(index: number, rawValue: string) {
    const parsedValues = splitListInput(rawValue);

    setConfig((current) => {
      const next = [...current.direction_emails];

      if (parsedValues.length <= 1) {
        next[index] = rawValue;
      } else {
        next.splice(index, 1, ...parsedValues);
      }

      return {
        ...current,
        direction_emails: next,
      };
    });
  }

  function updatePhoneRow(index: number, rawValue: string) {
    const parsedValues = splitListInput(rawValue);

    setConfig((current) => {
      const next = [...current.direction_sms_numbers];

      if (parsedValues.length <= 1) {
        next[index] = normalizePhoneNumber(rawValue);
      } else {
        next.splice(index, 1, ...parsedValues.map((item) => normalizePhoneNumber(item)));
      }

      return {
        ...current,
        direction_sms_numbers: next,
      };
    });
  }

  async function handleSaveConfig() {
    setActiveActionKey("save-config");
    setMessage("");
    setError("");

    try {
      await withToken(async (token) => {
        const response = await fetch("/api/direction/horodateur/notifications/config", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            emailEnabled: config.email_enabled,
            smsEnabled: config.sms_enabled,
            reminderDelayMinutes: config.reminder_delay_minutes,
            directionEmails: normalizeEmailList(config.direction_emails),
            directionSmsNumbers: normalizePhoneList(config.direction_sms_numbers),
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          if (
            typeof result.code === "string" &&
            result.code === "horodateur_notification_config_unavailable"
          ) {
            throw new Error(HORODATEUR_NOTIFICATION_CONFIG_MISSING_MESSAGE);
          }
          throw new Error(result.error ?? "Impossible d enregistrer la configuration.");
        }

        if (result.config) {
          setConfig(result.config as AlertConfig);
        }
      });

      setMessage("Configuration des alertes enregistree.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erreur de configuration.");
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleManualPunch() {
    const employeeId = Number(selectedEmployeeId);

    if (!Number.isFinite(employeeId)) {
      setError("Selectionnez un employe.");
      return;
    }

    if (!note.trim()) {
      setError("Une note est obligatoire pour un punch direction.");
      return;
    }

    setActiveActionKey("manual-punch");
    setMessage("");
    setError("");

    try {
      const payload = await withToken(async (token) => {
        const response = await fetch("/api/direction/horodateur/punch", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employeeId,
            eventType: selectedEventType,
            note: note.trim(),
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ?? "Impossible d enregistrer l action direction."
          );
        }

        return result as DirectionMutationPayload & {
          exception?: { id: string } | null;
        };
      });

      patchBoardRow(employeeId, payload);

      if (payload.exception) {
        const selectedRow =
          board.find((row) => row.employeeId === employeeId || row.employee_id === employeeId) ?? null;

        setExceptions((current) => [
          {
            id: payload.exception?.id ?? crypto.randomUUID(),
            employee_id: employeeId,
            exception_type: payload.exception?.exception_type ?? "direction_manual_correction",
            reason_label:
              payload.exception?.reason_label ?? "Correction direction en attente",
            details: payload.exception?.details ?? note.trim(),
            impact_minutes: payload.exception?.impact_minutes ?? 0,
            status: payload.exception?.status ?? "en_attente",
            employee: selectedRow
              ? {
                  employeeId: selectedRow.employeeId,
                  fullName: selectedRow.fullName,
                  email: selectedRow.email,
                }
              : null,
                event: payload.event
                  ? {
                      event_type: payload.event.event_type,
                      occurredAt: resolveOccurredAt(payload.event),
                      occurred_at: resolveOccurredAt(payload.event),
                      event_time: resolveOccurredAt(payload.event),
                    }
                  : null,
          },
          ...current,
        ]);
        setMessage(
          "Action enregistrée. Les heures seront prises en compte après traitement de l’exception."
        );
      } else {
        setMessage("Action enregistrée. Les heures ont été recalculées.");
      }

      setNote("");
      await loadData("refresh", { preserveMessage: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Erreur de pointage."
      );
    } finally {
      setActiveActionKey(null);
    }
  }

  function openRetroCorrectionModal(initial?: {
    employeeId?: string;
    workDate?: string;
    eventType?: StaffRetroForgottenEventType;
    time?: string;
  }) {
    setRetroError(null);
    setRetroEmployeeId(initial?.employeeId ?? "");
    setRetroWorkDate(
      initial?.workDate ?? liveTodayWorkDate ?? getLocalWorkDate(new Date().toISOString())
    );
    setRetroEventType(initial?.eventType ?? "punch_in");
    setRetroTime(initial?.time ?? "");
    setRetroReason("");
    setRetroModalOpen(true);
  }

  function openLiveRowRetroCorrection(row: LiveRow) {
    openRetroCorrectionModal({
      employeeId: String(row.employeeId),
      workDate: liveTodayWorkDate ?? getLocalWorkDate(new Date().toISOString()),
    });
  }

  function focusManualPunchForRow(row: LiveRow) {
    setSelectedEmployeeId(String(row.employeeId));
    setLiveDetailEmployeeId(null);
    window.requestAnimationFrame(() => {
      punchManualSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function focusLiveRowDetail(row: LiveRow) {
    setLiveDetailEmployeeId(row.employeeId);
    setHighlightedExceptionEmployeeId(null);
  }

  function focusEmployeeExceptions(row: LiveRow) {
    const employeeId = row.employeeId || row.employee_id || 0;
    const rowExceptionCount = countRowExceptions(row, exceptions);

    if (!employeeId || rowExceptionCount <= 0) {
      return;
    }

    setHighlightedExceptionEmployeeId(employeeId);
    setLiveDetailEmployeeId(null);
    window.requestAnimationFrame(() => {
      exceptionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const target = document.querySelector(
        `[data-horodateur-exception-employee="${employeeId}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function focusEmployeeOnLiveBoard(employeeId: number) {
    if (!employeeId) return;
    setHighlightedExceptionEmployeeId(null);
    setLiveDetailEmployeeId(employeeId);
    window.requestAnimationFrame(() => {
      const target = document.querySelector(
        `[data-horodateur-live-employee="${employeeId}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function handleRetroCorrectionSubmit() {
    setRetroSaving(true);
    setRetroError(null);
    setMessage("");
    setError("");

    try {
      await withToken(async (token) => {
        const response = await fetch("/api/direction/horodateur/retro-correction", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employeeId: Number(retroEmployeeId),
            date: retroWorkDate,
            eventType: retroEventType,
            time: retroTime,
            reason: retroReason,
          }),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "Impossible d envoyer la demande de correction."
          );
        }
      });

      setRetroModalOpen(false);
      setRetroReason("");
      setRetroTime("");
      setMessage(
        "Demande de correction envoyée. En attente d approbation admin avant comptabilisation."
      );
      await loadData("refresh", { preserveMessage: true });
    } catch (submitError) {
      setRetroError(
        submitError instanceof Error
          ? submitError.message
          : "Erreur lors de l envoi de la demande."
      );
    } finally {
      setRetroSaving(false);
    }
  }

  async function handleApprove(exceptionId: string) {
    setActiveActionKey(`approve:${exceptionId}`);
    setMessage("");
    setError("");
    setRefusingExceptionId(null);

    const selectedException = exceptions.find((item) => item.id === exceptionId) ?? null;
    const baseOccurredAt = selectedException?.event
      ? resolveOccurredAt(selectedException.event)
      : null;
    const correction = timeCorrectionById[exceptionId] ?? { main: "", related: "" };
    const correctedOccurredAt = toIsoWithOptionalTime(baseOccurredAt, correction.main);
    if (correction.main.trim() && !correctedOccurredAt) {
      setError("Format heure invalide (attendu HH:MM) ou horodatage source manquant.");
      setActiveActionKey(null);
      return;
    }

    const correctedRelatedOccurredAt = toIsoWithOptionalTime(
      baseOccurredAt,
      correction.related
    );
    if (correction.related.trim() && !correctedRelatedOccurredAt) {
      setError("Format heure liée invalide (attendu HH:MM).");
      setActiveActionKey(null);
      return;
    }

    try {
      const payload = await withToken(async (token) => {
        const response = await fetch(
          `/api/direction/horodateur/exceptions/${exceptionId}/approve`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              correctedOccurredAt,
              correctedRelatedOccurredAt,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ?? "Impossible d approuver cette exception."
          );
        }

        return result as DirectionMutationPayload & {
          exception: { employee_id: number };
        };
      });

      patchBoardRow(payload.exception.employee_id, payload);
      setExceptions((current) => current.filter((item) => item.id !== exceptionId));
      setTimeCorrectionById((current) => {
        const next = { ...current };
        delete next[exceptionId];
        return next;
      });
      setMessage("Exception approuvee.");
      await loadData("refresh", { preserveMessage: true });
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Erreur d approbation."
      );
    } finally {
      setActiveActionKey(null);
    }
  }

  function handleStartRefuse(exceptionId: string) {
    setRefusingExceptionId(exceptionId);
    setMessage("");
    setError("");
  }

  function handleCancelRefuse() {
    setRefusingExceptionId(null);
    setError("");
  }

  async function handleConfirmRefuse(exceptionId: string) {
    const reviewNote = (refuseNoteById[exceptionId] ?? "").trim();

    if (!reviewNote) {
      setError("Une note est obligatoire pour refuser.");
      return;
    }

    setActiveActionKey(`refuse:${exceptionId}`);
    setMessage("");
    setError("");

    try {
      const payload = await withToken(async (token) => {
        const response = await fetch(
          `/api/direction/horodateur/exceptions/${exceptionId}/refuse`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reviewNote: reviewNote.trim() }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Impossible de refuser cette exception.");
        }

        return result as DirectionMutationPayload & {
          exception: { employee_id: number };
        };
      });

      patchBoardRow(payload.exception.employee_id, payload);
      setExceptions((current) => current.filter((item) => item.id !== exceptionId));
      setRefusingExceptionId(null);
      setRefuseNoteById((current) => {
        const next = { ...current };
        delete next[exceptionId];
        return next;
      });
      setMessage("Exception refusee.");
      await loadData("refresh", { preserveMessage: true });
    } catch (refuseError) {
      setError(
        refuseError instanceof Error ? refuseError.message : "Erreur de refus."
      );
    } finally {
      setActiveActionKey(null);
    }
  }

  if (accessLoading || loading) {
    return (
      <HorodateurDirectionPageShell
        active="live"
        subtitle="Supervision live des présences et des exceptions."
      >
        <SectionCard title="Chargement" subtitle="Préparation de la supervision." />
      </HorodateurDirectionPageShell>
    );
  }

  if (!canUseTerrain) {
    return (
      <HorodateurDirectionPageShell
        active="live"
        subtitle="Supervision live des présences et des exceptions."
      >
        <SectionCard title="Accès" subtitle="Permission terrain requise." />
      </HorodateurDirectionPageShell>
    );
  }

  const headerActions = (
    <div
      style={{
        display: "flex",
        gap: "var(--ui-space-3)",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <Link
        href="/direction/horodateur/qr-zones"
        className="tagora-dark-outline-action"
        style={{ textDecoration: "none" }}
      >
        Zones punch QR
      </Link>
      <SecondaryButton
        onClick={() => void loadData("refresh")}
        disabled={refreshing || isBusy}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <RefreshCw size={16} />
          {refreshing ? "Actualisation..." : "Actualiser"}
        </span>
      </SecondaryButton>
    </div>
  );

  return (
    <HorodateurDirectionPageShell
      active="live"
      subtitle="Supervision live, corrections rétroactives et validation des exceptions."
      actions={headerActions}
    >

        {error ? (
          <AppCard
            tone="muted"
            style={{
              borderColor: "rgba(220, 38, 38, 0.18)",
              background: "rgba(254, 242, 242, 0.8)",
            }}
          >
            <p style={{ margin: 0, color: "#991b1b", fontWeight: 600 }}>{error}</p>
          </AppCard>
        ) : null}

        {message ? (
          <AppCard
            tone="muted"
            style={{
              borderColor: "rgba(5, 150, 105, 0.18)",
              background: "rgba(236, 253, 245, 0.92)",
            }}
          >
            <p style={{ margin: 0, color: "#065f46", fontWeight: 600 }}>{message}</p>
          </AppCard>
        ) : null}

        <HorodateurDirectionPrimaryActions
          onRetroCorrection={() => openRetroCorrectionModal()}
          retroDisabled={isBusy}
          current="live"
        />

        <div ref={punchManualSectionRef} id="horodateur-punch-manuel-section">
        <SectionCard
          title="Punch manuel avancé"
          subtitle="Punch manuel tracé — intervention direction avec note obligatoire."
          actions={
            <TagoraIconBadge tone="blue" size="lg">
              <PenLine size={24} strokeWidth={2.1} />
            </TagoraIconBadge>
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1.2fr) minmax(180px, 0.9fr) auto",
              gap: "var(--ui-space-3)",
              alignItems: "end",
            }}
          >
            <label className="ui-stack-xs">
              <span className="ui-eyebrow">Employe</span>
              <select
                className="tagora-input"
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
              >
                <option value="">Selectionner</option>
                {board.map((row) => (
                  <option key={row.employeeId} value={row.employeeId}>
                    {row.fullName || row.email || `#${row.employeeId}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="ui-stack-xs">
              <span className="ui-eyebrow">Action</span>
              <select
                className="tagora-input"
                value={selectedEventType}
                onChange={(event) =>
                  setSelectedEventType(
                    event.target.value as (typeof DIRECTION_EVENT_TYPES)[number]
                  )
                }
              >
                {DIRECTION_EVENT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <PrimaryButton
              onClick={() => void handleManualPunch()}
              disabled={isBusy || !hasEmployees}
              style={{ whiteSpace: "nowrap" }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} />
                {activeActionKey === "manual-punch"
                  ? "Enregistrement..."
                  : "Enregistrer le punch"}
              </span>
            </PrimaryButton>
          </div>

          <label className="ui-stack-xs" style={{ marginTop: "var(--ui-space-3)" }}>
            <span className="ui-eyebrow">Note obligatoire</span>
            <textarea
              className="tagora-textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Expliquez la correction ou l intervention direction"
              style={{ minHeight: 90 }}
            />
          </label>
        </SectionCard>
        </div>

        <details className="horodateur-direction-secondary-panel">
          <summary>Statistiques détaillées</summary>
          <div className="horodateur-direction-secondary-panel-body ui-stack-md">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 1.4fr) repeat(3, minmax(180px, 0.8fr))",
            gap: "var(--ui-space-4)",
            alignItems: "stretch",
          }}
        >
          <AppCard
            className="ui-stack-sm"
            style={{
              border: "1px solid rgba(15, 41, 72, 0.08)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.98) 100%)",
            }}
          >
            <span className="ui-eyebrow">Progression globale equipe</span>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "baseline",
              }}
            >
              <strong style={{ fontSize: 28 }}>
                {clampPercentage(globalMetrics.teamProgressPercent)}%
              </strong>
              <span className="ui-text-muted">
                {formatMinutes(globalMetrics.totalWeekWorkedMinutes)} /{" "}
                {formatMinutes(globalMetrics.totalWeekTargetMinutes)}
              </span>
            </div>
            <div
              style={{
                height: 12,
                borderRadius: 999,
                background: "rgba(15, 41, 72, 0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${clampPercentage(globalMetrics.teamProgressPercent)}%`,
                  height: "100%",
                  background:
                    globalMetrics.teamProgressPercent > 100 ? "#dc2626" : "#0f2948",
                  borderRadius: 999,
                }}
              />
            </div>
          </AppCard>

          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">% employes en quart</span>
            <strong style={{ fontSize: 28 }}>{globalMetrics.inShiftPercent}%</strong>
            <span className="ui-text-muted">
              {globalMetrics.employeesInShift} / {board.length || 0} en quart
            </span>
          </AppCard>

          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">Heures totales du jour</span>
            <strong style={{ fontSize: 28 }}>{formatMinutes(globalMetrics.totalTodayMinutes)}</strong>
            <span className="ui-text-muted">Temps payable cumule</span>
          </AppCard>

          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">Exceptions en attente</span>
            <strong style={{ fontSize: 28 }}>{counts.pending}</strong>
            <span className="ui-text-muted">Actions direction requises</span>
          </AppCard>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "var(--ui-space-4)",
          }}
        >
          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">Employes suivis</span>
            <strong style={{ fontSize: 28 }}>{counts.employees}</strong>
            <span className="ui-text-muted">Supervision active</span>
          </AppCard>
          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">En quart</span>
            <strong style={{ fontSize: 28 }}>{counts.active}</strong>
            <span className="ui-text-muted">Punch principal actif</span>
          </AppCard>
          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">Pause / diner</span>
            <strong style={{ fontSize: 28 }}>{counts.paused}</strong>
            <span className="ui-text-muted">Etat temporaire</span>
          </AppCard>
          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">Exceptions</span>
            <strong style={{ fontSize: 28 }}>{counts.pending}</strong>
            <span className="ui-text-muted">En attente d approbation</span>
          </AppCard>
        </div>
          </div>
        </details>

        <div ref={exceptionsSectionRef} id="horodateur-exceptions-section">
        <SectionCard
          title="Exceptions à approuver"
          subtitle="Décisions horodateur — cas métier, employé et action attendue en un coup d'œil."
          actions={
            <TagoraIconBadge tone="blue" size="lg">
              <ShieldCheck size={24} strokeWidth={2.1} />
            </TagoraIconBadge>
          }
        >
          {hasExceptions ? (
            <div className="horo-pending-grid">
              {exceptions.map((item) => {
                const display = resolveHorodateurPendingExceptionDisplay(item);
                if (!display) return null;

                const isRefusing = refusingExceptionId === item.id;
                const correction = timeCorrectionById[item.id] ?? { main: "", related: "" };
                const isStaffRetro = isStaffRetroCorrectionException(item);
                const isAutoMissingPriority =
                  item.reason_label === MISSING_EXPECTED_PUNCH_PRIORITY_REASON_LABEL;
                const canReviewException = !isStaffRetro || isAdmin;
                const isHighlighted =
                  highlightedExceptionEmployeeId !== null &&
                  item.employee_id === highlightedExceptionEmployeeId;

                return (
                  <HorodateurPendingExceptionCard
                    key={item.id}
                    item={item}
                    display={display}
                    isHighlighted={isHighlighted}
                    isPriority={isAutoMissingPriority}
                    isBusy={isBusy}
                    activeActionKey={activeActionKey}
                    isRefusing={isRefusing}
                    canReviewException={canReviewException}
                    refuseNote={refuseNoteById[item.id] ?? ""}
                    correction={correction}
                    formatDateTime={formatDateTime}
                    formatMinutes={formatMinutes}
                    onApprove={() => void handleApprove(item.id)}
                    onStartRefuse={() => handleStartRefuse(item.id)}
                    onConfirmRefuse={() => void handleConfirmRefuse(item.id)}
                    onCancelRefuse={handleCancelRefuse}
                    onRefuseNoteChange={(value) =>
                      setRefuseNoteById((current) => ({
                        ...current,
                        [item.id]: value,
                      }))
                    }
                    onCorrectionChange={(value) =>
                      setTimeCorrectionById((current) => ({
                        ...current,
                        [item.id]: value,
                      }))
                    }
                    onFocusEmployee={focusEmployeeOnLiveBoard}
                  />
                );
              })}
            </div>
          ) : (
            <AppCard tone="muted" className="ui-stack-sm">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <AlertTriangle size={18} color="#64748b" />
                <p className="ui-text-muted" style={{ margin: 0 }}>
                  Aucune exception en attente.
                </p>
              </div>
            </AppCard>
          )}
        </SectionCard>
        </div>

        <SectionCard
          className="horodateur-live-section"
          title="Tableau live"
          subtitle={
            liveTodayWorkDate
              ? `Supervision du jour (Toronto) · ${liveTodayWorkDate}`
              : "Etat courant et progression."
          }
        >
          <div className="horodateur-direction-filter-chips horodateur-live-filter-chips">
            {[
              ["tous", `Tous (${board.length})`],
              ["en_quart", `En quart (${board.filter((row) => getRowState(row) === "en_quart").length})`],
              ["en_attente", `En attente (${board.filter((row) => row.todayShift?.status === "en_attente").length})`],
              ["exceptions", `Exceptions (${board.filter((row) => row.hasOpenException || (row.activeExceptionCount ?? 0) > 0).length})`],
            ].map(([value, label]) => {
              const active = liveFilter === value;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLiveFilter(value as LiveFilter)}
                  className={`horodateur-direction-filter-chip${
                    active ? " horodateur-direction-filter-chip--active" : ""
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {hasEmployees ? (
            <div className="horodateur-live-board">
              <div className="horodateur-live-board-head" aria-hidden="true">
                <span>Employé</span>
                <span>État</span>
                <span>Quart du jour</span>
                <span>Progression</span>
                <span>Actions</span>
              </div>

              <div className="horodateur-live-board-body">
                {filteredBoard.map((row) => {
                  const rowExceptionCount = countRowExceptions(row, exceptions);
                  const needsAttention = liveRowNeedsAttention(row);
                  const employeeLabel =
                    row.fullName || row.email || row.phone || `#${row.employeeId}`;
                  const isDetailOpen = liveDetailEmployeeId === row.employeeId;
                  const shiftHints = collectLiveShiftHints(row);
                  const ratio =
                    row.weekTargetMinutes > 0
                      ? row.weekWorkedMinutes / row.weekTargetMinutes
                      : 0;
                  const progressTone = getProgressTone({
                    ratio,
                    hasOpenException: row.hasOpenException,
                    anomaliesCount: row.todayShift?.anomalies_count ?? 0,
                  });
                  const progressPercent = clampPercentage(Math.round(ratio * 100));

                  return (
                    <article
                      key={row.employeeId}
                      data-horodateur-live-employee={row.employeeId}
                      className={`horodateur-live-board-row${
                        needsAttention ? " horodateur-live-board-row--attention" : ""
                      }${isDetailOpen ? " horodateur-live-board-row--focused" : ""}`}
                    >
                      <div className="horodateur-live-board-cell" data-label="Employé">
                        <div className="horodateur-live-employee">
                          <strong className="horodateur-live-employee-name">
                            {row.fullName || row.email || row.phone || `#${row.employeeId}`}
                          </strong>
                          <span className="horodateur-live-meta">
                            {row.email || row.phone || "—"}
                          </span>
                          <span className="horodateur-live-company-tag">
                            {getCompanyLabel(row.primaryCompany)}
                          </span>
                        </div>
                      </div>

                      <div className="horodateur-live-board-cell" data-label="État">
                        <div className="horodateur-live-state">
                          <StatusBadge
                            label={getStateLabel(getRowState(row))}
                            tone={getStateTone(getRowState(row))}
                          />
                          <span className="horodateur-live-meta">
                            {formatShortDateTime(row.lastEventAt)} ·{" "}
                            {row.currentEventType ?? row.lastEventType ?? "—"}
                          </span>
                        </div>
                      </div>

                      <div className="horodateur-live-board-cell" data-label="Quart du jour">
                        <div className="horodateur-live-shift">
                          <strong className="horodateur-live-shift-time">
                            {formatMinutes(resolveDisplayedPayableMinutes(row))}
                          </strong>
                          {row.todayTimeDisplay?.hasOpenShiftAccrual ? (
                            <span className="horodateur-live-meta">
                              En cours · officiel{" "}
                              {formatMinutes(row.todayTimeDisplay.officialPayableMinutes)}
                            </span>
                          ) : null}
                          <span className="horodateur-live-meta">
                            Début {formatShortDateTime(row.startedAt ?? row.todayShift?.shift_start_at ?? null)}
                          </span>
                          {shiftHints.length > 0 ? (
                            <ul className="horodateur-live-hints">
                              {shiftHints.map((hint) => (
                                <li key={hint}>{hint}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>

                      <div className="horodateur-live-board-cell" data-label="Progression">
                        <div className="horodateur-live-progress">
                          <div className="horodateur-live-progress-top">
                            <strong style={{ color: progressTone.text }}>{progressPercent}%</strong>
                            <span className="horodateur-live-meta">
                              {formatMinutes(row.weekWorkedMinutes)} /{" "}
                              {formatMinutes(row.weekTargetMinutes)}
                            </span>
                          </div>
                          <div
                            className="horodateur-live-progress-track"
                            style={{ background: progressTone.track }}
                          >
                            <div
                              className="horodateur-live-progress-bar"
                              style={{
                                width: `${progressPercent}%`,
                                background: progressTone.bar,
                              }}
                            />
                          </div>
                          <span className="horodateur-live-meta">
                            Restant {formatMinutes(row.weekRemainingMinutes)}
                            {row.projectedOverflowMinutes > 0
                              ? ` · Prévu +${formatMinutes(row.projectedOverflowMinutes)}`
                              : ""}
                          </span>
                        </div>
                      </div>

                      <div className="horodateur-live-board-cell horodateur-live-board-cell--actions" data-label="Actions">
                        <HorodateurLiveRowActions
                          employeeLabel={employeeLabel}
                          exceptionCount={rowExceptionCount}
                          needsAttention={needsAttention}
                          phoneHref={resolveEmployeePhoneHref(row)}
                          disabled={isBusy}
                          onCorrect={() => openLiveRowRetroCorrection(row)}
                          onManualPunch={() => focusManualPunchForRow(row)}
                          onDetail={() => focusLiveRowDetail(row)}
                          onExceptions={() => focusEmployeeExceptions(row)}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {hasEmployees && liveDetailEmployeeId ? (() => {
            const detailRow = board.find((row) => row.employeeId === liveDetailEmployeeId);
            if (!detailRow) {
              return null;
            }

            const detailExceptionCount = countRowExceptions(detailRow, exceptions);
            const detailRatio =
              detailRow.weekTargetMinutes > 0
                ? detailRow.weekWorkedMinutes / detailRow.weekTargetMinutes
                : 0;
            const detailProgressTone = getProgressTone({
              ratio: detailRatio,
              hasOpenException: detailRow.hasOpenException,
              anomaliesCount: detailRow.todayShift?.anomalies_count ?? 0,
            });

            return (
              <AppCard className="horodateur-live-detail-panel ui-stack-sm">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div className="ui-stack-xs">
                    <span className="ui-eyebrow">Détail employé</span>
                    <strong style={{ fontSize: 18 }}>
                      {detailRow.fullName || detailRow.email || `#${detailRow.employeeId}`}
                    </strong>
                    <span className="ui-text-muted">
                      {getCompanyLabel(detailRow.primaryCompany)} ·{" "}
                      {detailRow.email || detailRow.phone || "—"}
                    </span>
                  </div>
                  <SecondaryButton onClick={() => setLiveDetailEmployeeId(null)}>
                    Fermer
                  </SecondaryButton>
                </div>

                <ul className="horodateur-direction-detail-list">
                  <li className="horodateur-direction-detail-list-item">
                    <strong>État</strong> — {getStateLabel(getRowState(detailRow))}
                  </li>
                  <li className="horodateur-direction-detail-list-item">
                    <strong>Début</strong> —{" "}
                    {formatDateTime(detailRow.startedAt ?? detailRow.todayShift?.shift_start_at ?? null)}
                  </li>
                  <li className="horodateur-direction-detail-list-item">
                    <strong>Dernier événement</strong> — {formatDateTime(detailRow.lastEventAt)} ·{" "}
                    {detailRow.currentEventType ?? detailRow.lastEventType ?? "—"}
                  </li>
                  <li className="horodateur-direction-detail-list-item">
                    <strong>Quart du jour</strong> — {formatMinutes(resolveDisplayedPayableMinutes(detailRow))}
                    {detailRow.todayShift?.status ? ` · ${detailRow.todayShift.status}` : ""}
                  </li>
                  <li
                    className={`horodateur-direction-detail-list-item${
                      detailProgressTone.text === "#991b1b"
                        ? " horodateur-direction-detail-list-item--warning"
                        : ""
                    }`}
                  >
                    <strong>Progression semaine</strong> —{" "}
                    {clampPercentage(Math.round(detailRatio * 100))}% ·{" "}
                    {formatMinutes(detailRow.weekWorkedMinutes)} /{" "}
                    {formatMinutes(detailRow.weekTargetMinutes)}
                  </li>
                  <li
                    className={`horodateur-direction-detail-list-item${
                      detailExceptionCount > 0 ? " horodateur-direction-detail-list-item--warning" : ""
                    }`}
                  >
                    <strong>Exceptions</strong> —{" "}
                    {detailExceptionCount > 0
                      ? `${detailExceptionCount} en attente`
                      : "Aucune"}
                  </li>
                </ul>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <SecondaryButton
                    disabled={isBusy}
                    onClick={() => openLiveRowRetroCorrection(detailRow)}
                  >
                    Corriger un oubli
                  </SecondaryButton>
                  <SecondaryButton
                    disabled={isBusy}
                    onClick={() => focusManualPunchForRow(detailRow)}
                  >
                    Punch manuel
                  </SecondaryButton>
                  {detailExceptionCount > 0 ? (
                    <SecondaryButton
                      disabled={isBusy}
                      onClick={() => focusEmployeeExceptions(detailRow)}
                    >
                      Voir exceptions
                    </SecondaryButton>
                  ) : null}
                </div>
              </AppCard>
            );
          })() : null}

          {!hasEmployees ? (
            <AppCard tone="muted" className="ui-stack-sm">
              <p className="ui-text-muted" style={{ margin: 0 }}>
                Aucun employe actif a afficher pour le moment.
              </p>
            </AppCard>
          ) : null}
        </SectionCard>

        <details className="horodateur-direction-secondary-panel">
          <summary>Configuration des alertes</summary>
          <div className="horodateur-direction-secondary-panel-body">
            <HorodateurDirectionAlertConfigPanel
              config={config}
              onConfigChange={setConfig}
              onSave={() => void handleSaveConfig()}
              saving={activeActionKey === "save-config"}
              disabled={isBusy}
              invalidEmails={invalidEmails}
              isValidEmail={isValidEmail}
              onUpdateEmailRow={updateEmailRow}
              onUpdatePhoneRow={updatePhoneRow}
              normalizePhoneNumber={normalizePhoneNumber}
            />
          </div>
        </details>

        <HorodateurRetroCorrectionModal
          open={retroModalOpen}
          saving={retroSaving}
          submitError={retroError}
          employees={retroEmployeeOptions}
          employeeId={retroEmployeeId}
          workDate={retroWorkDate}
          eventType={retroEventType}
          time={retroTime}
          reason={retroReason}
          onClose={() => {
            if (!retroSaving) {
              setRetroModalOpen(false);
              setRetroError(null);
            }
          }}
          onEmployeeIdChange={setRetroEmployeeId}
          onWorkDateChange={setRetroWorkDate}
          onEventTypeChange={setRetroEventType}
          onTimeChange={setRetroTime}
          onReasonChange={setRetroReason}
          onSubmit={() => void handleRetroCorrectionSubmit()}
        />
    </HorodateurDirectionPageShell>
  );
}

