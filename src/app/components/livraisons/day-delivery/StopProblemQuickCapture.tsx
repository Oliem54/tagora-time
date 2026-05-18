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
  onConfirm: (description: string) => Promise<{ ok: boolean; message?: string }>;
  onSaved?: () => void;
};

export default function StopProblemQuickCapture({
  open,
  onClose,
  sourceId,
  moduleSource,
  clientLabel,
  onConfirm,
  onSaved,
}: Props) {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setFeedback("");
    setSaving(false);
  }, [open]);

  const handleConfirm = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      setFeedback("Decrivez le probleme rencontre.");
      return;
    }
    setSaving(true);
    setFeedback("");
    const result = await onConfirm(trimmed);
    if (!result.ok) {
      setSaving(false);
      setFeedback(result.message || "Impossible d enregistrer le probleme.");
      return;
    }
    await saveOperationProofNote({
      moduleSource,
      sourceId,
      note: `Probleme terrain: ${trimmed}`,
      categorie: moduleSource === "ramassage" ? "preuve_ramassage" : "preuve_livraison",
    });
    setSaving(false);
    setFeedback("Probleme signale.");
    onSaved?.();
    window.setTimeout(() => onClose(), 500);
  };

  if (!open) return null;

  return (
    <div className="day-delivery-signature-sheet day-delivery-problem-sheet" role="dialog" aria-modal="true">
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
            <strong>Signaler un probleme</strong>
            <span className="ui-text-muted">{clientLabel}</span>
          </div>
          <button type="button" className="tagora-dark-outline-action" onClick={onClose} disabled={saving}>
            Fermer
          </button>
        </div>
        <label className="tagora-field" style={{ margin: 0 }}>
          <span className="tagora-label">Description</span>
          <textarea
            className="tagora-textarea"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: client absent, adresse incorrecte, item manquant..."
          />
        </label>
        {feedback ? <p className="day-delivery-signature-sheet__feedback">{feedback}</p> : null}
        <div className="day-delivery-signature-sheet__actions">
          <button
            type="button"
            className="tagora-dark-action day-ramassage-mobile-bar__btn--danger"
            style={{ width: "100%" }}
            disabled={saving || !description.trim()}
            onClick={() => void handleConfirm()}
          >
            {saving ? "Enregistrement..." : "Confirmer le probleme"}
          </button>
        </div>
      </div>
    </div>
  );
}