"use client";

import { useCallback, useRef, useState, type PointerEvent } from "react";
import type { OperationProofModuleSource } from "@/app/components/livraisons/day-delivery/upload-operation-proof.client";
import { uploadOperationProofViaServer } from "@/app/lib/storage/photos-dossiers-upload.client";

type Props = {
  open: boolean;
  onClose: () => void;
  sourceId: number;
  moduleSource?: OperationProofModuleSource;
  clientLabel: string;
  onSaved?: () => void;
};

export default function StopSignatureQuickCapture({
  open,
  onClose,
  sourceId,
  moduleSource = "livraison",
  clientLabel,
  onSaved,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState("");

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }, []);

  const uploadSignature = useCallback(
    async (file: File) => {
      setUploading(true);
      setFeedback("");

      const result = await uploadOperationProofViaServer({
        moduleSource,
        sourceId,
        typePreuve: "signature",
        file,
        categorie: moduleSource === "ramassage" ? "preuve_ramassage" : "signature_client",
        commentaire: `Signature rapide — ${clientLabel}`,
      });

      setUploading(false);
      if (!result.ok) {
        setFeedback(result.message || "Echec upload de la signature.");
        return;
      }

      clearSignature();
      setFeedback("Signature enregistree.");
      onSaved?.();
    },
    [clearSignature, clientLabel, moduleSource, onSaved, sourceId]
  );

  const startSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPoint(event);
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0f2948";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const moveSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPoint(event);
    event.preventDefault();
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    isDrawingRef.current = false;
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) {
      setFeedback("Signez d abord dans la zone.");
      return;
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/png");
    });
    if (!blob) {
      setFeedback("Impossible de generer la signature.");
      return;
    }
    const file = new File([blob], `signature-${Date.now()}.png`, {
      type: "image/png",
    });
    await uploadSignature(file);
  };

  if (!open) return null;

  return (
    <div className="day-delivery-signature-sheet" role="dialog" aria-modal="true">
      <button
        type="button"
        className="day-delivery-signature-sheet__backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="day-delivery-signature-sheet__panel">
        <div className="day-delivery-signature-sheet__head">
          <div>
            <strong>Signature client</strong>
            <span className="ui-text-muted">{clientLabel}</span>
          </div>
          <button type="button" className="tagora-dark-outline-action" onClick={onClose}>
            Fermer
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={320}
          className="day-delivery-signature-sheet__canvas"
          onPointerDown={startSignature}
          onPointerMove={moveSignature}
          onPointerUp={endSignature}
          onPointerCancel={endSignature}
        />
        {feedback ? <p className="day-delivery-signature-sheet__feedback">{feedback}</p> : null}
        <div className="day-delivery-signature-sheet__actions">
          <button
            type="button"
            className="tagora-dark-outline-action"
            onClick={clearSignature}
            disabled={uploading}
          >
            Effacer
          </button>
          <button
            type="button"
            className="tagora-dark-action"
            onClick={() => void saveSignature()}
            disabled={uploading || !hasSignature}
          >
            {uploading ? "Enregistrement..." : "Enregistrer la signature"}
          </button>
        </div>
      </div>
    </div>
  );
}
