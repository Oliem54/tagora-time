"use client";

import StatusBadge from "@/app/components/ui/StatusBadge";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import {
  employeePunchNextActionLabel,
  employeePunchStatusLabel,
  employeePunchStatusTone,
  formatEmployeeDashboardDate,
  formatEmployeeWelcome,
  mapEmployeePunchStatus,
  readSessionFullName,
  resolveEmployeeGivenName,
} from "@/app/lib/employee-punch-status.shared";
import type { EmployeePunchController } from "@/app/hooks/useEmployeePunchSnapshot";
import type { User } from "@supabase/supabase-js";

type EmployeDashboardWelcomeProps = {
  user: User | null;
  punch: EmployeePunchController;
  onPrimaryAction: () => void;
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
  const statusLabel = punch.loading
    ? "Chargement du statut…"
    : employeePunchStatusLabel(status);
  const nextAction = punch.loading
    ? "Chargement…"
    : employeePunchNextActionLabel(status);
  const canOpenPunch = punch.enabled;

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
        <p className="employe-dashboard-welcome-next">
          Prochaine action : <strong>{nextAction}</strong>
        </p>
        <PrimaryButton
          className="employe-dashboard-welcome-action"
          onClick={onPrimaryAction}
          disabled={
            !canOpenPunch ||
            punch.submitting ||
            punch.geolocationPending ||
            punch.loading
          }
        >
          {punch.geolocationPending ? "Localisation en cours…" : "Pointer"}
        </PrimaryButton>
      </div>
    </section>
  );
}
