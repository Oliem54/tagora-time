"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, PauseCircle, PlayCircle, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import StatusBadge from "@/app/components/ui/StatusBadge";

type HorodateurEmployeeCardProps = {
  enabled: boolean;
};

type DashboardSnapshot = {
  employee: {
    employeeId: number;
    employee_id?: number | null;
    fullName: string | null;
    email: string | null;
    primaryCompany: "oliem_solutions" | "titan_produits_industriels" | null;
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

type PunchResponse = DashboardSnapshot & {
  insertedEvent: {
    id: string;
    event_type: string;
    status: string;
  };
  exception: {
    id: string;
  } | null;
};

function normalizeDashboardSnapshot(payload: Partial<DashboardSnapshot> | undefined) {
  const employee = payload?.employee ?? {};
  const currentState = payload?.currentState ?? {};
  const shift = payload?.shift;
  const weeklyProjection = payload?.weeklyProjection ?? {};

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
  } satisfies DashboardSnapshot;
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, totalMinutes || 0);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("fr-CA");
}

function getStateLabel(state: string | null | undefined) {
  switch (state) {
    case "en_quart":
      return "En quart";
    case "en_pause":
      return "En pause";
    case "en_diner":
      return "En diner";
    case "termine":
      return "Quart termine";
    default:
      return "Hors quart";
  }
}

