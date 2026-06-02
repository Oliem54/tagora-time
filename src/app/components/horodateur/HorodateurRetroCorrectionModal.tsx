"use client";

import {
  STAFF_RETRO_FORGOTTEN_EVENT_TYPES,
  type StaffRetroForgottenEventType,
} from "@/app/lib/horodateur-retro-correction.shared";

export type HorodateurRetroCorrectionModalProps = {
  open: boolean;
  saving: boolean;
  submitError?: string | null;
  employees: Array<{ id: number; label: string }>;
  employeeId: string;
  workDate: string;
  eventType: StaffRetroForgottenEventType;
  time: string;
  reason: string;
  title?: string;
  onClose: () => void;
  onEmployeeIdChange: (value: string) => void;
  onWorkDateChange: (value: string) => void;
  onEventTypeChange: (value: StaffRetroForgottenEventType) => void;
  onTimeChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
};

export default function HorodateurRetroCorrectionModal({
  open,
  saving,
  submitError,
  employees,
  employeeId,
  workDate,
  eventType,
  time,
  reason,
  title = "Corriger un oubli de punch",
  onClose,
  onEmployeeIdChange,
  onWorkDateChange,
  onEventTypeChange,
  onTimeChange,
  onReasonChange,
  onSubmit,
}: HorodateurRetroCorrectionModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="retro-correction-modal-title"
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
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div
        className="tagora-panel"
        style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="retro-correction-modal-title" className="section-title" style={{ marginBottom: 12 }}>
          {title}
        </h2>
        <p className="tagora-note" style={{ marginTop: 0, marginBottom: 16 }}>
          La demande sera envoyée en attente d&apos;approbation admin. Les heures ne seront
          comptabilisées qu&apos;après validation.
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

        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Type d&apos;oubli</span>
          <select
            className="tagora-input"
            value={eventType}
            onChange={(event) =>
              onEventTypeChange(event.target.value as StaffRetroForgottenEventType)
            }
            style={{ minHeight: 48, fontSize: 16 }}
          >
            {STAFF_RETRO_FORGOTTEN_EVENT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Heure demandée</span>
          <input
            className="tagora-input"
            type="time"
            value={time}
            onChange={(event) => onTimeChange(event.target.value)}
            style={{ minHeight: 48, fontSize: 16 }}
          />
        </label>

        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Raison (obligatoire)</span>
          <textarea
            className="tagora-textarea"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Ex. oubli de pointer, problème GPS, intervention terrain..."
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
            {saving ? "Envoi en cours..." : "Envoyer la demande"}
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
