"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import { employeePunchRequestInit } from "@/app/lib/employee-punch-session.client";
import {
  EMPLOYEE_PUNCH_GEOLOCATION_MAX_DURATION_MS,
  employeePunchEventRequiresGeolocation,
  messageForHorodateurPunchGpsServerCode,
  readEmployeePunchGeolocationWithDeadline,
  type EmployeePunchGeolocationFailureCode,
} from "@/app/lib/employee-punch-geolocation.client";

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
  };
  currentState: {
    current_state?: string | null;
    status?: string | null;
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
    },
    currentState: {
      current_state: currentState.current_state ?? currentState.status ?? "hors_quart",
      status: currentState.status ?? currentState.current_state ?? "hors_quart",
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
  } satisfies EmployeePunchSnapshot;
}

function redirectToNexusLogin() {
  window.location.assign(NEXUS_PUBLIC_LOGIN_URL);
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

  const loadSnapshot = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setError("");

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
        throw new Error(payload?.error ?? "Impossible de charger l'horodateur.");
      }

      setSnapshot(normalizeDashboardSnapshot(payload));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Erreur de chargement."
      );
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const currentState =
    snapshot?.currentState.current_state ??
    snapshot?.currentState.status ??
    "hors_quart";
  const principalAction =
    currentState === "en_quart" ||
    currentState === "en_pause" ||
    currentState === "en_diner"
      ? {
          eventType: "punch_out",
          label: "Pointer la sortie",
        }
      : {
          eventType: "punch_in",
          label: "Pointer l'entrée",
        };

  const pausePaid = snapshot?.employee.pausePaid !== false;

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
            messageForHorodateurPunchGpsServerCode(
              payload?.code,
              payload?.error
            )
          );
        }

        setSnapshot(normalizeDashboardSnapshot(payload ?? snapshot ?? undefined));

        if (payload?.alreadySubmitted === true) {
          setMessage(
            payload.alreadySubmittedMessage?.trim() ||
              "Ce pointage a déjà été enregistré."
          );
          return;
        }

        setMessage(
          payload?.exception
            ? "Pointage enregistré avec exception en attente."
            : "Pointage enregistré."
        );
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Erreur de pointage."
        );
      } finally {
        setGeolocationPending(false);
        setSubmitting(false);
        submitLockRef.current = false;
      }
    },
    [snapshot]
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
    actionDisabled,
    loadSnapshot,
    submitPunch,
    retryGeolocation,
    clearGeolocationFailure,
  };
}

export type EmployeePunchController = ReturnType<typeof useEmployeePunchSnapshot>;
