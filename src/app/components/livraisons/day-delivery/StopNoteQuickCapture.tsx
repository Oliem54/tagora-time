"use client";

import { useEffect, useState } from "react";
import {
  saveOperationProofNote,
  type OperationProofModuleSource,
} from "@/app/components/livraisons/day-delivery/upload-operation-proof.client";

type Props = {
  open: boolean;
  onClose: () => void;
  sourceId: number;
  moduleSource: OperationProofModuleSource;
  clientLabel: string;
  onSaved?: () => void;
};

export default function StopNoteQuickCapture({
  open,
  onClose,
  sourceId,
  moduleSource,
  clientLabel,
  onSaved,
}: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!open) return;
    setNote("");
    setFeedback("");
    setSaving(false);
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setFeedback("");
    const result = await saveOperationProofNote({
      moduleSource,
      sourceId,
      note,
    });
    setSaving(false);
    if (!result.ok) {
      setFeedback(result.message);
      return;
    }
    setFeedback("Note enregistree.");
    onSaved?.();
    window.setTimeout(() => onClose(), 500);
  };

  if (!open) return null;

  return (
    <div className="day-delivery-signature-sheet day-delivery-note-sheet" role="dialog" aria-modal="true">
      <button
        type="button"
        className="day-delivery-signature-sheet__backdrop"
        aria-label="Fermer"
        onClick={onClose}
        disabled={saving}
      />
      <div className="day-delivery-signature-sheet__panel">
        <div className="day-delivery-signature-sheet__head">
          <div>
            <strong>Note terrain</strong>
            <span className="ui-text-muted">{clientLabel}</span>
          </div>
          <button type="button" className="tagora-dark-outline-action" onClick={onClose} disabled={saving}>
            Fermer
          </button>
        </div>
        <label className="tagora-field" style={{ margin: 0 }}>
          <span className="tagora-label">Note</span>
          <textarea
            className="tagora-textarea"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ex.: client absent, acces bloque, item endommage..."
          />
        </label>
        {feedback ? <p className="day-delivery-signature-sheet__feedback">{feedback}</p> : null}
        <div className="day-delivery-signature-sheet__actions">
          <button
            type="button"
            className="tagora-dark-action"
            disabled={saving || !note.trim()}
            onClick={() => void handleSave()}
          >
            {saving ? "Enregistrement..." : "Enregistrer la note"}
          </button>
        </div>
      </div>
    </div>
  );
}