"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabase/client";

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

export function useEmployeePunchSnapshot(enabled: boolean) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState<EmployeePunchSnapshot | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setSnapshot(null);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setLoading(false);
      setError("Session introuvable pour charger l'horodateur.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/horodateur/punch", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json()) as
        | ({ error?: string } & Partial<EmployeePunchSnapshot>)
        | undefined;

      if (!response.ok) {
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

  async function submitPunch(eventType: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("Session introuvable pour envoyer le pointage.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/horodateur/punch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType,
        }),
      });

      const payload = (await response.json()) as
        | ({ error?: string } & Partial<PunchResponse>)
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Impossible d'enregistrer le pointage.");
      }

      setSnapshot(normalizeDashboardSnapshot(payload ?? snapshot ?? undefined));

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
      setSubmitting(false);
    }
  }

  return {
    enabled,
    loading,
    submitting,
    error,
    message,
    snapshot,
    currentState,
    principalAction,
    actionDisabled,
    loadSnapshot,
    submitPunch,
  };
}

export type EmployeePunchController = ReturnType<typeof useEmployeePunchSnapshot>;
