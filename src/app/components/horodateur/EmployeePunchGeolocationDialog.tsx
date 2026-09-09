"use client";

import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import {
  PUNCH_GEOLOCATION_HELP_STEPS,
  PUNCH_GEOLOCATION_HELP_TITLE,
  PUNCH_GEOLOCATION_OPEN_SETTINGS_LABEL,
  PUNCH_GEOLOCATION_RETRY_LABEL,
  openEmployeePunchGeolocationSettings,
  primaryRecoveryActionForPunchGeolocationFailure,
  titleForPunchGeolocationFailure,
  type EmployeePunchGeolocationFailureCode,
} from "@/app/lib/employee-punch-geolocation.client";

export type EmployeePunchGeolocationDialogProps = {
  code: EmployeePunchGeolocationFailureCode;
  message: string;
  busy?: boolean;
  onRetry: () => void;
};

export default function EmployeePunchGeolocationDialog({
  code,
  message,
  busy = false,
  onRetry,
}: EmployeePunchGeolocationDialogProps) {
  const primary = primaryRecoveryActionForPunchGeolocationFailure(code);
  const title = titleForPunchGeolocationFailure(code);

  return (
    <AppCard
      tone="elevated"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-punch-geo-title"
      className="employee-punch-geolocation-dialog"
    >
      <div className="ui-stack-sm">
        <span className="ui-eyebrow">Localisation requise</span>
        <h3 id="employee-punch-geo-title" style={{ margin: 0 }}>
          {title}
        </h3>
        <p style={{ margin: 0, lineHeight: 1.55 }}>{message}</p>
        <details open>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            {PUNCH_GEOLOCATION_HELP_TITLE}
          </summary>
          <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>
            {PUNCH_GEOLOCATION_HELP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </details>
        <div
          className="employee-punch-geolocation-dialog-actions"
          style={{ display: "grid", gap: 10 }}
        >
          {primary === "settings" ? (
            <>
              <PrimaryButton
                onClick={() => openEmployeePunchGeolocationSettings()}
                disabled={busy}
              >
                {PUNCH_GEOLOCATION_OPEN_SETTINGS_LABEL}
              </PrimaryButton>
              <SecondaryButton onClick={onRetry} disabled={busy}>
                {busy ? "Localisation en cours..." : PUNCH_GEOLOCATION_RETRY_LABEL}
              </SecondaryButton>
            </>
          ) : (
            <>
              <PrimaryButton onClick={onRetry} disabled={busy}>
                {busy ? "Localisation en cours..." : PUNCH_GEOLOCATION_RETRY_LABEL}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => openEmployeePunchGeolocationSettings()}
                disabled={busy}
              >
                {PUNCH_GEOLOCATION_OPEN_SETTINGS_LABEL}
              </SecondaryButton>
            </>
          )}
        </div>
      </div>
    </AppCard>
  );
}
