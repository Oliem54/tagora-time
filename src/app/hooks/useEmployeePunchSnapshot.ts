"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HORORA_SAME_ORIGIN_LOGIN_PATH } from "@/app/lib/auth/horora-nexus-routing.shared";
import { employeePunchRequestInit } from "@/app/lib/employee-punch-session.client";
import {
  EMPLOYEE_PUNCH_GEOLOCATION_MAX_DURATION_MS,
  employeePunchEventRequiresGeolocation,
  messageForHorodateurPunchGpsServerCode,
  readEmployeePunchGeolocationWithDeadline,
  type EmployeePunchGeolocationFailureCode,
} from "@/app/lib/employee-punch-geolocation.client";
import { employeePunchSuccessMessage } from "@/app/lib/horodateur-v1/punch-confirmation.shared";
import {
  explainEmployeePunchError,
  resolveEmployeePunchGuidance,
  type EmployeePunchAction,
} from "@/app/lib/employee-punch-guidance.shared";

export const EMPLOYEE_PUNCH_BUSINESS_PERMISSION_MESSAGE =
  "La permission terrain est requise pour utiliser l'horodateur.";

export type EmployeePunchGeolocationFailure = {
  code: EmployeePunchGeolocationFailureCode;
  message: string;
};

export type EmployeePunchSnapshot = {
  employee: {
    employeeId: number;
    employee_id?: number | null;
    fullName: string | null;
    email: string | null;
    primaryCompany: "oliem_solutions" | "titan_produits_industriels" | null;
    pausePaid?: boolean;
    lunchPaid?: boolean;
  };
  todayTimeDisplay?: {
    officialPayableMinutes: number;
    livePayableMinutes: number;
    hasOpenShiftAccrual: boolean;
    pendingPunchBlocksAccrual: boolean;
    openShiftSafetyCapReached: boolean;
    computedAt: string;
  } | null;
  currentState: {
    current_state?: string | null;
    status?: string | null;
    last_event_id?: string | null;
    last_event_at?: string | null;
    last_event_type?: string | null;
    currentEventType?: string | null;
    startedAt?: string | null;
    has_open_exception?: boolean;
    activeExceptionCount?: number;
  };
  shift: {
    work_date: string;
    worked_minutes: number;
    payable_minutes: number;
    pending_exception_minutes: number;
    approved_exception_minutes: number;
    anomalies_count: number;
    status: string;
    shift_start_at?: string | null;
  } | null;
  weeklyProjection: {
    workedMinutes: number;
    targetMinutes: number;
    remainingMinutes: number;
    projectedOverflowMinutes: number;
  };
  pendingExceptions: Array<{
    id: string;
    exception_type: string;
    reason_label: string;
    details: string | null;
    impact_minutes: number;
    status: string;
  }>;
};

type PunchResponse = EmployeePunchSnapshot & {
  insertedEvent: {
    id: string;
    event_type: string;
    status: string;
  };
  exception: {
    id: string;
  } | null;
  confirmed?: boolean;
  alreadySubmitted?: boolean;
  alreadySubmittedMessage?: string | null;
  code?: string;
  error?: string;
};

function normalizeDashboardSnapshot(
  payload: Partial<EmployeePunchSnapshot> | undefined
) {
  const employee = (payload?.employee ?? {}) as Partial<
    EmployeePunchSnapshot["employee"]
  >;
  const currentState = (payload?.currentState ?? {}) as Partial<
    EmployeePunchSnapshot["currentState"]
  >;
  const shift = payload?.shift;
  const weeklyProjection = (payload?.weeklyProjection ?? {}) as Partial<
    EmployeePunchSnapshot["weeklyProjection"]
  >;

  return {
    employee: {
      employeeId:
        Number(employee.employeeId ?? employee.employee_id) > 0
          ? Number(employee.employeeId ?? employee.employee_id)
          : 0,
      employee_id:
        Number(employee.employee_id ?? employee.employeeId) > 0
          ? Number(employee.employee_id ?? employee.employeeId)
          : null,
      fullName: employee.fullName ?? null,
      email: employee.email ?? null,
      primaryCompany: employee.primaryCompany ?? null,
      pausePaid: typeof employee.pausePaid === "boolean" ? employee.pausePaid : true,
      lunchPaid: typeof employee.lunchPaid === "boolean" ? employee.lunchPaid : undefined,
    },
    currentState: {
      current_state: currentState.current_state ?? currentState.status ?? "hors_quart",
      status: currentState.status ?? currentState.current_state ?? "hors_quart",
      last_event_id: currentState.last_event_id ?? null,
      last_event_at: currentState.last_event_at ?? null,
      last_event_type: currentState.last_event_type ?? currentState.currentEventType ?? null,
      currentEventType: currentState.currentEventType ?? currentState.last_event_type ?? null,
      startedAt: currentState.startedAt ?? null,
      has_open_exception: Boolean(
        currentState.has_open_exception ?? currentState.activeExceptionCount
      ),
      activeExceptionCount:
        typeof currentState.activeExceptionCount === "number"
          ? currentState.activeExceptionCount
          : undefined,
    },
    shift: shift ?? null,
    weeklyProjection: {
      workedMinutes: weeklyProjection.workedMinutes ?? 0,
      targetMinutes: weeklyProjection.targetMinutes ?? 40 * 60,
      remainingMinutes: weeklyProjection.remainingMinutes ?? 40 * 60,
      projectedOverflowMinutes: weeklyProjection.projectedOverflowMinutes ?? 0,
    },
    pendingExceptions: Array.isArray(payload?.pendingExceptions)
      ? payload.pendingExceptions
      : [],
    todayTimeDisplay: normalizeTodayTimeDisplay(payload?.todayTimeDisplay),
  } satisfies EmployeePunchSnapshot;
}