function getStateTone(state: string | null | undefined) {
  switch (state) {
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

export default function HorodateurEmployeeCard({
  enabled,
}: HorodateurEmployeeCardProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setLoading(false);
      setError("Session introuvable pour charger l horodateur.");
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
        | ({ error?: string } & Partial<DashboardSnapshot>)
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Impossible de charger l horodateur.");
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
          label: "Punch sortie",
        }
      : {
          eventType: "punch_in",
          label: "Punch entree",
        };

  const actionDisabled = useMemo(
    () => ({
      pauseStart: currentState !== "en_quart",
      pauseEnd: currentState !== "en_pause",
      dinnerStart: currentState !== "en_quart",
      dinnerEnd: currentState !== "en_diner",
    }),
    [currentState]
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
        throw new Error(payload?.error ?? "Impossible d enregistrer le pointage.");
      }

      setSnapshot(normalizeDashboardSnapshot(payload ?? snapshot ?? undefined));

      setMessage(
        payload?.exception
          ? "Pointage enregistre avec exception en attente."
          : "Pointage enregistre."
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Erreur de pointage."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!enabled) {
    return (
      <AppCard tone="muted">
        <p className="ui-text-muted" style={{ margin: 0 }}>
          La permission terrain est requise pour utiliser l horodateur.
        </p>
      </AppCard>
    );
  }

  if (loading) {
    return (
      <AppCard tone="muted">
        <p className="ui-text-muted" style={{ margin: 0 }}>
          Chargement de l horodateur...
        </p>
      </AppCard>
    );
  }

  return (
    <div className="ui-stack-md">
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
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--ui-space-3)",
        }}
      >
        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">Etat actuel</span>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <strong style={{ fontSize: 20 }}>{getStateLabel(currentState)}</strong>
            <StatusBadge
              label={getStateLabel(currentState)}
              tone={getStateTone(currentState)}
            />
          </div>
        </AppCard>

        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">Quart du jour</span>
          <strong style={{ fontSize: 20 }}>
            {formatMinutes(snapshot?.shift?.payable_minutes ?? 0)}
          </strong>
          <span className="ui-text-muted">
            Travaille: {formatMinutes(snapshot?.shift?.worked_minutes ?? 0)}
          </span>
        </AppCard>

        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">Semaine</span>
          <strong style={{ fontSize: 20 }}>
            {formatMinutes(snapshot?.weeklyProjection.workedMinutes ?? 0)}
          </strong>
          <span className="ui-text-muted">
            Restant: {formatMinutes(snapshot?.weeklyProjection.remainingMinutes ?? 0)}
          </span>
        </AppCard>

        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">Exceptions</span>
          <strong style={{ fontSize: 20 }}>
            {snapshot?.pendingExceptions.length ?? 0}
          </strong>
          <span className="ui-text-muted">
            Dernier event: {formatDateTime(snapshot?.currentState.last_event_at)}
          </span>
        </AppCard>
      </div>

      <AppCard tone="elevated" className="ui-stack-md">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "var(--ui-space-3)",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div className="ui-stack-xs">
            <span className="ui-eyebrow">Horodateur</span>
            <h3
              style={{
                margin: 0,
                fontSize: 24,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                color: "var(--ui-color-primary)",
              }}
            >
              Pointage de la journee
            </h3>
            <p className="ui-text-muted" style={{ margin: 0 }}>
              {snapshot?.shift?.work_date ?? "-"} ·{" "}
              {getCompanyLabel(snapshot?.employee.primaryCompany ?? null)}
            </p>
          </div>
          <StatusBadge
            label={
              snapshot?.currentState.has_open_exception
                ? "Exception en attente"
                : "A jour"
            }
            tone={
              snapshot?.currentState.has_open_exception ? "warning" : "success"
            }
          />
        </div>

        <div className="ui-grid-2">
          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">Quart</span>
            <span className="ui-text-muted">
              Statut: {snapshot?.shift?.status ?? "ouvert"}
            </span>
            <span className="ui-text-muted">
              Minutes en attente:{" "}
              {formatMinutes(snapshot?.shift?.pending_exception_minutes ?? 0)}
            </span>
            <span className="ui-text-muted">
              Anomalies: {snapshot?.shift?.anomalies_count ?? 0}
            </span>
          </AppCard>

          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">Projection 40 h</span>
            <span className="ui-text-muted">
              Cible: {formatMinutes(snapshot?.weeklyProjection.targetMinutes ?? 0)}
            </span>
            <span className="ui-text-muted">
              Depassement projete:{" "}
              {formatMinutes(
                snapshot?.weeklyProjection.projectedOverflowMinutes ?? 0
              )}
            </span>
            <span className="ui-text-muted">
              Exception(s): {snapshot?.pendingExceptions.length ?? 0}
            </span>
          </AppCard>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--ui-space-3)",
          }}
        >
          <PrimaryButton
            onClick={() => void submitPunch(principalAction.eventType)}
            disabled={submitting}
            style={{ justifyContent: "space-between" }}
          >
            <span>{principalAction.label}</span>
            <Clock3 size={16} />
          </PrimaryButton>

          <SecondaryButton
            onClick={() => void submitPunch("break_start")}
            disabled={submitting || actionDisabled.pauseStart}
            style={{ justifyContent: "space-between" }}
          >
            <span>Debut pause</span>
            <PauseCircle size={16} />
          </SecondaryButton>

          <SecondaryButton
            onClick={() => void submitPunch("break_end")}
            disabled={submitting || actionDisabled.pauseEnd}
            style={{ justifyContent: "space-between" }}
          >
            <span>Fin pause</span>
            <PlayCircle size={16} />
          </SecondaryButton>

          <SecondaryButton
            onClick={() => void submitPunch("meal_start")}
            disabled={submitting || actionDisabled.dinnerStart}
            style={{ justifyContent: "space-between" }}
          >
            <span>Debut diner</span>
            <UtensilsCrossed size={16} />
          </SecondaryButton>

          <SecondaryButton
            onClick={() => void submitPunch("meal_end")}
            disabled={submitting || actionDisabled.dinnerEnd}
            style={{ justifyContent: "space-between" }}
          >
            <span>Fin diner</span>
            <PlayCircle size={16} />
          </SecondaryButton>
        </div>

        {snapshot?.pendingExceptions.length ? (
          <div className="ui-stack-sm">
            <span className="ui-eyebrow">Exceptions en attente</span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "var(--ui-space-3)",
              }}
            >
              {snapshot.pendingExceptions.slice(0, 3).map((item) => (
                <AppCard key={item.id} tone="muted" className="ui-stack-xs">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <strong style={{ fontSize: 14 }}>{item.reason_label}</strong>
                    <StatusBadge label={item.status} tone="warning" />
                  </div>
                  <span className="ui-text-muted">{item.exception_type}</span>
                  <span className="ui-text-muted">
                    Impact: {formatMinutes(item.impact_minutes)}
                  </span>
                  {item.details ? (
                    <span className="ui-text-muted">{item.details}</span>
                  ) : null}
                </AppCard>
              ))}
            </div>
          </div>
        ) : null}
      </AppCard>
    </div>
  );
}
