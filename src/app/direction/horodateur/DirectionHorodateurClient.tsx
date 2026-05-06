"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  LayoutDashboard,
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
  const [liveFilter, setLiveFilter] = useState<LiveFilter>("tous");
  const [config, setConfig] = useState<AlertConfig>({
    email_enabled: false,
    sms_enabled: false,
    reminder_delay_minutes: 60,
    direction_emails: [],
    direction_sms_numbers: [],
  });

  const boardStats = useMemo(() => {
    return board.reduce(
      (acc, row) => {
        const state = getRowState(row);
        const todayMinutes = Math.max(0, row.todayShift?.payable_minutes ?? 0);
        const weekWorked = Math.max(0, row.weekWorkedMinutes ?? 0);
        const weekTarget = Math.max(0, row.weekTargetMinutes ?? 0);
        const hasException = row.hasOpenException || (row.activeExceptionCount ?? 0) > 0;

        acc.totalTodayMinutes += todayMinutes;
        acc.totalWeekWorkedMinutes += weekWorked;
        acc.totalWeekTargetMinutes += weekTarget;

        if (state === "en_quart") {
          acc.active += 1;
        }
        if (state === "en_pause" || state === "en_diner") {
          acc.paused += 1;
        }
        if (row.todayShift?.status === "en_attente") {
          acc.pendingRows += 1;
        }
        if (hasException) {
          acc.exceptionRows += 1;
        }

        return acc;
      },
      {
        active: 0,
        paused: 0,
        pendingRows: 0,
        exceptionRows: 0,
        totalTodayMinutes: 0,
        totalWeekWorkedMinutes: 0,
        totalWeekTargetMinutes: 0,
      }
    );
  }, [board]);

  const counts = useMemo(
    () => ({
      employees: board.length,
      active: boardStats.active,
      paused: boardStats.paused,
      pending: exceptions.length,
    }),
    [board.length, boardStats.active, boardStats.paused, exceptions.length]
  );

  const hasEmployees = board.length > 0;
  const hasExceptions = exceptions.length > 0;
  const isBusy = activeActionKey !== null;
  const invalidEmails = useMemo(
    () =>
      config.direction_emails.filter((item) => item.trim().length > 0 && !isValidEmail(item)),
    [config.direction_emails]
  );
  const globalMetrics = useMemo(() => {
    return {
      employeesInShift: boardStats.active,
      inShiftPercent:
        board.length > 0 ? Math.round((boardStats.active / board.length) * 100) : 0,
      totalTodayMinutes: boardStats.totalTodayMinutes,
      totalWeekWorkedMinutes: boardStats.totalWeekWorkedMinutes,
      totalWeekTargetMinutes: boardStats.totalWeekTargetMinutes,
      teamProgressPercent:
        boardStats.totalWeekTargetMinutes > 0
          ? Math.round(
              (boardStats.totalWeekWorkedMinutes / boardStats.totalWeekTargetMinutes) * 100
            )
          : 0,
    };
  }, [board.length, boardStats]);

  const tableFilterCounts = useMemo(
    () => ({
      enQuart: boardStats.active,
      enAttente: boardStats.pendingRows,
      exceptions: boardStats.exceptionRows,
    }),
    [boardStats.active, boardStats.pendingRows, boardStats.exceptionRows]
  );

  const exceptionsByEmployeeId = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of exceptions) {
      const key = Number(item.employee_id || 0);
      if (!Number.isFinite(key) || key <= 0) {
        continue;
      }
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [exceptions]);
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
          setBoard(
            Array.isArray(result.live.payload.board)
              ? result.live.payload.board.map(normalizeLiveRow)
              : []
          );
        } else {
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
        setMessage("Action enregistree avec exception en attente.");
      } else {
        setMessage("Action direction enregistree.");
      }

      setNote("");
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
            body: JSON.stringify({}),
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
      setMessage("Exception approuvee.");
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

  async function handleRefuse(exceptionId: string) {
    const reviewNote = window.prompt("Note de refus obligatoire") ?? "";

    if (!reviewNote.trim()) {
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
      setMessage("Exception refusee.");
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
            subtitle="Chargement"
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
            subtitle="Acces restreint"
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
          showNavigation={false}
          compact
          actions={
            <div
              style={{
                display: "flex",
                gap: "var(--ui-space-3)",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <Link
                href="/direction/horodateur/registre"
                className="tagora-dark-outline-action"
                style={{ textDecoration: "none" }}
              >
                <span>Consulter le registre des heures</span>
              </Link>

              <Link
                href="/direction/dashboard"
                className="tagora-dark-outline-action"
                style={{ textDecoration: "none" }}
              >
                <ArrowLeft size={16} />
                <span>Retour</span>
              </Link>

              <Link
                href="/direction/dashboard"
                className="tagora-dark-action"
                style={{ textDecoration: "none" }}
              >
                <LayoutDashboard size={16} />
                <span>Tableau de bord direction</span>
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
              {exceptions.map((item) => (
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
                    <div className="ui-stack-xs">
                      <span className="ui-eyebrow">Employe</span>
                      <strong style={{ fontSize: 18 }}>
                        {item.employee?.fullName || item.employee?.email || item.id}
                      </strong>
                      <span className="ui-text-muted">
                        {item.event
                          ? `${item.event.event_type} - ${formatDateTime(resolveOccurredAt(item.event))}`
                          : "Evenement lie"}
                      </span>
                    </div>
                    <StatusBadge label="En attente" tone="warning" />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "var(--ui-space-2)",
                    }}
                  >
                    <AppCard tone="default" className="ui-stack-xs">
                      <span className="ui-eyebrow">Exception</span>
                      <strong>{item.reason_label}</strong>
                      <span className="ui-text-muted">{item.exception_type}</span>
                    </AppCard>
                    <AppCard tone="default" className="ui-stack-xs">
                      <span className="ui-eyebrow">Impact</span>
                      <strong>{formatMinutes(item.impact_minutes)}</strong>
                      <span className="ui-text-muted">{item.status}</span>
                    </AppCard>
                  </div>

                  {item.details ? (
                    <AppCard tone="default" className="ui-stack-xs">
                      <span className="ui-eyebrow">Details</span>
                      <span className="ui-text-muted">{item.details}</span>
                    </AppCard>
                  ) : null}

                  <AppCard tone="default" className="ui-stack-xs">
                    <span className="ui-eyebrow">Journal des notifications</span>
                    <span className="ui-text-muted">
                      Email initial: {formatDateTime(item.direction_email_notified_at ?? null)}
                    </span>
                    <span className="ui-text-muted">
                      SMS initial: {formatDateTime(item.direction_sms_notified_at ?? null)}
                    </span>
                    <span className="ui-text-muted">
                      Rappel email: {formatDateTime(item.direction_reminder_email_notified_at ?? null)}
                    </span>
                    <span className="ui-text-muted">
                      Rappel SMS: {formatDateTime(item.direction_reminder_sms_notified_at ?? null)}
                    </span>
                  </AppCard>

                  <div
                    style={{
                      display: "flex",
                      gap: "var(--ui-space-2)",
                      flexWrap: "wrap",
                    }}
                  >
                    <PrimaryButton
                      onClick={() => void handleApprove(item.id)}
                      disabled={isBusy}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <ShieldCheck size={16} />
                        {activeActionKey === `approve:${item.id}`
                          ? "Approbation..."
                          : "Approuver"}
                      </span>
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => void handleRefuse(item.id)}
                      disabled={isBusy}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <TimerReset size={16} />
                        {activeActionKey === `refuse:${item.id}`
                          ? "Refus..."
                          : "Refuser"}
                      </span>
                    </SecondaryButton>
                    {item.employee?.employeeId ? (
                      <Link
                        href={`/direction/ressources/employes/${item.employee.employeeId}`}
                        className="tagora-dark-outline-action"
                        style={{ textDecoration: "none" }}
                      >
                        <span>Voir l employe</span>
                      </Link>
                    ) : null}
                  </div>
                </AppCard>
              ))}
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
              ["en_quart", `En quart (${tableFilterCounts.enQuart})`],
              ["en_attente", `En attente (${tableFilterCounts.enAttente})`],
              ["exceptions", `Exceptions (${tableFilterCounts.exceptions})`],
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
                    <th style={thStyle}>Quart du jour</th>
                    <th style={thStyle}>Semaine</th>
                    <th style={thStyle}>Projection</th>
                    <th style={thStyle}>Exceptions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBoard.map((row) => {
                    const rowEmployeeId = row.employeeId || row.employee_id || 0;
                    const rowExceptionCount = Math.max(
                      exceptionsByEmployeeId.get(rowEmployeeId) ?? 0,
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

        <SectionCard title="Action direction" subtitle="Punch manuel trace.">
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
