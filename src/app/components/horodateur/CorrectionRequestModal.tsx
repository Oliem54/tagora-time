"use client";

export type CorrectionRequestType = "entry" | "past_shift" | "other";

type CorrectionRequestModalProps = {
  open: boolean;
  saving: boolean;
  submitError?: string | null;
  gpsWarning?: string | null;
  correctionType: CorrectionRequestType;
  time: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  reason: string;
  scheduledStartLabel: string | null;
  onClose: () => void;
  onCorrectionTypeChange: (value: CorrectionRequestType) => void;
  onTimeChange: (value: string) => void;
  onWorkDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onBreakMinutesChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onApplyShortcut: (minutesAgo: number) => void;
  onApplyScheduledStart: () => void;
  onSubmit: () => void;
};

export default function CorrectionRequestModal({
  open,
  saving,
  submitError,
  gpsWarning,
  correctionType,
  time,
  workDate,
  startTime,
  endTime,
  breakMinutes,
  reason,
  scheduledStartLabel,
  onClose,
  onCorrectionTypeChange,
  onTimeChange,
  onWorkDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onBreakMinutesChange,
  onReasonChange,
  onApplyShortcut,
  onApplyScheduledStart,
  onSubmit,
}: CorrectionRequestModalProps) {
  if (!open) {
    return null;
  }

  const hasScheduledStart =
    scheduledStartLabel != null &&
    /^\d{1,2}:\d{2}$/.test(scheduledStartLabel.slice(0, 5));
  const otherBlocked = correctionType === "other";
  const pastShiftMode = correctionType === "past_shift";
  const entryMode = correctionType === "entry";

  return (
    <CorrectionModalBackdrop onClose={onClose}>
      <div
        className="tagora-panel"
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflow: "auto",
          marginBottom: 0,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="correction-modal-title" className="section-title" style={{ marginBottom: 12 }}>
          {pastShiftMode ? "Heures passées non enregistrées" : "Demande de correction"}
        </h2>
        <p className="tagora-note" style={{ marginTop: 0, marginBottom: 16 }}>
          {pastShiftMode
            ? "Indiquez le quart complet oublié (début, fin et pause si applicable). Nous tentons d'enregistrer votre position ; si le GPS est indisponible, la demande part quand même pour approbation."
            : "Nous tentons d'enregistrer votre position avec la demande, même si elle est hors zone GPS. Si la localisation est indisponible, la demande peut quand même être envoyée sans position. La direction devra approuver avant comptabilisation."}
        </p>

        {gpsWarning ? (
          <div
            className="tagora-panel-muted"
            style={{
              marginBottom: 16,
              padding: 14,
              borderColor: "rgba(245, 158, 11, 0.55)",
            }}
            role="status"
          >
            <p style={{ margin: 0, lineHeight: 1.55, color: "#0f172a" }}>{gpsWarning}</p>
          </div>
        ) : null}

        {submitError ? (
          <div
            className="tagora-panel-muted"
            style={{
              marginBottom: 16,
              padding: 14,
              borderColor: "rgba(239, 68, 68, 0.45)",
            }}
            role="alert"
          >
            <p style={{ margin: 0, lineHeight: 1.55, color: "#0f172a" }}>{submitError}</p>
          </div>
        ) : null}

        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Type de demande</span>
          <select
            className="tagora-input"
            value={correctionType}
            onChange={(event) =>
              onCorrectionTypeChange(event.target.value as CorrectionRequestType)
            }
            style={{ minHeight: 48, fontSize: 16 }}
          >
            <option value="past_shift">Heures passées non enregistrées</option>
            <option value="entry">Corriger mon heure d&apos;entree seulement</option>
            <option value="other">Autre correction a signaler</option>
          </select>
        </label>

        {otherBlocked ? (
          <div
            className="tagora-panel-muted"
            style={{ marginBottom: 16, padding: 14, borderColor: "rgba(245,158,11,0.45)" }}
          >
            <p className="tagora-note" style={{ margin: 0, lineHeight: 1.55 }}>
              Cette option n&apos;est pas encore disponible dans l&apos;application. Utilisez «
              Heures passées non enregistrées » pour un quart oublié, ou « Corriger mon heure
              d&apos;entree » pour une seule heure.
            </p>
          </div>
        ) : null}

        {pastShiftMode ? (
          <>
            <label className="tagora-field" style={{ marginBottom: 16 }}>
              <span className="tagora-label">Date de travail</span>
              <input
                className="tagora-input"
                type="date"
                value={workDate}
                onChange={(event) => onWorkDateChange(event.target.value)}
                style={{ minHeight: 48, fontSize: 16 }}
              />
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <label className="tagora-field">
                <span className="tagora-label">Heure début</span>
                <input
                  className="tagora-input"
                  type="time"
                  value={startTime}
                  onChange={(event) => onStartTimeChange(event.target.value)}
                  style={{ minHeight: 48, fontSize: 16 }}
                />
              </label>
              <label className="tagora-field">
                <span className="tagora-label">Heure fin</span>
                <input
                  className="tagora-input"
                  type="time"
                  value={endTime}
                  onChange={(event) => onEndTimeChange(event.target.value)}
                  style={{ minHeight: 48, fontSize: 16 }}
                />
              </label>
            </div>
            <label className="tagora-field" style={{ marginBottom: 16 }}>
              <span className="tagora-label">Pause (minutes, 0 = aucune)</span>
              <select
                className="tagora-input"
                value={breakMinutes}
                onChange={(event) => onBreakMinutesChange(event.target.value)}
                style={{ minHeight: 48, fontSize: 16 }}
              >
                <option value="0">Aucune</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </label>
          </>
        ) : null}

        {entryMode ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <button
                type="button"
                className="tagora-dark-outline-action"
                style={{ minHeight: 44, fontSize: 14 }}
                disabled={saving}
                onClick={() => onApplyShortcut(15)}
              >
                Il y a 15 minutes
              </button>
              <button
                type="button"
                className="tagora-dark-outline-action"
                style={{ minHeight: 44, fontSize: 14 }}
                disabled={saving}
                onClick={() => onApplyShortcut(30)}
              >
                Il y a 30 minutes
              </button>
              <button
                type="button"
                className="tagora-dark-outline-action"
                style={{ minHeight: 44, fontSize: 14 }}
                disabled={saving}
                onClick={() => onApplyShortcut(60)}
              >
                Il y a 1 heure
              </button>
              {hasScheduledStart ? (
                <button
                  type="button"
                  className="tagora-dark-outline-action"
                  style={{ minHeight: 44, fontSize: 14 }}
                  disabled={saving}
                  onClick={onApplyScheduledStart}
                >
                  Heure prevue du jour
                </button>
              ) : null}
            </div>

            <label className="tagora-field" style={{ marginBottom: 16 }}>
              <span className="tagora-label">Heure demandee</span>
              <input
                className="tagora-input"
                type="time"
                value={time}
                onChange={(event) => onTimeChange(event.target.value)}
                style={{ minHeight: 48, fontSize: 16 }}
              />
            </label>
          </>
        ) : null}

        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Raison (obligatoire)</span>
          <textarea
            className="tagora-textarea"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder={
              pastShiftMode
                ? "Ex. oubli de pointer toute la journee, probleme GPS, quart sur chantier..."
                : "Ex. embouteillage, oubli de pointer, heure incorrecte..."
            }
            rows={4}
            disabled={otherBlocked}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            className="tagora-dark-action"
            style={{ width: "100%", minHeight: 48 }}
            disabled={saving || otherBlocked}
            onClick={onSubmit}
          >
            {saving
              ? "Envoi en cours..."
              : pastShiftMode
                ? "Envoyer le quart oublié"
                : "Envoyer a la direction"}
          </button>
          <button
            type="button"
            className="tagora-dark-outline-action"
            style={{ width: "100%", minHeight: 44 }}
            onClick={onClose}
          >
            {saving ? "Annuler l'envoi" : "Annuler"}
          </button>
        </div>
      </div>
    </CorrectionModalBackdrop>
  );
}

function CorrectionModalBackdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.45)",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}