function normalizeTodayTimeDisplay(
  raw: EmployeePunchSnapshot["todayTimeDisplay"] | undefined
): EmployeePunchSnapshot["todayTimeDisplay"] {
  if (!raw || typeof raw !== "object") return null;
  return {
    officialPayableMinutes:
      typeof raw.officialPayableMinutes === "number" ? raw.officialPayableMinutes : 0,
    livePayableMinutes:
      typeof raw.livePayableMinutes === "number" ? raw.livePayableMinutes : 0,
    hasOpenShiftAccrual: Boolean(raw.hasOpenShiftAccrual),
    pendingPunchBlocksAccrual: Boolean(raw.pendingPunchBlocksAccrual),
    openShiftSafetyCapReached: Boolean(raw.openShiftSafetyCapReached),
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : new Date().toISOString(),
  };
}

function redirectToNexusLogin() {
  window.location.assign(HORORA_SAME_ORIGIN_LOGIN_PATH);
}

export function useEmployeePunchSnapshot(enabled: boolean) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [geolocationPending, setGeolocationPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState<EmployeePunchSnapshot | null>(null);
  const [geolocationFailure, setGeolocationFailure] =
    useState<EmployeePunchGeolocationFailure | null>(null);
  const submitLockRef = useRef(false);
  const pendingEventTypeRef = useRef<string | null>(null);

  const loadSnapshot = useCallback(async (options?: { background?: boolean }) => {
    if (!enabled) {
      setLoading(false);
      setSnapshot(null);
      return;
    }

    if (!options?.background) {
      setLoading(true);
      setError("");
    }

    try {
      const response = await fetch(
        "/api/horodateur/punch",
        employeePunchRequestInit()
      );

      if (response.status === 401) {
        redirectToNexusLogin();
        return;
      }

      const payload = (await response.json()) as
        | ({ error?: string; code?: string } & Partial<EmployeePunchSnapshot>)
        | undefined;

      if (!response.ok) {
        if (payload?.code === "permission_denied") {
          throw new Error(EMPLOYEE_PUNCH_BUSINESS_PERMISSION_MESSAGE);
        }
        throw new Error(
          explainEmployeePunchError(payload?.error ?? "Impossible de charger l'horodateur.")
        );
      }

      setSnapshot(normalizeDashboardSnapshot(payload));
    } catch (loadError) {
      setError(
        explainEmployeePunchError(
          loadError instanceof Error ? loadError.message : "Erreur de chargement."
        )
      );
    } finally {
      if (!options?.background) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!enabled) return;
    const intervalId = window.setInterval(() => {
      void loadSnapshot({ background: true });
    }, 60_000);
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void loadSnapshot({ background: true });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, loadSnapshot]);

  const currentState =
    snapshot?.currentState.current_state ??
    snapshot?.currentState.status ??
    "hors_quart";
  const pausePaid = snapshot?.employee.pausePaid !== false;
  const punchGuidance = useMemo(
    () =>
      resolveEmployeePunchGuidance({
        currentState,
        available: enabled,
        pausePaid,
        lunchPaid: snapshot?.employee.lunchPaid === true,
        shiftStatus: snapshot?.shift?.status,
        pendingValidation:
          snapshot?.currentState.has_open_exception === true ||
          snapshot?.shift?.status === "en_attente",
        arrivalAt:
          snapshot?.currentState.startedAt ?? snapshot?.shift?.shift_start_at ?? null,
      }),
    [currentState, enabled, pausePaid, snapshot]
  );
  const primaryFromGuidance = punchGuidance.primary;
  const principalAction = primaryFromGuidance?.eventType
    ? {
        eventType: primaryFromGuidance.eventType,
        label: primaryFromGuidance.label,
        submitsPunch: true,
      }
    : {
        eventType: "punch_in",
        label: primaryFromGuidance?.label ?? "Consulter le pointage",
        submitsPunch: false,
      };
  const secondaryActions: EmployeePunchAction[] = punchGuidance.secondary;

  const actionDisabled = useMemo(
    () => ({
      pauseStart: currentState !== "en_quart" || pausePaid,
      pauseEnd: currentState !== "en_pause" || pausePaid,
      dinnerStart: currentState !== "en_quart",
      dinnerEnd: currentState !== "en_diner",
    }),
    [currentState, pausePaid]
  );

  const submitPunch = useCallback(
    async (eventType: string, options?: { skipGeolocationCache?: boolean }) => {
      if (submitLockRef.current) {
        return;
      }

      submitLockRef.current = true;
      pendingEventTypeRef.current = eventType;
      setSubmitting(true);
      setError("");
      setMessage("");
      setGeolocationFailure(null);

      try {
        const body: {
          eventType: string;
          latitude?: number;
          longitude?: number;
        } = { eventType };

        if (employeePunchEventRequiresGeolocation(eventType)) {
          setGeolocationPending(true);
          const gpsResult = await readEmployeePunchGeolocationWithDeadline(
            EMPLOYEE_PUNCH_GEOLOCATION_MAX_DURATION_MS,
            undefined,
            { skipCache: options?.skipGeolocationCache === true }
          );
          setGeolocationPending(false);

          if (!gpsResult.ok) {
            setGeolocationFailure({
              code: gpsResult.code,
              message: gpsResult.message,
            });
            return;
          }

          body.latitude = gpsResult.latitude;
          body.longitude = gpsResult.longitude;
        }

        const response = await fetch(
          "/api/horodateur/punch",
          employeePunchRequestInit({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          })
        );

        if (response.status === 401) {
          redirectToNexusLogin();
          return;
        }

        const payload = (await response.json()) as
          | ({ error?: string; code?: string } & Partial<PunchResponse>)
          | undefined;

        if (payload?.code === "permission_denied") {
          throw new Error(EMPLOYEE_PUNCH_BUSINESS_PERMISSION_MESSAGE);
        }

        if (!response.ok) {
          throw new Error(
            explainEmployeePunchError(
              messageForHorodateurPunchGpsServerCode(
                payload?.code,
                payload?.error
              )
            )
          );
        }

        const confirmed = payload?.confirmed === true;
        if (!confirmed) {
          await loadSnapshot();
          setMessage("Confirmation du pointage en cours…");
          return;
        }

        setSnapshot(normalizeDashboardSnapshot(payload ?? snapshot ?? undefined));

        setMessage(
          employeePunchSuccessMessage({
            confirmed: true,
            alreadySubmitted: payload?.alreadySubmitted === true,
            alreadySubmittedMessage: payload?.alreadySubmittedMessage ?? null,
            exception: payload?.exception,
            punchOut: pendingEventTypeRef.current === "punch_out",
          }) ?? "Confirmation du pointage en cours…"
        );
      } catch (submitError) {
        setError(
          explainEmployeePunchError(
            submitError instanceof Error ? submitError.message : "Erreur de pointage."
          )
        );
      } finally {
        setGeolocationPending(false);
        setSubmitting(false);
        submitLockRef.current = false;
      }
    },
    [loadSnapshot, snapshot]
  );

  const retryGeolocation = useCallback(async () => {
    const eventType = pendingEventTypeRef.current ?? principalAction.eventType;
    await submitPunch(eventType, { skipGeolocationCache: true });
  }, [principalAction.eventType, submitPunch]);

  const clearGeolocationFailure = useCallback(() => {
    setGeolocationFailure(null);
  }, []);

  return {
    enabled,
    loading,
    submitting,
    geolocationPending,
    error,
    message,
    snapshot,
    geolocationFailure,
    currentState,
    principalAction,
    secondaryActions,
    guidanceText: punchGuidance.guidance,
    serviceSinceLabel: punchGuidance.serviceSinceLabel,
    statusLabel: punchGuidance.statusLabel,
    actionDisabled,
    loadSnapshot,
    submitPunch,
    retryGeolocation,
    clearGeolocationFailure,
  };
}

export type EmployeePunchController = ReturnType<typeof useEmployeePunchSnapshot>;
