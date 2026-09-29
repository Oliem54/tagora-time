"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import AppCard from "@/app/components/ui/AppCard";
import EmployeeExceptionExplanation from "@/app/components/horodateur/EmployeeExceptionExplanation";
import ForgottenArrivalDialog from "@/app/components/horodateur/ForgottenArrivalDialog";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import StatusBadge from "@/app/components/ui/StatusBadge";
import { useLiveClock } from "@/app/hooks/useLiveClock";
import type { EmployeePunchController } from "@/app/hooks/useEmployeePunchSnapshot";
import {
  formatElapsedHours,
  isOpenShiftState,
  resolveShiftTimePresentation,
} from "@/app/lib/employee-punch-guidance.shared";
import {
  employeePunchStatusTone,
  mapEmployeePunchStatus,
} from "@/app/lib/employee-punch-status.shared";

type HorodateurEmployeeCardProps = {
  punch: EmployeePunchController;
};

function formatMinutes(totalMinutes: number) {
  return formatElapsedHours(totalMinutes);
}

export default function HorodateurEmployeeCard({
  punch,
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
    guidance,
    submitPunch,
    submitForgottenArrival,
  } = punch;
  const [forgottenOpen, setForgottenOpen] = useState(false);
  const [forgottenError, setForgottenError] = useState<string | null>(null);
  const onDuty = isOpenShiftState(currentState);
  const now = useLiveClock(onDuty);
  const timeDisplay = snapshot?.todayTimeDisplay;
  const lastEventType = snapshot?.currentState.last_event_type;
  const arrivalAt =
    timeDisplay?.arrivalRecordedAt ??
    snapshot?.currentState.startedAt ??
    (lastEventType === "punch_in" || lastEventType === "quart_debut"
      ? snapshot?.currentState.last_event_at ?? null
      : null);
  const presentation = resolveShiftTimePresentation({
    currentState,
    officialPayableMinutes:
      timeDisplay?.officialPayableMinutes ?? snapshot?.shift?.payable_minutes ?? 0,
    livePayableMinutes: timeDisplay?.livePayableMinutes ?? snapshot?.shift?.worked_minutes ?? 0,
    hasOpenShiftAccrual: Boolean(timeDisplay?.hasOpenShiftAccrual),
    pendingValidation:
      guidance.phase === "quart_en_attente" ||
      Boolean(timeDisplay?.pendingPunchBlocksAccrual) ||
      (snapshot?.pendingExceptions.length ?? 0) > 0 ||
      snapshot?.shift?.status === "en_attente",
    arrivalAt,
    nowIso: now.toISOString(),
    computedAt: timeDisplay?.computedAt ?? null,
  });
  const punchStatus = mapEmployeePunchStatus(currentState, {
    available: enabled,
  });

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
            <strong>{guidance.statusLabel}</strong>
            <StatusBadge
              label={guidance.statusLabel}
              tone={employeePunchStatusTone(punchStatus)}
            />
          </div>
        </AppCard>

        <AppCard tone="muted" className="ui-stack-xs">
          <span className="ui-eyebrow">{presentation.headlineLabel}</span>
          <strong>{formatMinutes(presentation.displayedMinutes)}</strong>
          {presentation.showPayrollApart ? (
            <span className="ui-text-muted">
              {presentation.payrollLabel}: {formatMinutes(presentation.payrollMinutes)}
            </span>
          ) : (
            <span className="ui-text-muted">Temps compté pour la paie</span>
          )}
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
          <span className="ui-eyebrow">Exceptions du quart en cours</span>
          <strong>{snapshot?.pendingExceptions.length ?? 0}</strong>
          <span className="ui-text-muted">
            Ce nombre ne comprend pas l&apos;historique déjà traité.
          </span>
        </AppCard>
      </div>

      <AppCard tone="elevated" className="ui-stack-md employe-dashboard-punch-primary">
        <div className="employe-dashboard-punch-primary-head">
          <div className="ui-stack-xs">
            <span className="ui-eyebrow">Action principale</span>
            <h3>Horodateur / Pointage</h3>
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
              Anomalies: {snapshot?.shift?.anomalies_count ?? 0}
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

        <p className="ui-text-muted" style={{ margin: 0 }}>
          {guidance.guidance}
        </p>
        {guidance.serviceSinceLabel ? (
          <p style={{ margin: 0, fontWeight: 700 }}>{guidance.serviceSinceLabel}</p>
        ) : null}
        {guidance.arrivalBlocked ? (
          <p className="ui-text-muted" style={{ margin: 0 }}>
            {guidance.arrivalBlockedMessage}
          </p>
        ) : null}

        <div className="employe-dashboard-punch-actions">
          {guidance.primary?.eventType ? (
            <PrimaryButton
              onClick={() => void submitPunch(guidance.primary?.eventType ?? "")}
              disabled={submitting || geolocationPending}
              className="employe-dashboard-punch-actions-primary"
            >
              <span>
                {geolocationPending ? "Localisation en cours…" : guidance.primary.label}
              </span>
              <Clock3 size={16} aria-hidden />
            </PrimaryButton>
          ) : null}

          {guidance.secondary.map((action) => (
            <SecondaryButton
              key={action.eventType}
              onClick={() => {
                if (action.eventType) void submitPunch(action.eventType);
              }}
              disabled={submitting || geolocationPending}
            >
              <span>{action.label}</span>
            </SecondaryButton>
          ))}

          <SecondaryButton
            onClick={() => {
              setForgottenError(null);
              setForgottenOpen(true);
            }}
            disabled={submitting}
          >
            <span>Ajouter une heure d&apos;arrivée oubliée</span>
          </SecondaryButton>
        </div>

        {snapshot?.pendingExceptions.length ? (
          <div className="ui-stack-sm">
            <span className="ui-eyebrow">Exceptions du quart en cours</span>
            <div className="employe-dashboard-punch-exceptions">
              {snapshot.pendingExceptions.slice(0, 3).map((item) => (
                <AppCard key={item.id} tone="muted" className="ui-stack-xs">
                  <EmployeeExceptionExplanation
                    exceptionType={item.exception_type}
                    reasonLabel={item.reason_label}
                    status={item.status}
                    details={item.details}
                    scope="current_shift"
                  />
                </AppCard>
              ))}
            </div>
          </div>
        ) : (
          <p className="ui-text-muted" style={{ margin: 0 }}>
            Aucune exception en attente sur ce quart.
          </p>
        )}
      </AppCard>
      <ForgottenArrivalDialog
        open={forgottenOpen}
        shiftOpen={onDuty}
        submitting={submitting}
        submitError={forgottenError}
        onClose={() => setForgottenOpen(false)}
        onSubmit={(input) => {
          void submitForgottenArrival(input).then((result) => {
            if (!result.ok) {
              setForgottenError(result.message);
              return;
            }
            setForgottenOpen(false);
          });
        }}
      />
    </div>
  );
}
