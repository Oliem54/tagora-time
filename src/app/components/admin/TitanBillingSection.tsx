"use client";

type TitanBillingSectionProps = {
  title?: string;
  description?: string;
  enabled: boolean;
  modeTimeclock: boolean;
  modeSorties: boolean;
  hourlyRate: string;
  benefitsPercent: string;
  titanHoursText: string;
  onEnabledChange: (value: boolean) => void;
  onModeTimeclockChange: (value: boolean) => void;
  onModeSortiesChange: (value: boolean) => void;
  onHourlyRateChange: (value: string) => void;
  onBenefitsPercentChange: (value: string) => void;
};

export default function TitanBillingSection({
  title = "Titan",
  description,
  enabled,
  modeTimeclock,
  modeSorties,
  hourlyRate,
  benefitsPercent,
  titanHoursText,
  onEnabledChange,
  onModeTimeclockChange,
  onModeSortiesChange,
  onHourlyRateChange,
  onBenefitsPercentChange,
}: TitanBillingSectionProps) {
  return (
    <section className="tagora-panel ui-stack-md">
      <div className="ui-stack-xs">
        <h2 className="section-title" style={{ marginBottom: 0 }}>{title}</h2>
        {description ? <p className="tagora-note" style={{ margin: 0 }}>{description}</p> : null}
      </div>

      <div className="tagora-form-grid">
        <label className="account-requests-permission-option">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span>Activer Titan</span>
        </label>

        <div />

        <label className="account-requests-permission-option">
          <input
            type="checkbox"
            checked={modeTimeclock}
            onChange={(event) => onModeTimeclockChange(event.target.checked)}
          />
          <span>Mode Horodateur Titan</span>
        </label>

        <label className="account-requests-permission-option">
          <input
            type="checkbox"
            checked={modeSorties}
            onChange={(event) => onModeSortiesChange(event.target.checked)}
          />
          <span>Mode Sorties terrain</span>
        </label>

        <label className="tagora-field">
          <span className="tagora-label">Taux horaire Titan</span>
          <input
            className="tagora-input"
            type="number"
            min="0"
            step="0.01"
            value={hourlyRate}
            onChange={(event) => onHourlyRateChange(event.target.value)}
          />
        </label>

        <label className="tagora-field">
          <span className="tagora-label">% avantages</span>
          <input
            className="tagora-input"
            type="number"
            min="0"
            step="0.01"
            value={benefitsPercent}
            onChange={(event) => onBenefitsPercentChange(event.target.value)}
          />
        </label>

        <div className="tagora-panel-muted" style={{ padding: 18, gridColumn: "1 / -1" }}>
          <div className="tagora-label">Heures Titan calculees</div>
          <div style={{ marginTop: 8, fontWeight: 700, fontSize: 20 }}>{titanHoursText}</div>
        </div>
      </div>
    </section>
  );
}
