"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  uploadOperationProofFile,
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

type VoicePhase = "idle" | "recording" | "review";

const MICRO_BLOCKED_MESSAGE =
  "Micro bloque. Autorisez le micro dans votre navigateur pour enregistrer une preuve vocale.";

export default function StopVoiceQuickCapture({
  open,
  onClose,
  sourceId,
  moduleSource,
  clientLabel,
  onSaved,
}: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [recordingSupported, setRecordingSupported] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState("");

  const clearAudio = useCallback(() => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    setAudioBlob(null);
    setPhase("idle");
  }, [audioPreviewUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecordingSupported(
        typeof window !== "undefined"
          && typeof navigator !== "undefined"
          && typeof navigator.mediaDevices?.getUserMedia === "function"
          && typeof window.MediaRecorder !== "undefined"
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (open) return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
    activeStreamRef.current?.getTracks().forEach((track) => track.stop());
    activeStreamRef.current = null;
    clearAudio();
    setFeedback("");
    setUploading(false);
  }, [clearAudio, open]);

  const startRecording = async () => {
    setFeedback("");
    if (!recordingSupported) {
      setFeedback("Micro non supporte sur ce navigateur.");
      return;
    }
    if (phase === "recording") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        setAudioPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
        setPhase("review");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setPhase("recording");
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const errorName = error instanceof Error ? error.name.toLowerCase() : "";
      if (
        message.includes("permission")
        || message.includes("denied")
        || message.includes("notallowed")
        || errorName.includes("notallowed")
      ) {
        setFeedback(MICRO_BLOCKED_MESSAGE);
        return;
      }
      if (message.includes("not found") || errorName.includes("notfound")) {
        setFeedback("Aucun micro detecte sur cet appareil.");
        return;
      }
      setFeedback(MICRO_BLOCKED_MESSAGE);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
  };

  const handleDelete = () => {
    clearAudio();
    setFeedback("");
  };

  const handleRestart = async () => {
    clearAudio();
    setFeedback("");
    await startRecording();
  };

  const handleSave = async () => {
    if (!audioBlob) return;
    setUploading(true);
    setFeedback("");
    const file = new File([audioBlob], `preuve-vocale-${Date.now()}.webm`, {
      type: audioBlob.type || "audio/webm",
    });
    const categorie =
      moduleSource === "ramassage" ? "preuve_ramassage" : "preuve_livraison";
    const result = await uploadOperationProofFile({
      moduleSource,
      sourceId,
      typePreuve: "voice",
      file,
      categorie,
      commentaire: `Preuve vocale — ${clientLabel}`,
    });
    setUploading(false);
    if (!result.ok) {
      setFeedback(result.message);
      return;
    }
    clearAudio();
    onSaved?.();
  };

  if (!open) return null;

  return (
    <div className="day-delivery-signature-sheet day-delivery-voice-sheet" role="dialog" aria-modal="true">
      <button
        type="button"
        className="day-delivery-signature-sheet__backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="day-delivery-signature-sheet__panel">
        <div className="day-delivery-signature-sheet__head">
          <div>
            <strong>Preuve vocale</strong>
            <span className="ui-text-muted">{clientLabel}</span>
          </div>
          <button type="button" className="tagora-dark-outline-action day-delivery-voice-sheet__close" onClick={onClose}>
            Fermer
          </button>
        </div>

        {phase === "recording" ? (
          <p className="day-delivery-voice-sheet__status" role="status" aria-live="polite">
            Enregistrement en cours
          </p>
        ) : null}

        {phase === "review" && audioPreviewUrl ? (
          <div className="day-delivery-voice-sheet__listen">
            <span className="day-delivery-voice-sheet__listen-label">Ecouter</span>
            <audio controls src={audioPreviewUrl} className="day-delivery-voice-sheet__player" />
          </div>
        ) : null}

        {feedback ? <p className="day-delivery-signature-sheet__feedback">{feedback}</p> : null}

        <div className="day-delivery-voice-sheet__actions">
          {phase === "idle" ? (
            <button
              type="button"
              className="tagora-dark-action day-delivery-voice-sheet__btn"
              onClick={() => void startRecording()}
              disabled={uploading || !recordingSupported}
            >
              Enregistrer
            </button>
          ) : null}

          {phase === "recording" ? (
            <button
              type="button"
              className="tagora-dark-action day-delivery-voice-sheet__btn day-delivery-voice-sheet__btn--stop"
              onClick={stopRecording}
            >
              Arreter
            </button>
          ) : null}

          {phase === "review" ? (
            <>
              <button
                type="button"
                className="tagora-dark-outline-action day-delivery-voice-sheet__btn"
                onClick={handleDelete}
                disabled={uploading}
              >
                Supprimer
              </button>
              <button
                type="button"
                className="tagora-dark-outline-action day-delivery-voice-sheet__btn"
                onClick={() => void handleRestart()}
                disabled={uploading}
              >
                Recommencer
              </button>
              <button
                type="button"
                className="tagora-dark-action day-delivery-voice-sheet__btn"
                onClick={() => void handleSave()}
                disabled={uploading || !audioBlob}
              >
                {uploading ? "Enregistrement..." : "Sauvegarder"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}