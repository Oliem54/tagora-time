"use client";

import { useEffect, useState } from "react";
import { Clock3, PauseCircle, PlayCircle, UtensilsCrossed } from "lucide-react";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import StatusBadge from "@/app/components/ui/StatusBadge";
import type { EmployeePunchController } from "@/app/hooks/useEmployeePunchSnapshot";
import { accrueOpenShiftDisplayMinutes } from "@/app/lib/employee-punch-guidance.shared";
import {
  employeePunchStatusTone,
  mapEmployeePunchStatus,
} from "@/app/lib/employee-punch-status.shared";

type HorodateurEmployeeCardProps = {
  punch: EmployeePunchController;
  onOpenHorodateur?: () => void;
};

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

function secondaryIcon(eventType: string | null) {
  if (eventType === "meal_start") return UtensilsCrossed;
  if (eventType === "break_start") return PauseCircle;
  if (eventType === "break_end" || eventType === "meal_end") return PlayCircle;
  return Clock3;
}

export default function HorodateurEmployeeCard({
  punch,
  onOpenHorodateur,
}: HorodateurEmployeeCardProps) {
  const {
    enabled,
    loading,
    submitting,
    geolocationPending,
    error,
    message,
    snapshot,
    currentState,
    principalAction,
    secondaryActions,
    guidanceText,
    serviceSinceLabel,
    statusLabel,
    submitPunch,
  } = punch;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timerId);
  }, []);
  const punchStatus = mapEmployeePunchStatus(currentState, {
    available: enabled,
  });
  const liveDisplay = snapshot?.todayTimeDisplay;
  const baseDayMinutes = liveDisplay?.hasOpenShiftAccrual
    ? liveDisplay.livePayableMinutes
    : (snapshot?.shift?.payable_minutes ?? 0);
  const dayMinutes = accrueOpenShiftDisplayMinutes({
    baseMinutes: baseDayMinutes,
    computedAt: liveDisplay?.computedAt,
    nowMs,
    accrues:
      liveDisplay?.hasOpenShiftAccrual === true &&
      !liveDisplay.pendingPunchBlocksAccrual &&
      !liveDisplay.openShiftSafetyCapReached &&
      currentState === "en_quart",
  });
  const anomalyCount = snapshot?.shift?.anomalies_count ?? 0;

  if (!enabled) {
    return (
      <AppCard tone="muted">
        <p className="ui-text-muted" style={{ margin: 0 }}>
          La permission terrain est requise pour utiliser l&apos;horodateur.
        </p>
      </AppCard>
    );
  }

  if (loading) {
    return (
      <AppCard tone="muted">
        <p className="ui-text-muted" style={{ margin: 0 }}>
          Chargement de l&apos;horodateur...
        </p>
      </AppCard>
    );
  }

  return (
    <div className="ui-stack-md employe-dashboard-punch-board">
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

      <div className="employe-dashboard-punch-stats">
        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">État actuel</span>
          <div className="employe-dashboard-punch-stat-row">
            <strong>{statusLabel}</strong>
            <StatusBadge
              label={statusLabel}
              tone={employeePunchStatusTone(punchStatus)}
            />
          </div>
          {serviceSinceLabel ? (
            <span className="ui-text-muted">{serviceSinceLabel}</span>
          ) : null}
        </AppCard>

        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">
            {liveDisplay?.hasOpenShiftAccrual ? "Temps en cours" : "Quart du jour"}
          </span>
          <strong>{formatMinutes(dayMinutes)}</strong>
          <span className="ui-text-muted">
            {liveDisplay?.hasOpenShiftAccrual
              ? "Avance pendant que vous êtes en service."
              : `Travaillé : ${formatMinutes(snapshot?.shift?.worked_minutes ?? 0)}`}
          </span>
        </AppCard>

        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">Semaine</span>
          <strong>
            {formatMinutes(snapshot?.weeklyProjection.workedMinutes ?? 0)}
          </strong>
          <span className="ui-text-muted">
            Restant: {formatMinutes(snapshot?.weeklyProjection.remainingMinutes ?? 0)}
          </span>
        </AppCard>

        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">Exceptions</span>
          <strong>{snapshot?.pendingExceptions.length ?? 0}</strong>
          <span className="ui-text-muted">
            Dernier événement: {formatDateTime(snapshot?.currentState.last_event_at)}
          </span>
        </AppCard>
      </div>

      <AppCard tone="elevated" className="ui-stack-md employe-dashboard-punch-primary">
        <div className="employe-dashboard-punch-primary-head">
          <div className="ui-stack-xs">
            <span className="ui-eyebrow">Action principale</span>
            <h3>Horodateur / Pointage</h3>
            <p className="ui-text-muted" style={{ margin: 0 }}>
              {guidanceText}
            </p>
            <p className="ui-text-muted" style={{ margin: 0 }}>
              {snapshot?.shift?.work_date ?? "-"} ·{" "}
              {getCompanyLabel(snapshot?.employee.primaryCompany ?? null)}
            </p>
          </div>
          <StatusBadge
            label={
              snapshot?.currentState.has_open_exception
                ? "Exception en attente"
                : "À jour"
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
              {anomalyCount > 0
                ? "Pointage à faire vérifier par la direction."
                : "Aucune anomalie à vérifier."}
            </span>
          </AppCard>

          <AppCard tone="muted" className="ui-stack-xs">
            <span className="ui-eyebrow">Projection 40 h</span>
            <span className="ui-text-muted">
              Cible: {formatMinutes(snapshot?.weeklyProjection.targetMinutes ?? 0)}
            </span>
            <span className="ui-text-muted">
              Dépassement projeté:{" "}
              {formatMinutes(
                snapshot?.weeklyProjection.projectedOverflowMinutes ?? 0
              )}
            </span>
            <span className="ui-text-muted">
              Exception(s): {snapshot?.pendingExceptions.length ?? 0}
            </span>
          </AppCard>
        </div>

        <div className="employe-dashboard-punch-actions">
          <PrimaryButton
            onClick={() => {
              if (!principalAction.submitsPunch) {
                onOpenHorodateur?.();
                return;
              }
              void submitPunch(principalAction.eventType);
            }}
            disabled={
              submitting ||
              geolocationPending ||
              (!principalAction.submitsPunch && !onOpenHorodateur)
            }
            className="employe-dashboard-punch-actions-primary"
          >
            <span>
              {geolocationPending ? "Localisation en cours…" : principalAction.label}
            </span>
            <Clock3 size={16} aria-hidden />
          </PrimaryButton>

          {secondaryActions.map((action) => {
            if (!action.eventType) return null;
            const Icon = secondaryIcon(action.eventType);
            return (
              <SecondaryButton
                key={action.eventType}
                onClick={() => void submitPunch(action.eventType as string)}
                disabled={submitting}
              >
                <span>{action.label}</span>
                <Icon size={16} aria-hidden />
              </SecondaryButton>
            );
          })}
        </div>

        {snapshot?.pendingExceptions.length ? (
          <div className="ui-stack-sm">
            <span className="ui-eyebrow">Exceptions en attente</span>
            <div className="employe-dashboard-punch-exceptions">
              {snapshot.pendingExceptions.slice(0, 3).map((item) => (
                <AppCard key={item.id} tone="muted" className="ui-stack-xs">
                  <div className="employe-dashboard-punch-stat-row">
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
