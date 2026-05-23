"use client";

export type CorrectionRequestType = "entry" | "other";

type CorrectionRequestModalProps = {
  open: boolean;
  saving: boolean;
  correctionType: CorrectionRequestType;
  time: string;
  reason: string;
  scheduledStartLabel: string | null;
  onClose: () => void;
  onCorrectionTypeChange: (value: CorrectionRequestType) => void;
  onTimeChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onApplyShortcut: (minutesAgo: number) => void;
  onApplyScheduledStart: () => void;
  onSubmit: () => void;
};

export default function CorrectionRequestModal({
  open,
  saving,
  correctionType,
  time,
  reason,
  scheduledStartLabel,
  onClose,
  onCorrectionTypeChange,
  onTimeChange,
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

  return (
    <CorrectionModalBackdrop saving={saving} onClose={onClose}>
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
          Demande de correction
        </h2>
        <p className="tagora-note" style={{ marginTop: 0, marginBottom: 16 }}>
          Votre position actuelle sera enregistree avec la demande, meme si elle est hors zone GPS.
          La direction devra approuver avant comptabilisation.
        </p>

        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Type de correction</span>
          <select
            className="tagora-input"
            value={correctionType}
            onChange={(event) =>
              onCorrectionTypeChange(event.target.value as CorrectionRequestType)
            }
            style={{ minHeight: 48, fontSize: 16 }}
          >
            <option value="entry">Corriger mon heure d&apos;entree</option>
            <option value="other">Autre correction a signaler</option>
          </select>
        </label>

        {otherBlocked ? (
          <div
            className="tagora-panel-muted"
            style={{ marginBottom: 16, padding: 14, borderColor: "rgba(245,158,11,0.45)" }}
          >
            <p className="tagora-note" style={{ margin: 0, lineHeight: 1.55 }}>
              Cette option n&apos;est pas encore disponible dans l&apos;application. Pour corriger
              votre heure d&apos;entree, choisissez « Corriger mon heure d&apos;entree ». Pour tout
              autre cas (sortie, pause, diner), contactez la direction directement.
            </p>
          </div>
        ) : null}

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
            disabled={saving || otherBlocked}
            onClick={() => onApplyShortcut(15)}
          >
            Il y a 15 minutes
          </button>
          <button
            type="button"
            className="tagora-dark-outline-action"
            style={{ minHeight: 44, fontSize: 14 }}
            disabled={saving || otherBlocked}
            onClick={() => onApplyShortcut(30)}
          >
            Il y a 30 minutes
          </button>
          <button
            type="button"
            className="tagora-dark-outline-action"
            style={{ minHeight: 44, fontSize: 14 }}
            disabled={saving || otherBlocked}
            onClick={() => onApplyShortcut(60)}
          >
            Il y a 1 heure
          </button>
          {hasScheduledStart ? (
            <button
              type="button"
              className="tagora-dark-outline-action"
              style={{ minHeight: 44, fontSize: 14 }}
              disabled={saving || otherBlocked}
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
            disabled={otherBlocked}
            style={{ minHeight: 48, fontSize: 16 }}
          />
        </label>

        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Raison (obligatoire)</span>
          <textarea
            className="tagora-textarea"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Ex. embouteillage, oubli de pointer, heure incorrecte..."
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
            Envoyer a la direction
          </button>
          <button
            type="button"
            className="tagora-dark-outline-action"
            style={{ width: "100%", minHeight: 44 }}
            disabled={saving}
            onClick={onClose}
          >
            Annuler
          </button>
        </div>
      </div>
    </CorrectionModalBackdrop>
  );
}

function CorrectionModalBackdrop({
  saving,
  onClose,
  children,
}: {
  saving: boolean;
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
      onClick={() => {
        if (!saving) {
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}
