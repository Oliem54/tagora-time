"use client";

import type { ReactNode } from "react";
import {
  BellRing,
  Clock3,
  Mail,
  MessageSquare,
  Save,
  ShieldAlert,
  Zap,
} from "lucide-react";
import TagoraIconBadge from "@/app/components/TagoraIconBadge";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import {
  HORODATEUR_ALERT_CONFIG_DELAY_HELP_TEXT,
  HORODATEUR_ALERT_CONFIG_RECOMMENDED_BADGE,
  HORODATEUR_ALERT_CONFIG_RECOMMENDED_SUMMARY,
  isRecommendedReminderDelay,
  resolveMissingPunchEscalationMinutes,
} from "@/app/lib/horodateur-expected-punch-missing.shared";

export type HorodateurDirectionAlertConfigState = {
  email_enabled: boolean;
  sms_enabled: boolean;
  reminder_delay_minutes: number;
  direction_emails: string[];
  direction_sms_numbers: string[];
};

type HorodateurDirectionAlertConfigPanelProps = {
  config: HorodateurDirectionAlertConfigState;
  onConfigChange: (updater: (current: HorodateurDirectionAlertConfigState) => HorodateurDirectionAlertConfigState) => void;
  onSave: () => void;
  saving?: boolean;
  disabled?: boolean;
  invalidEmails?: string[];
  isValidEmail: (value: string) => boolean;
  onUpdateEmailRow: (index: number, value: string) => void;
  onUpdatePhoneRow: (index: number, value: string) => void;
  normalizePhoneNumber: (value: string) => string;
};

function ToggleField({
  label,
  description,
  icon,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  icon: ReactNode;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="horodateur-alert-config-toggle">
      <div className="horodateur-alert-config-toggle-copy">
        <span className="horodateur-alert-config-toggle-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <strong>{label}</strong>
          <p>{description}</p>
        </div>
      </div>
      <select
        className="tagora-input horodateur-alert-config-toggle-select"
        value={value ? "yes" : "no"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === "yes")}
      >
        <option value="yes">Oui</option>
        <option value="no">Non</option>
      </select>
    </label>
  );
}

