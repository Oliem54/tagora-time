"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  uploadOperationProofPhoto,
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

export default function StopPhotoQuickCapture({
  open,
  onClose,
  sourceId,
  moduleSource,
  clientLabel,
  onSaved,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState("");

  const resetAndClose = useCallback(() => {
    setFeedback("");
    setUploading(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setFeedback("");
    const timer = window.setTimeout(() => {
      inputRef.current?.click();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  const handlePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      resetAndClose();
      return;
    }

    setUploading(true);
    setFeedback("Envoi de la photo...");
    const result = await uploadOperationProofPhoto({
      moduleSource,
      sourceId,
      file,
      clientLabel,
    });
    setUploading(false);

    if (!result.ok) {
      setFeedback(result.message);
      return;
    }

    setFeedback("Photo enregistree.");
    onSaved?.();
    window.setTimeout(() => resetAndClose(), 600);
  };

  if (!open) return null;

  return (
    <div className="day-delivery-signature-sheet day-delivery-photo-sheet" role="dialog" aria-modal="true">
      <button
        type="button"
        className="day-delivery-signature-sheet__backdrop"
        aria-label="Fermer"
        onClick={resetAndClose}
        disabled={uploading}
      />
      <div className="day-delivery-signature-sheet__panel">
        <div className="day-delivery-signature-sheet__head">
          <div>
            <strong>Photo / preuve</strong>
            <span className="ui-text-muted">{clientLabel}</span>
          </div>
          <button
            type="button"
            className="tagora-dark-outline-action"
            onClick={resetAndClose}
            disabled={uploading}
          >
            Fermer
          </button>
        </div>
        <p className="ui-text-muted" style={{ margin: 0, fontSize: 13 }}>
          Prenez une photo ou choisissez un fichier. Elle sera liee a ce ramassage.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => void handlePick(event)}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="tagora-dark-action"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Envoi..." : "Ouvrir appareil photo / galerie"}
        </button>
        {feedback ? <p className="day-delivery-signature-sheet__feedback">{feedback}</p> : null}
      </div>
    </div>
  );
}
