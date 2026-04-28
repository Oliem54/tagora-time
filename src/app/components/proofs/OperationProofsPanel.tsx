"use client";

import Image from "next/image";
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

/** Types métier pour les fichiers (colonne `categorie`, `type_preuve` = document). */
export const OPERATION_DOCUMENT_CATEGORIES = [
  "facture",
  "bon_livraison",
  "bon_ramassage",
  "preuve_signee",
  "photo",
  "autre",
] as const;

export type OperationDocumentCategory = (typeof OPERATION_DOCUMENT_CATEGORIES)[number];

const DOCUMENT_CATEGORY_LABELS: Record<OperationDocumentCategory, string> = {
  facture: "Facture",
  bon_livraison: "Bon de livraison",
  bon_ramassage: "Bon de ramassage",
  preuve_signee: "Preuve signée",
  photo: "Photo",
  autre: "Autre document",
};

function documentCategoryLabel(categorie: string | null): string {
  if (!categorie) return "Document";
  if (categorie in DOCUMENT_CATEGORY_LABELS) {
    return DOCUMENT_CATEGORY_LABELS[categorie as OperationDocumentCategory];
  }
  return categorie;
}

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
  compact?: boolean;
};

function formatProofDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("fr-CA");
}

function shortUserRef(id: string | null | undefined) {
  if (!id) return "—";
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
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
  compact = false,
}: Props) {
  const sourceIdText = String(sourceId);
  const showOperationDocuments =
    moduleSource === "livraison" || moduleSource === "ramassage";

  const [proofs, setProofs] = useState<OperationProofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [documentCategory, setDocumentCategory] = useState<OperationDocumentCategory>("autre");
  const [documentNote, setDocumentNote] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const documentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [recordingSupported, setRecordingSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const hasVoiceProof = useMemo(
    () => proofs.some((proof) => proof.type_preuve === "voice"),
    [proofs]
  );
  const hasSignatureProof = useMemo(
    () => proofs.some((proof) => proof.type_preuve === "signature"),
    [proofs]
  );

  const fileDocuments = useMemo(
    () => proofs.filter((p) => p.type_preuve === "document"),
    [proofs]
  );
  const otherProofs = useMemo(
    () => proofs.filter((p) => p.type_preuve !== "document"),
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

  type UploadExtra = {
    categorieOverride?: string;
    commentaireOverride?: string | null;
  };

  const uploadProof = useCallback(
    async (file: File, typePreuve: ProofType, extra?: UploadExtra) => {
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

      const categorieRow =
        extra?.categorieOverride !== undefined ? extra.categorieOverride : categorieParDefaut;

      const commentaireRow =
        extra && Object.prototype.hasOwnProperty.call(extra, "commentaireOverride")
          ? extra.commentaireOverride ?? null
          : commentaire.trim() || null;

      const { error: insertError } = await supabase.from("operation_proofs").insert({
        module_source: moduleSource,
        source_id: sourceIdText,
        type_preuve: typePreuve,
        categorie: categorieRow,
        nom: file.name || storageName,
        date_heure: new Date().toISOString(),
        cree_par: user.id,
        url_fichier: publicUrlData.publicUrl,
        mime_type: file.type || null,
        taille: Number.isFinite(file.size) ? file.size : null,
        commentaire: commentaireRow,
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
    },
    [categorieParDefaut, commentaire, loadProofs, moduleSource, sourceIdText]
  );

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

  const handleLegacyDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadProof(file, "document");
    event.target.value = "";
  };

  const handleDocumentFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setDocumentFile(file ?? null);
  };

  const handleAddOperationDocument = async () => {
    if (!documentFile) {
      setFeedback("Choisissez un fichier à joindre.");
      return;
    }
    setFeedback("");
    await uploadProof(documentFile, "document", {
      categorieOverride: documentCategory,
      commentaireOverride: documentNote.trim() || null,
    });
    setDocumentFile(null);
    setDocumentNote("");
    if (documentFileInputRef.current) {
      documentFileInputRef.current.value = "";
    }
  };

  const startVoiceRecording = async () => {
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
        <Image
          src={proof.url_fichier}
          alt={proof.nom}
          width={640}
          height={280}
          unoptimized
          style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 10 }}
        />
      );
    }
    return (
      <a
        href={proof.url_fichier}
        target="_blank"
        rel="noopener noreferrer"
        className="tagora-dark-outline-action"
        style={{ textDecoration: "none", textAlign: "center", padding: "10px 12px", borderRadius: 10 }}
      >
        Ouvrir / telecharger
      </a>
    );
  };

  const gap = compact ? 8 : 12;

  return (
    <div className={compact ? "ui-stack-sm" : "ui-stack-md"}>
      {showOperationDocuments ? (
        <AppCard
          className={compact ? "ui-stack-xs" : "ui-stack-sm"}
          tone="default"
          style={{
            border: "1px solid rgba(205, 219, 238, 0.95)",
            borderRadius: 14,
            boxShadow: "0 6px 20px rgba(15, 41, 72, 0.06)",
          }}
        >
          <div className="ui-eyebrow" style={{ letterSpacing: "0.12em" }}>
            Documents
          </div>
          <p className="ui-text-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
            Factures, bons, photos et pièces jointes à l&apos;opération. L&apos;ouverture se fait
            toujours dans un nouvel onglet.
          </p>
          <div
            className="tagora-form-grid"
            style={{ display: "grid", gap, marginTop: 4 }}
          >
            <label className="tagora-field" style={{ margin: 0 }}>
              <span className="tagora-label">Type de document</span>
              <select
                className="tagora-select"
                value={documentCategory}
                onChange={(e) => setDocumentCategory(e.target.value as OperationDocumentCategory)}
              >
                {OPERATION_DOCUMENT_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {DOCUMENT_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="tagora-field" style={{ margin: 0 }}>
              <span className="tagora-label">Fichier</span>
              <input
                ref={documentFileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={handleDocumentFilePick}
                className="tagora-input"
              />
            </label>
            <label className="tagora-field" style={{ margin: 0 }}>
              <span className="tagora-label">Note (optionnelle)</span>
              <input
                type="text"
                value={documentNote}
                onChange={(e) => setDocumentNote(e.target.value)}
                className="tagora-input"
                placeholder="Référence, commentaire court…"
              />
            </label>
          </div>
          <PrimaryButton
            type="button"
            onClick={() => void handleAddOperationDocument()}
            disabled={uploading || !documentFile}
          >
            {uploading ? "Envoi…" : "Ajouter"}
          </PrimaryButton>

          <div style={{ marginTop: compact ? 10 : 14 }}>
            <div className="ui-eyebrow" style={{ fontSize: 11 }}>
              Documents enregistrés
            </div>
            {loading ? (
              <div className="ui-text-muted" style={{ marginTop: 6 }}>
                Chargement…
              </div>
            ) : fileDocuments.length === 0 ? (
              <div className="ui-text-muted" style={{ marginTop: 6 }}>
                Aucun document pour cette opération.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "10px 0 0",
                  padding: 0,
                  display: "grid",
                  gap: 10,
                }}
              >
                {fileDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    style={{
                      display: "grid",
                      gap: 8,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontWeight: 700, color: "#0f2948", fontSize: 14 }}>
                        {documentCategoryLabel(doc.categorie)}
                      </span>
                      <span className="ui-text-muted" style={{ fontSize: 12 }}>
                        {formatProofDate(doc.date_heure)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, wordBreak: "break-word", color: "#334155" }}>
                      {doc.nom}
                    </div>
                    <div className="ui-text-muted" style={{ fontSize: 12 }}>
                      Ajouté par : {shortUserRef(doc.cree_par)}
                      {doc.commentaire ? (
                        <>
                          {" "}
                          · {doc.commentaire}
                        </>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <a
                        href={doc.url_fichier}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tagora-dark-action"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 14px",
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Voir
                      </a>
                      <a
                        href={doc.url_fichier}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={doc.nom || undefined}
                        className="tagora-dark-outline-action"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 14px",
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Télécharger
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AppCard>
      ) : null}

      <AppCard className={compact ? "ui-stack-xs" : "ui-stack-sm"} tone={compact ? "muted" : "default"}>
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
        <div style={{ display: "flex", gap: compact ? 8 : 10, flexWrap: "wrap" }}>
          <PrimaryButton type="button" onClick={saveTextNote} disabled={uploading}>
            Enregistrer une note
          </PrimaryButton>
        </div>
        {!showOperationDocuments ? (
          <FormField label="1) Ajouter un document">
            <input
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={handleLegacyDocument}
              className="tagora-input"
            />
          </FormField>
        ) : null}
        <AppCard tone="muted" className={compact ? "ui-stack-xs" : "ui-stack-sm"}>
          <div className="ui-eyebrow">{showOperationDocuments ? "1) Enregistrer un vocal" : "2) Enregistrer un vocal"}</div>
          <div
            style={{
              display: "flex",
              gap: compact ? 8 : 10,
              flexWrap: "wrap",
              position: "relative",
              zIndex: 20,
              pointerEvents: "auto",
              touchAction: "manipulation",
              padding: compact ? 0 : 4,
              borderRadius: 10,
            }}
          >
            <button
              type="button"
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
        <AppCard tone="muted" className={compact ? "ui-stack-xs" : "ui-stack-sm"}>
          <div className="ui-eyebrow">{showOperationDocuments ? "2) Signature client" : "3) Signature client"}</div>
          <canvas
            ref={signatureCanvasRef}
            width={760}
            height={compact ? 170 : 220}
            onPointerDown={startSignature}
            onPointerMove={moveSignature}
            onPointerUp={endSignature}
            onPointerLeave={endSignature}
            style={{
              width: "100%",
              maxWidth: "100%",
              height: compact ? 170 : 220,
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

      <AppCard className={compact ? "ui-stack-xs" : "ui-stack-sm"} tone={compact ? "muted" : "default"}>
        <div className="ui-eyebrow">
          {showOperationDocuments ? "Autres preuves (vocal, signature, note)" : "Preuves existantes"}
        </div>
        {loading ? (
          <div className="ui-text-muted">Chargement...</div>
        ) : (showOperationDocuments ? otherProofs : proofs).length === 0 ? (
          <div className="ui-text-muted">Aucune preuve.</div>
        ) : (
          <div className="ui-stack-sm">
            {(showOperationDocuments ? otherProofs : proofs).map((proof) => (
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
