"use client";

import StatusBadge from "@/app/components/ui/StatusBadge";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import {
  employeePunchStatusTone,
  formatEmployeeDashboardDate,
  formatEmployeeWelcome,
  mapEmployeePunchStatus,
  readSessionFullName,
  resolveEmployeeGivenName,
} from "@/app/lib/employee-punch-status.shared";
import {
  formatElapsedHours,
  isOpenShiftState,
  resolveShiftTimePresentation,
} from "@/app/lib/employee-punch-guidance.shared";
import { useLiveClock } from "@/app/hooks/useLiveClock";
import type { EmployeePunchController } from "@/app/hooks/useEmployeePunchSnapshot";
import type { User } from "@supabase/supabase-js";

type EmployeDashboardWelcomeProps = {
  user: User | null;
  punch: EmployeePunchController;
  onPrimaryAction: (eventType: string | null) => void;
};

export default function EmployeDashboardWelcome({
  user,
  punch,
  onPrimaryAction,
}: EmployeDashboardWelcomeProps) {
  const givenName = resolveEmployeeGivenName({
    employeeFullName: punch.snapshot?.employee.fullName,
    metadataFullName: readSessionFullName(user),
  });
  const status = mapEmployeePunchStatus(punch.currentState, {
    available: punch.enabled,
  });
  const guidance = punch.guidance;
  const onDuty = isOpenShiftState(punch.currentState);
  const now = useLiveClock(onDuty);
  const timeDisplay = punch.snapshot?.todayTimeDisplay;
  const lastEventType = punch.snapshot?.currentState.last_event_type;
  const arrivalAt =
    timeDisplay?.arrivalRecordedAt ??
    punch.snapshot?.currentState.startedAt ??
    (lastEventType === "punch_in" || lastEventType === "quart_debut"
      ? punch.snapshot?.currentState.last_event_at ?? null
      : null);
  const presentation = resolveShiftTimePresentation({
    currentState: punch.currentState,
    officialPayableMinutes:
      timeDisplay?.officialPayableMinutes ?? punch.snapshot?.shift?.payable_minutes ?? 0,
    livePayableMinutes: timeDisplay?.livePayableMinutes ?? 0,
    hasOpenShiftAccrual: Boolean(timeDisplay?.hasOpenShiftAccrual),
    pendingValidation:
      guidance.phase === "quart_en_attente" ||
      Boolean(timeDisplay?.pendingPunchBlocksAccrual) ||
      (punch.snapshot?.pendingExceptions.length ?? 0) > 0 ||
      punch.snapshot?.shift?.status === "en_attente",
    arrivalAt,
    nowIso: now.toISOString(),
    computedAt: timeDisplay?.computedAt ?? null,
  });
  const statusLabel = punch.loading
    ? "Chargement du statut…"
    : guidance.statusLabel || "Chargement…";
  const canAct = punch.enabled && !punch.loading && guidance.primary;
  const primaryDisabled =
    !punch.enabled ||
    punch.submitting ||
    punch.geolocationPending ||
    punch.loading ||
    (guidance.primary?.eventType === "punch_in" && guidance.arrivalBlocked);

  return (
    <section className="employe-dashboard-welcome" aria-labelledby="employe-welcome-heading">
      <div className="employe-dashboard-welcome-copy">
        <p className="employe-dashboard-welcome-kicker">Espace employé</p>
        <h1 id="employe-welcome-heading" className="employe-dashboard-welcome-hello">
          {formatEmployeeWelcome(givenName)}
        </h1>
        <p className="employe-dashboard-welcome-date">
          {formatEmployeeDashboardDate(new Date())}
        </p>
      </div>

      <div className="employe-dashboard-welcome-status">
        <div className="employe-dashboard-welcome-status-row">
          <span className="employe-dashboard-welcome-label">Statut de travail</span>
          <StatusBadge
            label={statusLabel}
            tone={punch.loading ? "default" : employeePunchStatusTone(status)}
          />
        </div>
        {guidance.serviceSinceLabel ? (
          <p className="employe-dashboard-welcome-since">{guidance.serviceSinceLabel}</p>
        ) : null}
        {onDuty ? (
          <div>
            <p className="employe-dashboard-welcome-elapsed">
              {formatElapsedHours(presentation.displayedMinutes)}
            </p>
            <p className="employe-dashboard-welcome-payroll">{presentation.headlineLabel}</p>
            {presentation.showPayrollApart ? (
              <p className="employe-dashboard-welcome-payroll">
                {presentation.payrollLabel} : {formatElapsedHours(presentation.payrollMinutes)}
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="employe-dashboard-welcome-next">{guidance.guidance}</p>
        {canAct && guidance.primary ? (
          <PrimaryButton
            className="employe-dashboard-welcome-action"
            onClick={() => onPrimaryAction(guidance.primary?.eventType ?? null)}
            disabled={primaryDisabled}
          >
            {punch.geolocationPending ? "Localisation en cours…" : guidance.primary.label}
          </PrimaryButton>
        ) : null}
      </div>
    </section>
  );
}