function EscalationTimeline({ reminderDelayMinutes }: { reminderDelayMinutes: number }) {
  const escalation = resolveMissingPunchEscalationMinutes(reminderDelayMinutes);
  const steps = [
    {
      key: "reminder",
      icon: BellRing,
      tone: "blue" as const,
      title: "Rappel automatique",
      value: `${escalation.reminderMinutes} min`,
    },
    {
      key: "exception",
      icon: ShieldAlert,
      tone: "orange" as const,
      title: "Exception officielle",
      value: `${escalation.exceptionMinutes} min`,
    },
    {
      key: "priority",
      icon: Zap,
      tone: "red" as const,
      title: "Priorité visible",
      value: `${escalation.priorityMinutes} min`,
    },
    {
      key: "manual",
      icon: Clock3,
      tone: "green" as const,
      title: "Correction manuelle",
      value: "Immédiate",
    },
  ];

  return (
    <ol className="horodateur-alert-config-timeline" aria-label="Chronologie des délais">
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <li key={step.key} className="horodateur-alert-config-timeline-item">
            {index < steps.length - 1 ? (
              <span className="horodateur-alert-config-timeline-line" aria-hidden />
            ) : null}
            <TagoraIconBadge tone={step.tone} size="sm" className="horodateur-alert-config-timeline-icon">
              <Icon size={16} strokeWidth={2.1} />
            </TagoraIconBadge>
            <div className="horodateur-alert-config-timeline-copy">
              <span className="horodateur-alert-config-timeline-title">{step.title}</span>
              <strong className="horodateur-alert-config-timeline-value">{step.value}</strong>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function HorodateurDirectionAlertConfigPanel({
  config,
  onConfigChange,
  onSave,
  saving = false,
  disabled = false,
  invalidEmails = [],
  isValidEmail,
  onUpdateEmailRow,
  onUpdatePhoneRow,
  normalizePhoneNumber,
}: HorodateurDirectionAlertConfigPanelProps) {
  const showRecommendedBadge = isRecommendedReminderDelay(config.reminder_delay_minutes);
  const hasSmsNumbers = config.direction_sms_numbers.some((item) => item.trim().length > 0);

  return (
    <section className="horodateur-alert-config-panel">
      <header className="horodateur-alert-config-panel-head">
        <div className="horodateur-alert-config-panel-title-row">
          <TagoraIconBadge tone="cyan" size="lg">
            <BellRing size={24} strokeWidth={2.1} />
          </TagoraIconBadge>
          <div>
            <h2 className="horodateur-alert-config-panel-title">Configuration des alertes</h2>
            <p className="horodateur-alert-config-panel-subtitle">
              Rappels automatiques, exceptions et destinataires direction.
            </p>
          </div>
        </div>
        {showRecommendedBadge ? (
          <span className="horodateur-alert-config-recommended-badge">
            {HORODATEUR_ALERT_CONFIG_RECOMMENDED_BADGE}
          </span>
        ) : null}
      </header>

      <div className="horodateur-alert-config-grid">
        <div className="horodateur-alert-config-group">
          <h3 className="horodateur-alert-config-group-title">Canaux</h3>
          <div className="horodateur-alert-config-group-body">
            <ToggleField
              label="Email direction"
              description="Alertes par courriel aux destinataires configurés."
              icon={<Mail size={18} strokeWidth={2.1} />}
              value={config.email_enabled}
              disabled={disabled}
              onChange={(next) =>
                onConfigChange((current) => ({ ...current, email_enabled: next }))
              }
            />
            <ToggleField
              label="SMS direction"
              description={
                hasSmsNumbers
                  ? "Alertes SMS aux numéros direction listés ci-dessous."
                  : "Ajoutez au moins un numéro SMS pour activer les alertes SMS."
              }
              icon={<MessageSquare size={18} strokeWidth={2.1} />}
              value={config.sms_enabled && hasSmsNumbers}
              disabled={disabled || !hasSmsNumbers}
              onChange={(next) =>
                onConfigChange((current) => ({ ...current, sms_enabled: next }))
              }
            />
          </div>
        </div>

        <div className="horodateur-alert-config-group">
          <h3 className="horodateur-alert-config-group-title">Délai de rappel</h3>
          <div className="horodateur-alert-config-group-body horodateur-alert-config-delay-block">
            <label className="horodateur-alert-config-delay-field">
              <span>Délai de rappel (minutes)</span>
              <input
                className="tagora-input"
                type="number"
                min={5}
                value={config.reminder_delay_minutes}
                disabled={disabled}
                onChange={(event) =>
                  onConfigChange((current) => ({
                    ...current,
                    reminder_delay_minutes: Math.max(5, Number(event.target.value) || 5),
                  }))
                }
              />
            </label>
            <p className="horodateur-alert-config-recommended-summary">
              {HORODATEUR_ALERT_CONFIG_RECOMMENDED_SUMMARY}
            </p>
            <EscalationTimeline reminderDelayMinutes={config.reminder_delay_minutes} />
            <p className="horodateur-alert-config-help">{HORODATEUR_ALERT_CONFIG_DELAY_HELP_TEXT}</p>
          </div>
        </div>
      </div>

      <div className="horodateur-alert-config-recipients">
        <div className="horodateur-alert-config-group">
          <h3 className="horodateur-alert-config-group-title">Courriels direction</h3>
          <p className="horodateur-alert-config-group-hint">Un destinataire par ligne.</p>
          <div className="horodateur-alert-config-recipient-list">
            {(config.direction_emails.length > 0 ? config.direction_emails : [""]).map(
              (value, index) => {
                const trimmedValue = value.trim();
                const isInvalid = trimmedValue.length > 0 && !isValidEmail(trimmedValue);

                return (
                  <div key={`email-${index}`} className="horodateur-alert-config-recipient-row">
                    <div className="horodateur-alert-config-recipient-input">
                      <input
                        className="tagora-input"
                        type="email"
                        value={value}
                        disabled={disabled}
                        onChange={(event) => onUpdateEmailRow(index, event.target.value)}
                        onBlur={() =>
                          onConfigChange((current) => ({
                            ...current,
                            direction_emails: current.direction_emails.map((item, itemIndex) =>
                              itemIndex === index ? item.trim().toLowerCase() : item.trim()
                            ),
                          }))
                        }
                        placeholder="direction@exemple.com"
                        style={
                          isInvalid ? { borderColor: "rgba(220, 38, 38, 0.45)" } : undefined
                        }
                      />
                      {isInvalid ? (
                        <span className="horodateur-alert-config-field-error">Courriel invalide.</span>
                      ) : null}
                    </div>
                    <SecondaryButton
                      onClick={() =>
                        onConfigChange((current) => ({
                          ...current,
                          direction_emails:
                            current.direction_emails.length > 1
                              ? current.direction_emails.filter((_, itemIndex) => itemIndex !== index)
                              : [""],
                        }))
                      }
                      disabled={disabled}
                    >
                      Supprimer
                    </SecondaryButton>
                  </div>
                );
              }
            )}
            <SecondaryButton
              onClick={() =>
                onConfigChange((current) => ({
                  ...current,
                  direction_emails: [...current.direction_emails, ""],
                }))
              }
              disabled={disabled}
            >
              Ajouter un courriel
            </SecondaryButton>
            {invalidEmails.length > 0 ? (
              <span className="horodateur-alert-config-field-error">
                Corrigez les courriels invalides avant la sauvegarde.
              </span>
            ) : null}
          </div>
        </div>

        <div className="horodateur-alert-config-group">
          <h3 className="horodateur-alert-config-group-title">Numéros SMS direction</h3>
          <p className="horodateur-alert-config-group-hint">Un destinataire par ligne.</p>
          <div className="horodateur-alert-config-recipient-list">
            {(config.direction_sms_numbers.length > 0 ? config.direction_sms_numbers : [""]).map(
              (value, index) => (
                <div key={`sms-${index}`} className="horodateur-alert-config-recipient-row">
                  <input
                    className="tagora-input"
                    type="tel"
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onUpdatePhoneRow(index, event.target.value)}
                    onBlur={() =>
                      onConfigChange((current) => ({
                        ...current,
                        direction_sms_numbers: current.direction_sms_numbers.map(
                          (item, itemIndex) =>
                            itemIndex === index ? normalizePhoneNumber(item) : item
                        ),
                      }))
                    }
                    placeholder="+15145550123"
                  />
                  <SecondaryButton
                    onClick={() =>
                      onConfigChange((current) => ({
                        ...current,
                        direction_sms_numbers:
                          current.direction_sms_numbers.length > 1
                            ? current.direction_sms_numbers.filter(
                                (_, itemIndex) => itemIndex !== index
                              )
                            : [""],
                      }))
                    }
                    disabled={disabled}
                  >
                    Supprimer
                  </SecondaryButton>
                </div>
              )
            )}
            <SecondaryButton
              onClick={() =>
                onConfigChange((current) => ({
                  ...current,
                  direction_sms_numbers: [...current.direction_sms_numbers, ""],
                }))
              }
              disabled={disabled}
            >
              Ajouter un numéro
            </SecondaryButton>
          </div>
        </div>
      </div>

      <div className="horodateur-alert-config-actions">
        <PrimaryButton onClick={onSave} disabled={disabled || invalidEmails.length > 0}>
          <span className="horodateur-alert-config-save-label">
            <Save size={16} />
            {saving ? "Enregistrement..." : "Enregistrer la configuration"}
          </span>
        </PrimaryButton>
      </div>
    </section>
  );
}
