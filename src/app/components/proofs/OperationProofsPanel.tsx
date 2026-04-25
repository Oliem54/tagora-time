"use client";

import { type ChangeEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabase/client";
import FormField from "@/app/components/ui/FormField";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";

export type ModuleSource =
  | "dossier"
  | "livraison"
  | "ramassage"
  | "service_case"
  | "helpdesk_ticket"
  | "delivery_incident";

type ProofType = "document" | "voice" | "signature" | "note";

type OperationProofRow = {
  id: string;
  module_source: ModuleSource;
  source_id: string;
  type_preuve: ProofType;
  categorie: string | null;
  nom: string;
  date_heure: string;
  cree_par: string | null;
  url_fichier: string;
  mime_type: string | null;
  taille: number | null;
  commentaire: string | null;
  statut: string | null;
};

type Props = {
  moduleSource: ModuleSource;
  sourceId: string | number;
  categorieParDefaut: string;
  titre?: string;
  commentairePlaceholder?: string;
};

function formatProofDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("fr-CA");
}

function buildStoragePrefix(moduleSource: ModuleSource, sourceId: string) {
  return `operation-proofs/${moduleSource}/${sourceId}`;
}

export default function OperationProofsPanel({
  moduleSource,
  sourceId,
  categorieParDefaut,
  titre = "Preuves",
  commentairePlaceholder = "Commentaire optionnel",
}: Props) {
  const sourceIdText = String(sourceId);
  const [proofs, setProofs] = useState<OperationProofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [recordingSupported, setRecordingSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";
  const hasGetUserMedia =
    hasNavigator && typeof navigator.mediaDevices?.getUserMedia === "function";
  const hasMediaRecorder =
    hasWindow && typeof window.MediaRecorder !== "undefined";
  const secureContext = hasWindow ? window.isSecureContext : false;

  const hasVoiceProof = useMemo(
    () => proofs.some((proof) => proof.type_preuve === "voice"),
    [proofs]
  );
  const hasSignatureProof = useMemo(
    () => proofs.some((proof) => proof.type_preuve === "signature"),
    [proofs]
  );

  const loadProofs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("operation_proofs")
      .select("*")
      .eq("module_source", moduleSource)
      .eq("source_id", sourceIdText)
      .order("date_heure", { ascending: false });

    if (error) {
      setProofs([]);
      setFeedback("Impossible de charger les preuves.");
    } else {
      setProofs((data ?? []) as OperationProofRow[]);
      setFeedback("");
    }
    setLoading(false);
  }, [moduleSource, sourceIdText]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProofs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProofs]);

  useEffect(() => {
    const supportTimer = window.setTimeout(() => {
      setRecordingSupported(
        typeof window !== "undefined"
        && typeof navigator !== "undefined"
        && typeof navigator.mediaDevices?.getUserMedia === "function"
        && typeof window.MediaRecorder !== "undefined"
      );
    }, 0);
    return () => window.clearTimeout(supportTimer);
  }, []);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
    };
  }, [audioPreviewUrl]);

  const uploadProof = useCallback(async (
    file: File,
    typePreuve: ProofType
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setFeedback("Session invalide. Reconnecte-toi.");
      return;
    }

    setUploading(true);
    setFeedback("");
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const storageName = `${typePreuve}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = `${buildStoragePrefix(moduleSource, sourceIdText)}/${storageName}`;

    const { error: uploadError } = await supabase.storage
      .from("photos-dossiers")
      .upload(storagePath, file);

    if (uploadError) {
      setFeedback("Echec upload du fichier.");
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("photos-dossiers")
      .getPublicUrl(storagePath);

    const { error: insertError } = await supabase.from("operation_proofs").insert({
      module_source: moduleSource,
      source_id: sourceIdText,
      type_preuve: typePreuve,
      categorie: categorieParDefaut,
      nom: file.name || storageName,
      date_heure: new Date().toISOString(),
      cree_par: user.id,
      url_fichier: publicUrlData.publicUrl,
      mime_type: file.type || null,
      taille: Number.isFinite(file.size) ? file.size : null,
      commentaire: commentaire.trim() || null,
      statut: "captured",
    });

    if (insertError) {
      setFeedback("Upload fait mais enregistrement impossible.");
      setUploading(false);
      return;
    }

    setCommentaire("");
    setUploading(false);
    await loadProofs();
  }, [categorieParDefaut, commentaire, loadProofs, moduleSource, sourceIdText]);

  const saveTextNote = useCallback(async () => {
    const note = commentaire.trim();
    if (!note) {
      setFeedback("Ecris une note avant d'enregistrer.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setFeedback("Session invalide. Reconnecte-toi.");
      return;
    }

    setUploading(true);
    const { error } = await supabase.from("operation_proofs").insert({
      module_source: moduleSource,
      source_id: sourceIdText,
      type_preuve: "note",
      categorie: categorieParDefaut,
      nom: `note-${new Date().toISOString()}`,
      date_heure: new Date().toISOString(),
      cree_par: user.id,
      url_fichier: "",
      mime_type: "text/plain",
      taille: note.length,
      commentaire: note,
      statut: "captured",
    });
    setUploading(false);
    if (error) {
      setFeedback("Impossible d'enregistrer la note.");
      return;
    }
    setCommentaire("");
    setFeedback("Note enregistree.");
    await loadProofs();
  }, [categorieParDefaut, commentaire, loadProofs, moduleSource, sourceIdText]);

  const handleDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadProof(file, "document");
    event.target.value = "";
  };

  const startVoiceRecording = async () => {
    console.log("CLICK startVoiceRecording");
    setFeedback("CLICK startVoiceRecording");
    console.log("[OperationProofsPanel] startVoiceRecording", {
      recordingSupported,
      isSecureContext: secureContext,
      hasGetUserMedia,
      hasMediaRecorder,
    });
    setFeedback("Tentative ouverture micro...");

    if (!recordingSupported) {
      setFeedback("Micro non supporte ou navigateur incompatible.");
      return;
    }
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) {
          audioChunksRef.current.push(evt.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setFeedback("Enregistrement demarre.");
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const errorName = error instanceof Error ? error.name.toLowerCase() : "";
      if (
        message.includes("requested device not found")
        || message.includes("notfounderror")
        || errorName.includes("notfounderror")
      ) {
        setFeedback("Aucun micro detecte sur cet appareil ou navigateur.");
        return;
      }
      if (message.includes("permission") || message.includes("denied") || message.includes("notallowed")) {
        setFeedback("Permission micro refusee. Autorise le micro puis reessaie.");
        return;
      }
      setFeedback("Micro indisponible ou navigateur incompatible.");
    }
  };

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
    setIsRecording(false);
  };

  const resetVoiceRecording = () => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    setAudioBlob(null);
  };

  const saveVoiceRecording = async () => {
    if (!audioBlob) return;
    const file = new File([audioBlob], `vocal-${Date.now()}.webm`, {
      type: audioBlob.type || "audio/webm",
    });
    await uploadProof(file, "voice");
    resetVoiceRecording();
  };

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPoint(event);
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const moveSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
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
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    isDrawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const saveSignature = async () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !hasSignature) return;
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
    await uploadProof(file, "signature");
    clearSignature();
  };

  const renderProofPreview = (proof: OperationProofRow) => {
    if (proof.type_preuve === "note") {
      return <div className="ui-text-muted">{proof.commentaire || "-"}</div>;
    }
    if (proof.type_preuve === "voice") {
      return <audio controls src={proof.url_fichier} style={{ width: "100%" }} />;
    }
    if (proof.mime_type?.startsWith("image/")) {
      return (
        <img
          src={proof.url_fichier}
          alt={proof.nom}
          style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 10 }}
        />
      );
    }
    return (
      <a
        href={proof.url_fichier}
        target="_blank"
        rel="noreferrer"
        className="tagora-dark-outline-action"
        style={{ textDecoration: "none", textAlign: "center", padding: "10px 12px", borderRadius: 10 }}
      >
        Ouvrir / telecharger
      </a>
    );
  };

  return (
    <div className="ui-stack-md">
      <AppCard className="ui-stack-sm">
        <div className="ui-eyebrow">{titre}</div>
        <FormField label="Commentaire optionnel">
          <input
            type="text"
            value={commentaire}
            onChange={(event) => setCommentaire(event.target.value)}
            placeholder={commentairePlaceholder}
            className="tagora-input"
          />
        </FormField>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PrimaryButton type="button" onClick={saveTextNote} disabled={uploading}>
            Enregistrer une note
          </PrimaryButton>
        </div>
        <FormField label="1) Ajouter un document">
          <input
            type="file"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleDocument}
            className="tagora-input"
          />
        </FormField>
        <AppCard tone="muted" className="ui-stack-sm">
          <div className="ui-eyebrow">2) Enregistrer un vocal</div>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              position: "relative",
              zIndex: 20,
              pointerEvents: "auto",
              touchAction: "manipulation",
              border: "2px solid red",
              background: "#fff8f8",
              padding: 8,
              borderRadius: 10,
            }}
          >
            <button
              type="button"
              onPointerDown={() => setFeedback("POINTERDOWN start")}
              onPointerUp={(event) => {
                event.preventDefault();
                void startVoiceRecording();
              }}
              disabled={!recordingSupported || isRecording || uploading}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                pointerEvents: "auto",
                position: "relative",
                zIndex: 30,
                minHeight: 48,
                padding: "12px 16px",
                border: "1px solid #94a3b8",
                background: "#e2e8f0",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Demarrer
            </button>
            <SecondaryButton type="button" onClick={stopVoiceRecording} disabled={!isRecording}>
              Arreter
            </SecondaryButton>
            <SecondaryButton type="button" onClick={resetVoiceRecording} disabled={!audioBlob}>
              Recommencer
            </SecondaryButton>
            <PrimaryButton type="button" onClick={saveVoiceRecording} disabled={!audioBlob || uploading}>
              Confirmer
            </PrimaryButton>
          </div>
          {audioPreviewUrl ? <audio controls src={audioPreviewUrl} style={{ width: "100%" }} /> : null}
          {!recordingSupported ? (
            <div className="ui-text-muted">Micro non supporte sur ce navigateur.</div>
          ) : null}
        </AppCard>
        <AppCard tone="muted" className="ui-stack-sm">
          <div className="ui-eyebrow">3) Signature client</div>
          <canvas
            ref={signatureCanvasRef}
            width={760}
            height={220}
            onPointerDown={startSignature}
            onPointerMove={moveSignature}
            onPointerUp={endSignature}
            onPointerLeave={endSignature}
            style={{
              width: "100%",
              maxWidth: "100%",
              height: 220,
              border: "1px solid #cbd5e1",
              borderRadius: 12,
              background: "#fff",
              touchAction: "none",
            }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SecondaryButton type="button" onClick={clearSignature}>
              Effacer
            </SecondaryButton>
            <PrimaryButton type="button" onClick={saveSignature} disabled={!hasSignature || uploading}>
              Confirmer
            </PrimaryButton>
          </div>
        </AppCard>
        <div className="ui-text-muted">
          Vocal: {hasVoiceProof ? "Oui" : "Non"} • Signature: {hasSignatureProof ? "Oui" : "Non"}
        </div>
        {feedback ? <div className="ui-text-muted">{feedback}</div> : null}
      </AppCard>

      <AppCard className="ui-stack-sm">
        <div className="ui-eyebrow">Preuves existantes</div>
        {loading ? (
          <div className="ui-text-muted">Chargement...</div>
        ) : proofs.length === 0 ? (
          <div className="ui-text-muted">Aucune preuve.</div>
        ) : (
          <div className="ui-stack-sm">
            {proofs.map((proof) => (
              <AppCard key={proof.id} tone="muted" className="ui-stack-xs">
                <div className="ui-eyebrow">
                  {proof.type_preuve} • {proof.categorie || "-"}
                </div>
                <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{proof.nom}</div>
                <div className="ui-text-muted">{formatProofDate(proof.date_heure)}</div>
                {renderProofPreview(proof)}
              </AppCard>
            ))}
          </div>
        )}
      </AppCard>
    </div>
  );
}
