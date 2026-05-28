"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import { normalizePhoneNumber } from "@/app/lib/timeclock-api.client";
import PastShiftDirectionModal from "@/app/components/horodateur/PastShiftDirectionModal";

function defaultTorontoWorkDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

function getExceptionTone(count: number) {
  if (count > 0) {
    return "warning" as const;
  }

  return "success" as const;
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

function truncateEmployeeNote(value: string | null | undefined, maxLen = 160) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "Aucune note fournie.";
  }
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function exceptionSummaryRow(label: string, value: string) {
  return (
    <div
      key={label}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(88px, 120px) 1fr",
        gap: 8,
        fontSize: 14,
        lineHeight: 1.45,
      }}
    >
      <span style={{ fontWeight: 600, color: "#475569" }}>{label}</span>
      <span style={{ color: "#0f172a" }}>{value}</span>
    </div>
  );
}

function getRowState(row: LiveRow) {
  return row.currentState || row.status || "hors_quart";
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
  const { loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseTerrain = hasPermission("terrain");

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
  const [pastShiftModalOpen, setPastShiftModalOpen] = useState(false);
  const [pastShiftEmployeeId, setPastShiftEmployeeId] = useState("");
  const [pastShiftWorkDate, setPastShiftWorkDate] = useState(defaultTorontoWorkDate);
  const [pastShiftStartTime, setPastShiftStartTime] = useState("08:00");
  const [pastShiftEndTime, setPastShiftEndTime] = useState("16:00");
  const [pastShiftBreakMinutes, setPastShiftBreakMinutes] = useState("0");
  const [pastShiftNote, setPastShiftNote] = useState("");
  const [pastShiftError, setPastShiftError] = useState("");
  const [liveFilter, setLiveFilter] = useState<LiveFilter>("tous");
  const [refusingExceptionId, setRefusingExceptionId] = useState<string | null>(null);
  const [refuseNoteById, setRefuseNoteById] = useState<Record<string, string>>({});
  const [timeCorrectionById, setTimeCorrectionById] = useState<
    Record<string, { main: string; related: string }>
  >({});
  /** Date `work_date` utilisée pour la colonne « Quart du jour » (alignée sur l’API live, Toronto). */
  const [liveTodayWorkDate, setLiveTodayWorkDate] = useState<string | null>(null);
  const [config, setConfig] = useState<AlertConfig>({
    email_enabled: false,
    sms_enabled: false,
    reminder_delay_minutes: 60,
    direction_emails: [],
    direction_sms_numbers: [],
  });

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
      (sum, row) => sum + Math.max(0, row.todayShift?.payable_minutes ?? 0),
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

  const pastShiftEmployees = useMemo(
    () =>
      board.map((row) => ({
        id: row.employeeId,
        label: row.fullName || row.email || `#${row.employeeId}`,
      })),
    [board]
  );

  async function handlePastShiftSubmit() {
    const employeeId = Number(pastShiftEmployeeId);
    if (!Number.isFinite(employeeId)) {
      setPastShiftError("Sélectionnez un employé.");
      return;
    }
    if (!pastShiftWorkDate.trim()) {
      setPastShiftError("La date de travail est obligatoire.");
      return;
    }
    if (!pastShiftStartTime.trim() || !pastShiftEndTime.trim()) {
      setPastShiftError("Les heures de début et de fin sont obligatoires.");
      return;
    }
    if (!pastShiftNote.trim()) {
      setPastShiftError("Un commentaire est obligatoire.");
      return;
    }

    setActiveActionKey("past-shift");
    setPastShiftError("");
    setMessage("");
    setError("");

    try {
      await withToken(async (token) => {
        const response = await fetch("/api/direction/horodateur/past-shift", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employeeId,
            date: pastShiftWorkDate,
            startTime: pastShiftStartTime,
            endTime: pastShiftEndTime,
            breakMinutes: Number(pastShiftBreakMinutes),
            note: pastShiftNote.trim(),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "Impossible d enregistrer les heures passées."
          );
        }
        return result;
      });

      setPastShiftModalOpen(false);
      setPastShiftNote("");
      setMessage(
        "Heures passées enregistrées. Le quart a été recalculé pour la date sélectionnée."
      );
      await loadData("refresh", { preserveMessage: true });
    } catch (submitError) {
      setPastShiftError(
        submitError instanceof Error
          ? submitError.message
          : "Erreur lors de l enregistrement des heures passées."
      );
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
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader
            title="Horodateur direction"
            subtitle=""
            showNavigation={false}
          />
          <SectionCard title="Chargement" subtitle="Preparation de la supervision." />
        </div>
      </main>
    );
  }

  if (!canUseTerrain) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader
            title="Horodateur direction"
            subtitle=""
            showNavigation={false}
          />
          <SectionCard title="Acces" subtitle="Permission terrain requise." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Horodateur direction"
          subtitle=""
          showNavigation={false}
          actions={
            <div
              style={{
                display: "flex",
                gap: "var(--ui-space-3)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <Link
                href="/direction/horodateur/registre"
                className="tagora-dark-outline-action"
                style={{ textDecoration: "none" }}
              >
                Registre des heures
              </Link>
              <Link
                href="/direction/horodateur/qr-zones"
                className="tagora-dark-outline-action"
                style={{ textDecoration: "none" }}
              >
                Zones punch QR
              </Link>
              <Link
                href="/direction/dashboard"
                className="tagora-dark-action"
                style={{ textDecoration: "none" }}
              >
                Tableau de bord direction
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
          }
        />

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

        <SectionCard title="Exceptions a approuver" subtitle="Validation rapide.">
          {hasExceptions ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: "var(--ui-space-3)",
              }}
            >
              {exceptions.map((item) => {
                const occurredAt = item.event ? resolveOccurredAt(item.event) : null;
                const employeeName =
                  item.employee?.fullName || item.employee?.email || item.id;
                const isRefusing = refusingExceptionId === item.id;
                const correction = timeCorrectionById[item.id] ?? { main: "", related: "" };

                return (
                <AppCard
                  key={item.id}
                  className="ui-stack-sm"
                  style={{
                    border: "1px solid rgba(245, 158, 11, 0.32)",
                    background:
                      "linear-gradient(180deg, rgba(255,251,235,0.98) 0%, rgba(255,255,255,0.98) 100%)",
                    boxShadow: "0 14px 28px rgba(120, 53, 15, 0.08)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 17,
                        fontWeight: 800,
                        color: "#92400e",
                        lineHeight: 1.35,
                      }}
                    >
                      Exception horodateur à traiter
                    </h3>
                    <StatusBadge label="En attente" tone="warning" />
                  </div>

                  <div className="ui-stack-xs" style={{ gap: 10 }}>
                    {exceptionSummaryRow("Employé", employeeName)}
                    {exceptionSummaryRow("Type", item.reason_label || item.exception_type)}
                    {exceptionSummaryRow(
                      "Heure",
                      occurredAt ? formatDateTime(occurredAt) : "—"
                    )}
                    {exceptionSummaryRow(
                      "Note employé",
                      truncateEmployeeNote(item.details)
                    )}
                  </div>

                  {!isRefusing ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--ui-space-2)",
                      }}
                    >
                      <PrimaryButton
                        onClick={() => void handleApprove(item.id)}
                        disabled={isBusy}
                        style={{
                          width: "100%",
                          minHeight: 52,
                          fontSize: 16,
                          fontWeight: 700,
                          justifyContent: "center",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <ShieldCheck size={18} />
                          {activeActionKey === `approve:${item.id}`
                            ? "Approbation..."
                            : "Approuver"}
                        </span>
                      </PrimaryButton>
                      <SecondaryButton
                        onClick={() => handleStartRefuse(item.id)}
                        disabled={isBusy}
                        style={{
                          width: "100%",
                          minHeight: 52,
                          fontSize: 16,
                          fontWeight: 600,
                          justifyContent: "center",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <TimerReset size={18} />
                          Refuser
                        </span>
                      </SecondaryButton>
                    </div>
                  ) : (
                    <div className="ui-stack-sm">
                      <label className="ui-stack-xs" style={{ width: "100%" }}>
                        <span className="ui-eyebrow">Raison du refus (obligatoire)</span>
                        <textarea
                          className="tagora-textarea"
                          value={refuseNoteById[item.id] ?? ""}
                          onChange={(event) =>
                            setRefuseNoteById((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Expliquez brièvement le motif du refus..."
                          rows={4}
                          disabled={isBusy}
                          style={{ width: "100%" }}
                        />
                      </label>
                      <PrimaryButton
                        onClick={() => void handleConfirmRefuse(item.id)}
                        disabled={isBusy}
                        style={{
                          width: "100%",
                          minHeight: 48,
                          fontWeight: 700,
                          justifyContent: "center",
                          background: "#b91c1c",
                          borderColor: "#b91c1c",
                        }}
                      >
                        {activeActionKey === `refuse:${item.id}`
                          ? "Refus en cours..."
                          : "Confirmer le refus"}
                      </PrimaryButton>
                      <SecondaryButton
                        type="button"
                        onClick={handleCancelRefuse}
                        disabled={isBusy}
                        style={{ width: "100%", minHeight: 44, justifyContent: "center" }}
                      >
                        Annuler
                      </SecondaryButton>
                    </div>
                  )}

                  <details>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontWeight: 600,
                        color: "#0d9488",
                        fontSize: 14,
                      }}
                    >
                      Voir les détails
                    </summary>
                    <div
                      className="ui-stack-sm"
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: "1px solid #e2e8f0",
                      }}
                    >
                      <AppCard tone="default" className="ui-stack-xs">
                        <span className="ui-eyebrow">Type technique</span>
                        <span className="ui-text-muted">{item.exception_type}</span>
                      </AppCard>
                      <AppCard tone="default" className="ui-stack-xs">
                        <span className="ui-eyebrow">Impact</span>
                        <strong>{formatMinutes(item.impact_minutes)}</strong>
                        <span className="ui-text-muted">{item.status}</span>
                      </AppCard>
                      {item.event ? (
                        <AppCard tone="default" className="ui-stack-xs">
                          <span className="ui-eyebrow">Événement lié</span>
                          <span className="ui-text-muted">
                            {item.event.event_type}
                            {occurredAt ? ` — ${formatDateTime(occurredAt)}` : ""}
                          </span>
                        </AppCard>
                      ) : null}
                      <AppCard tone="default" className="ui-stack-xs">
                        <span className="ui-eyebrow">Journal des notifications</span>
                        <span className="ui-text-muted">
                          Email initial:{" "}
                          {formatDateTime(item.direction_email_notified_at ?? null)}
                        </span>
                        <span className="ui-text-muted">
                          SMS initial: {formatDateTime(item.direction_sms_notified_at ?? null)}
                        </span>
                        <span className="ui-text-muted">
                          Rappel email:{" "}
                          {formatDateTime(item.direction_reminder_email_notified_at ?? null)}
                        </span>
                        <span className="ui-text-muted">
                          Rappel SMS:{" "}
                          {formatDateTime(item.direction_reminder_sms_notified_at ?? null)}
                        </span>
                      </AppCard>
                      <AppCard tone="default" className="ui-stack-xs">
                        <span className="ui-eyebrow">Correction d&apos;heure (avancée)</span>
                        <p className="ui-text-muted" style={{ margin: "0 0 8px" }}>
                          Optionnel — laisser vide pour approuver tel quel depuis le bouton
                          Approuver.
                        </p>
                        <label className="ui-stack-xs">
                          <span className="ui-text-muted" style={{ fontSize: 13 }}>
                            Heure corrigée événement principal (HH:MM)
                          </span>
                          <input
                            type="text"
                            className="tagora-input"
                            placeholder="Ex. 08:30"
                            value={correction.main}
                            disabled={isBusy}
                            onChange={(event) =>
                              setTimeCorrectionById((current) => ({
                                ...current,
                                [item.id]: {
                                  main: event.target.value,
                                  related: current[item.id]?.related ?? "",
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="ui-stack-xs">
                          <span className="ui-text-muted" style={{ fontSize: 13 }}>
                            Heure corrigée événement lié (HH:MM)
                          </span>
                          <input
                            type="text"
                            className="tagora-input"
                            placeholder="Optionnel"
                            value={correction.related}
                            disabled={isBusy}
                            onChange={(event) =>
                              setTimeCorrectionById((current) => ({
                                ...current,
                                [item.id]: {
                                  main: current[item.id]?.main ?? "",
                                  related: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </AppCard>
                    </div>
                  </details>

                  {item.employee?.employeeId ? (
                    <Link
                      href={`/direction/ressources/employes/${item.employee.employeeId}`}
                      className="tagora-dark-outline-action"
                      style={{
                        textDecoration: "none",
                        alignSelf: "flex-start",
                        fontSize: 13,
                        padding: "8px 14px",
                      }}
                    >
                      Voir l&apos;employé
                    </Link>
                  ) : null}
                </AppCard>
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

        <SectionCard title="Tableau live" subtitle="Etat courant et progression.">
          <div
            style={{
              display: "flex",
              gap: "var(--ui-space-2)",
              flexWrap: "wrap",
              marginBottom: "var(--ui-space-4)",
            }}
          >
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
                  style={{
                    borderRadius: 999,
                    border: active ? "1px solid #0f2948" : "1px solid rgba(148, 163, 184, 0.28)",
                    background: active ? "#0f2948" : "#ffffff",
                    color: active ? "#ffffff" : "#334155",
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {hasEmployees ? (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  minWidth: 1120,
                }}
              >
                <thead>
                  <tr style={{ background: "rgba(15, 41, 72, 0.04)" }}>
                    <th style={thStyle}>Employe</th>
                    <th style={thStyle}>Compagnie</th>
                    <th style={thStyle}>Etat</th>
                    <th style={thStyle}>Dernier evenement</th>
                    <th style={thStyle}>
                      <div className="ui-stack-xs" style={{ alignItems: "flex-start" }}>
                        <span>Quart du jour</span>
                        {liveTodayWorkDate ? (
                          <span className="ui-text-muted" style={{ fontSize: 11, fontWeight: 500 }}>
                            Jour (Toronto) : {liveTodayWorkDate}
                          </span>
                        ) : null}
                      </div>
                    </th>
                    <th style={thStyle}>Semaine</th>
                    <th style={thStyle}>Projection</th>
                    <th style={thStyle}>Exceptions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBoard.map((row) => {
                    const rowExceptionCount = Math.max(
                      exceptions.filter((item) => item.employee_id === (row.employeeId || row.employee_id || 0)).length,
                      row.activeExceptionCount ?? 0,
                      row.alertFlags?.hasOpenException ? 1 : 0
                    );

                    return (
                      <tr key={row.employeeId}>
                        <td style={tdStyle}>
                          <div className="ui-stack-xs">
                            <strong style={{ fontSize: 14 }}>
                              {row.fullName || row.email || row.phone || `#${row.employeeId}`}
                            </strong>
                            <span className="ui-text-muted">{row.email || row.phone || "-"}</span>
                          </div>
                        </td>
                        <td style={tdStyle}>{getCompanyLabel(row.primaryCompany)}</td>
                        <td style={tdStyle}>
                          <StatusBadge
                            label={getStateLabel(getRowState(row))}
                            tone={getStateTone(getRowState(row))}
                          />
                        </td>
                        <td style={tdStyle}>
                          <div className="ui-stack-xs">
                            <span>{formatDateTime(row.lastEventAt)}</span>
                            <span className="ui-text-muted">
                              {row.currentEventType ?? row.lastEventType ?? "-"}
                            </span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div className="ui-stack-xs">
                            <span>{formatMinutes(row.todayShift?.payable_minutes ?? 0)}</span>
                            <span className="ui-text-muted">
                              Debut: {formatDateTime(row.startedAt ?? row.todayShift?.shift_start_at ?? null)}
                            </span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          {(() => {
                            const ratio =
                              row.weekTargetMinutes > 0
                                ? row.weekWorkedMinutes / row.weekTargetMinutes
                                : 0;
                            const tone = getProgressTone({
                              ratio,
                              hasOpenException: row.hasOpenException,
                              anomaliesCount: row.todayShift?.anomalies_count ?? 0,
                            });
                            const percent = clampPercentage(Math.round(ratio * 100));

                            return (
                              <div className="ui-stack-xs">
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    alignItems: "baseline",
                                  }}
                                >
                                  <strong style={{ color: tone.text }}>{percent}%</strong>
                                  <span className="ui-text-muted">
                                    {formatMinutes(row.weekWorkedMinutes)} /{" "}
                                    {formatMinutes(row.weekTargetMinutes)}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    height: 8,
                                    borderRadius: 999,
                                    background: tone.track,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${percent}%`,
                                      height: "100%",
                                      background: tone.bar,
                                      borderRadius: 999,
                                    }}
                                  />
                                </div>
                                <span className="ui-text-muted">
                                  Restant: {formatMinutes(row.weekRemainingMinutes)}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td style={tdStyle}>
                          <div className="ui-stack-xs">
                            <span>{formatMinutes(row.projectedOverflowMinutes)}</span>
                            <span className="ui-text-muted">
                              Cible: {formatMinutes(row.weekTargetMinutes)}
                            </span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge
                            label={rowExceptionCount ? `${rowExceptionCount} en attente` : "Aucune"}
                            tone={getExceptionTone(rowExceptionCount)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <AppCard tone="muted" className="ui-stack-sm">
              <p className="ui-text-muted" style={{ margin: 0 }}>
                Aucun employe actif a afficher pour le moment.
              </p>
            </AppCard>
          )}
        </SectionCard>

        <SectionCard
          title="Action direction"
          subtitle="Punch manuel trace ou ajout d un quart passé complet."
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: "var(--ui-space-3)",
            }}
          >
            <SecondaryButton
              onClick={() => {
                setPastShiftError("");
                setPastShiftEmployeeId(selectedEmployeeId);
                if (!pastShiftWorkDate) {
                  setPastShiftWorkDate(defaultTorontoWorkDate());
                }
                setPastShiftModalOpen(true);
              }}
              disabled={isBusy || !hasEmployees}
            >
              Ajouter des heures passées
            </SecondaryButton>
          </div>
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

        <SectionCard
          title="Configuration des alertes"
          subtitle="Destinataires et delai du rappel automatique."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "var(--ui-space-4)",
            }}
          >
            <label className="ui-stack-xs">
              <span className="ui-eyebrow">Email active</span>
              <select
                className="tagora-input"
                value={config.email_enabled ? "yes" : "no"}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    email_enabled: event.target.value === "yes",
                  }))
                }
              >
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
            </label>

            <label className="ui-stack-xs">
              <span className="ui-eyebrow">SMS active</span>
              <select
                className="tagora-input"
                value={config.sms_enabled ? "yes" : "no"}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    sms_enabled: event.target.value === "yes",
                  }))
                }
              >
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
            </label>

            <label className="ui-stack-xs">
              <span className="ui-eyebrow">Delai de rappel (minutes)</span>
              <input
                className="tagora-input"
                type="number"
                min={5}
                value={config.reminder_delay_minutes}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    reminder_delay_minutes: Math.max(5, Number(event.target.value) || 5),
                  }))
                }
              />
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "var(--ui-space-5)",
              marginTop: "var(--ui-space-4)",
            }}
          >
            <div className="ui-stack-sm">
              <div className="ui-stack-xs">
                <span className="ui-eyebrow">Courriels direction</span>
                <span className="ui-text-muted">Un destinataire par ligne</span>
              </div>

              {(config.direction_emails.length > 0
                ? config.direction_emails
                : [""]).map((value, index) => {
                const trimmedValue = value.trim();
                const isInvalid = trimmedValue.length > 0 && !isValidEmail(trimmedValue);

                return (
                  <div
                    key={`email-${index}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "var(--ui-space-3)",
                      alignItems: "start",
                    }}
                  >
                    <div className="ui-stack-xs">
                      <input
                        className="tagora-input"
                        type="email"
                        value={value}
                        onChange={(event) => updateEmailRow(index, event.target.value)}
                        onBlur={() =>
                          setConfig((current) => ({
                            ...current,
                            direction_emails: current.direction_emails.map((item, itemIndex) =>
                              itemIndex === index ? item.trim().toLowerCase() : item.trim()
                            ),
                          }))
                        }
                        placeholder="direction@exemple.com"
                        style={
                          isInvalid
                            ? { borderColor: "rgba(220, 38, 38, 0.45)" }
                            : undefined
                        }
                      />
                      {isInvalid ? (
                        <span style={{ color: "#b91c1c", fontSize: 12 }}>
                          Courriel invalide.
                        </span>
                      ) : null}
                    </div>
                    <SecondaryButton
                      onClick={() =>
                        setConfig((current) => ({
                          ...current,
                          direction_emails:
                            current.direction_emails.length > 1
                              ? current.direction_emails.filter((_, itemIndex) => itemIndex !== index)
                              : [""],
                        }))
                      }
                      disabled={isBusy}
                    >
                      Supprimer
                    </SecondaryButton>
                  </div>
                );
              })}

              <div>
                <SecondaryButton
                  onClick={() =>
                    setConfig((current) => ({
                      ...current,
                      direction_emails: [...current.direction_emails, ""],
                    }))
                  }
                  disabled={isBusy}
                >
                  Ajouter un courriel
                </SecondaryButton>
              </div>

              {invalidEmails.length > 0 ? (
                <span style={{ color: "#b91c1c", fontSize: 12 }}>
                  Corrigez les courriels invalides avant la sauvegarde.
                </span>
              ) : null}
            </div>

            <div className="ui-stack-sm">
              <div className="ui-stack-xs">
                <span className="ui-eyebrow">Numeros SMS direction</span>
                <span className="ui-text-muted">Un destinataire par ligne</span>
              </div>

              {(config.direction_sms_numbers.length > 0
                ? config.direction_sms_numbers
                : [""]).map((value, index) => (
                <div
                  key={`sms-${index}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "var(--ui-space-3)",
                    alignItems: "center",
                  }}
                >
                  <input
                    className="tagora-input"
                    type="tel"
                    value={value}
                    onChange={(event) => updatePhoneRow(index, event.target.value)}
                    onBlur={() =>
                      setConfig((current) => ({
                        ...current,
                        direction_sms_numbers: current.direction_sms_numbers.map((item, itemIndex) =>
                          itemIndex === index ? normalizePhoneNumber(item) : item
                        ),
                      }))
                    }
                    placeholder="+15145550123"
                  />
                  <SecondaryButton
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        direction_sms_numbers:
                          current.direction_sms_numbers.length > 1
                            ? current.direction_sms_numbers.filter((_, itemIndex) => itemIndex !== index)
                            : [""],
                      }))
                    }
                    disabled={isBusy}
                  >
                    Supprimer
                  </SecondaryButton>
                </div>
              ))}

              <div>
                <SecondaryButton
                  onClick={() =>
                    setConfig((current) => ({
                      ...current,
                      direction_sms_numbers: [...current.direction_sms_numbers, ""],
                    }))
                  }
                  disabled={isBusy}
                >
                  Ajouter un numero
                </SecondaryButton>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "var(--ui-space-4)" }}>
            <PrimaryButton
              onClick={() => void handleSaveConfig()}
              disabled={isBusy || invalidEmails.length > 0}
            >
              {activeActionKey === "save-config"
                ? "Enregistrement..."
                : "Enregistrer la configuration"}
            </PrimaryButton>
          </div>
        </SectionCard>
      </div>

      <PastShiftDirectionModal
        open={pastShiftModalOpen}
        saving={activeActionKey === "past-shift"}
        submitError={pastShiftError || null}
        employeeId={pastShiftEmployeeId}
        workDate={pastShiftWorkDate}
        startTime={pastShiftStartTime}
        endTime={pastShiftEndTime}
        breakMinutes={pastShiftBreakMinutes}
        note={pastShiftNote}
        employees={pastShiftEmployees}
        onClose={() => {
          if (activeActionKey === "past-shift") {
            return;
          }
          setPastShiftModalOpen(false);
          setPastShiftError("");
        }}
        onEmployeeIdChange={setPastShiftEmployeeId}
        onWorkDateChange={setPastShiftWorkDate}
        onStartTimeChange={setPastShiftStartTime}
        onEndTimeChange={setPastShiftEndTime}
        onBreakMinutesChange={setPastShiftBreakMinutes}
        onNoteChange={setPastShiftNote}
        onSubmit={() => void handlePastShiftSubmit()}
      />
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.22)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748b",
};

const tdStyle: React.CSSProperties = {
  padding: "14px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
  verticalAlign: "top",
  fontSize: 14,
  color: "#0f172a",
};
