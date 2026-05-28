"use client";

type PastShiftDirectionModalProps = {
  open: boolean;
  saving: boolean;
  submitError?: string | null;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  note: string;
  employees: Array<{ id: number; label: string }>;
  onClose: () => void;
  onEmployeeIdChange: (value: string) => void;
  onWorkDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onBreakMinutesChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
};

export default function PastShiftDirectionModal({
  open,
  saving,
  submitError,
  employeeId,
  workDate,
  startTime,
  endTime,
  breakMinutes,
  note,
  employees,
  onClose,
  onEmployeeIdChange,
  onWorkDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onBreakMinutesChange,
  onNoteChange,
  onSubmit,
}: PastShiftDirectionModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="past-shift-direction-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
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
      <div
        className="tagora-panel"
        style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="past-shift-direction-title" className="section-title" style={{ marginBottom: 12 }}>
          Ajouter des heures passées
        </h2>
        <p className="tagora-note" style={{ marginTop: 0, marginBottom: 16 }}>
          Crée un quart complet (entrée, sortie et pause si applicable) pour la date choisie. Les
          heures sont enregistrées immédiatement comme action direction.
        </p>

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
          <span className="tagora-label">Employé</span>
          <select
            className="tagora-input"
            value={employeeId}
            onChange={(event) => onEmployeeIdChange(event.target.value)}
            style={{ minHeight: 48, fontSize: 16 }}
          >
            <option value="">Sélectionner</option>
            {employees.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

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

        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Commentaire (obligatoire)</span>
          <textarea
            className="tagora-textarea"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Ex. oubli de pointer, validation terrain, correction paie..."
            rows={4}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            className="tagora-dark-action"
            style={{ width: "100%", minHeight: 48 }}
            disabled={saving}
            onClick={onSubmit}
          >
            {saving ? "Enregistrement..." : "Enregistrer le quart passé"}
          </button>
          <button
            type="button"
            className="tagora-dark-outline-action"
            style={{ width: "100%", minHeight: 44 }}
            onClick={onClose}
            disabled={saving}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
