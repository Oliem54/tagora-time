"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";
import { useCurrentAccess } from "../../../hooks/useCurrentAccess";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import StatCard from "@/app/components/ui/StatCard";
import AppCard from "@/app/components/ui/AppCard";
import InfoRow from "@/app/components/ui/InfoRow";
import FormField from "@/app/components/ui/FormField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import OperationProofsPanel, { type ModuleSource } from "@/app/components/proofs/OperationProofsPanel";

type Note = {
  id: number;
  contenu: string | null;
  created_at?: string;
};

type Photo = {
  id: number;
  image_url: string;
  proof_type?: string | null;
  proof_name?: string | null;
  linked_record_type?: string | null;
  linked_record_id?: number | null;
  created_at?: string | null;
};

type Dossier = {
  id: number;
  nom: string | null;
  client: string | null;
  description: string | null;
  nb_photos: number | null;
  nb_notes: number | null;
  nb_fichiers: number | null;
};

type InterventionMetadata = {
  typeIntervention: string;
  referenceLiee: string;
  contactNom: string;
  dateHeure: string;
  kmDepart: string;
  kmArrivee: string;
  linkedOperationId: string;
};

type LegacyProofType = "document" | "voice_recording" | "client_signature";

function isVideo(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.endsWith(".mp4") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".avi") ||
    lower.endsWith(".mkv")
  );
}

function isAudio(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.endsWith(".mp3") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".aac") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".caf")
  );
}

function getAudioProofLabel(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("voice-note-")) return "Note vocale employe";
  if (lower.includes("voice-recording-")) return "Note vocale employe";
  if (lower.includes("client-confirmation-")) return "Confirmation vocale client";
  return "Preuve audio";
}

function parseInterventionMetadata(dossier: Dossier | null): InterventionMetadata {
  const defaultReference = dossier?.nom || (dossier ? `#${dossier.id}` : "-");
  const metadata: InterventionMetadata = {
    typeIntervention: "Intervention",
    referenceLiee: defaultReference,
    contactNom: "-",
    dateHeure: "-",
    kmDepart: "-",
    kmArrivee: "-",
    linkedOperationId: "-",
  };

  const description = dossier?.description || "";
  description.split("\n").forEach((line) => {
    const [rawKey, ...rawValueParts] = line.split(":");
    if (!rawKey || rawValueParts.length === 0) return;
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join(":").trim() || "-";

    if (key === "type_intervention") {
      if (value === "livraison") metadata.typeIntervention = "Livraison";
      else if (value === "ramassage") metadata.typeIntervention = "Ramassage";
      else if (value === "incident") metadata.typeIntervention = "Incident / dommage";
      else if (value === "depense") metadata.typeIntervention = "Depense employe";
      else if (value === "note_interne") metadata.typeIntervention = "Note interne liee a mission";
    }
    if (key === "reference_liee") metadata.referenceLiee = value;
    if (key === "contact_nom") metadata.contactNom = value;
    if (key === "date_heure") metadata.dateHeure = value;
    if (key === "km_depart") metadata.kmDepart = value;
    if (key === "km_arrivee") metadata.kmArrivee = value;
    if (key === "livraison_id") metadata.linkedOperationId = value;
  });

  return metadata;
}

function getProofType(photo: Photo): LegacyProofType {
  const proofType = (photo.proof_type || "").toLowerCase();
  if (proofType === "voice_recording") return "voice_recording";
  if (proofType === "client_signature") return "client_signature";
  if (proofType === "document") return "document";
  const url = photo.image_url.toLowerCase();
  if (isAudio(url)) return "voice_recording";
  if (url.includes("client-signature-")) return "client_signature";
  return "document";
}

function getProofName(photo: Photo) {
  return photo.proof_name || `preuve-${photo.id}`;
}

export default function DossierPage() {
  const params = useParams<{ id: string }>();
  const dossierId = Number(params.id);
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const userId = user?.id ?? null;

  const [contenu, setContenu] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [documentsNotice, setDocumentsNotice] = useState("");

  const canUseDocuments = hasPermission("documents");
  const canUseDossiers = hasPermission("dossiers");

  const dossierTitle = useMemo(() => {
    if (!dossier) return `Intervention #${dossierId}`;
    return dossier.nom || dossier.client || `Intervention #${dossierId}`;
  }, [dossier, dossierId]);
  const interventionMetadata = useMemo(
    () => parseInterventionMetadata(dossier),
    [dossier]
  );
  const proofModuleSource = useMemo<ModuleSource>(() => {
    if (interventionMetadata.typeIntervention === "Livraison") return "livraison";
    if (interventionMetadata.typeIntervention === "Ramassage") return "ramassage";
    return "dossier";
  }, [interventionMetadata.typeIntervention]);
  const proofSourceId = useMemo(() => {
    const linked = Number(interventionMetadata.linkedOperationId);
    if (Number.isFinite(linked) && linked > 0 && proofModuleSource !== "dossier") {
      return String(linked);
    }
    return String(dossierId);
  }, [dossierId, interventionMetadata.linkedOperationId, proofModuleSource]);

  const fetchDossier = useCallback(async () => {
    const { data, error } = await supabase
      .from("dossiers")
      .select("id, nom, client, description, nb_photos, nb_notes, nb_fichiers")
      .eq("id", dossierId)
      .single();

    if (error) {
      setFeedback(
        "Cette intervention n est pas accessible avec votre session actuelle ou n existe plus."
      );
      setDossier(null);
      return false;
    }

    setDossier(data);
    return true;
  }, [dossierId]);

  const fetchNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("notes_dossier")
      .select("*")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false });

    if (error) {
      setNotes([]);
      setDocumentsNotice(
        "Les notes et fichiers de cette intervention sont limites sur votre compte."
      );
      return;
    }

    setNotes(data || []);
  }, [dossierId]);

  const fetchPhotos = useCallback(async () => {
    const { data, error } = await supabase
      .from("photos_dossier")
      .select("*")
      .eq("dossier_id", dossierId)
      .order("id", { ascending: false });

    if (error) {
      setPhotos([]);
      setDocumentsNotice(
        "Les notes et fichiers de cette intervention sont limites sur votre compte."
      );
      return;
    }

    setPhotos(data || []);
  }, [dossierId]);

  useEffect(() => {
    async function init() {
      if (accessLoading) return;

      if (!userId) {
        router.push("/employe/login");
        return;
      }

      if (!canUseDossiers) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setFeedback("");
      setDocumentsNotice("");

      const dossierLoaded = await fetchDossier();

      if (dossierLoaded && canUseDocuments) {
        await Promise.all([fetchNotes(), fetchPhotos()]);
      } else {
        setNotes([]);
        setPhotos([]);
        if (!canUseDocuments) {
          setDocumentsNotice(
            "La permission documents n est pas active sur votre compte. Les notes et medias sont masques, mais l intervention reste consultable."
          );
        }
      }

      setLoading(false);
    }

    void init();
  }, [accessLoading, canUseDocuments, canUseDossiers, dossierId, fetchDossier, fetchNotes, fetchPhotos, router, userId]);

  const handleAddNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      router.push("/employe/login");
      return;
    }

    if (!contenu.trim()) {
      setFeedback("Ecris une note avant de l ajouter.");
      return;
    }

    const { error } = await supabase.from("notes_dossier").insert([
      {
        dossier_id: dossierId,
        contenu,
        user_id: user.id,
      },
    ]);

    if (error) {
      setFeedback(
        "Impossible d ajouter la note. Verifie la permission documents sur ce compte."
      );
      return;
    }

    await supabase
      .from("dossiers")
      .update({
        nb_notes: (dossier?.nb_notes || 0) + 1,
      })
      .eq("id", dossierId);

    setContenu("");
    setFeedback("");
    await fetchDossier();
    await fetchNotes();
  };

  const handleDeletePhoto = async (photoId: number, imageUrl: string) => {
    const confirmation = window.confirm("Supprimer ce fichier ?");
    if (!confirmation) return;

    const { error } = await supabase.from("photos_dossier").delete().eq("id", photoId);

    if (error) {
      setFeedback("Impossible de supprimer ce fichier pour le moment.");
      return;
    }

    const deletedVideo = isVideo(imageUrl);
    const deletedAudio = isAudio(imageUrl);

    await supabase
      .from("dossiers")
      .update({
        nb_photos: deletedVideo
          || deletedAudio
          ? dossier?.nb_photos || 0
          : Math.max((dossier?.nb_photos || 0) - 1, 0),
        nb_fichiers: Math.max((dossier?.nb_fichiers || 0) - 1, 0),
      })
      .eq("id", dossierId);

    await fetchDossier();
    await fetchPhotos();
  };

  if (accessLoading || loading) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title={`Intervention #${dossierId}`} subtitle="Preuves et notes." />
          <SectionCard title="Chargement" subtitle="Acces en cours." />
        </div>
      </main>
    );
  }

  if (!canUseDossiers) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title={`Intervention #${dossierId}`} subtitle="Preuves et notes." />
          <SectionCard title="Acces bloque" subtitle="Permission requise." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title={dossierTitle}
          subtitle="Preuves et notes."
        />
        <div>
          <SecondaryButton type="button" onClick={() => router.push("/employe/dashboard")}>
            Retour
          </SecondaryButton>
        </div>

        {feedback ? <SectionCard title="Action" subtitle={feedback} tone="muted" /> : null}
        {documentsNotice ? <SectionCard title="Acces partiel" subtitle={documentsNotice} tone="muted" /> : null}

        <div className="ui-grid-auto">
          <StatCard label="Photos" value={dossier?.nb_photos || 0} />
          <StatCard label="Notes" value={dossier?.nb_notes || 0} />
          <StatCard label="Fichiers" value={dossier?.nb_fichiers || 0} />
        </div>

        <SectionCard title="Resume intervention" subtitle="Informations operationnelles.">
          {dossier ? (
            <div className="ui-grid-3">
              <InfoRow label="Type" value={interventionMetadata.typeIntervention} />
              <InfoRow label="Reference liee" value={interventionMetadata.referenceLiee} />
              <InfoRow label="Client" value={dossier.client || "-"} />
              <InfoRow label="Date / heure" value={interventionMetadata.dateHeure} />
              <InfoRow label="Contact" value={interventionMetadata.contactNom} />
              <InfoRow
                label="KM depart / arrivee"
                value={`${interventionMetadata.kmDepart} / ${interventionMetadata.kmArrivee}`}
              />
            </div>
          ) : (
            <AppCard tone="muted">
              <p className="ui-text-muted" style={{ margin: 0 }}>Aucun detail.</p>
            </AppCard>
          )}
        </SectionCard>

        <SectionCard title="Preuves operationnelles" subtitle="Etat des preuves de l intervention.">
          <div className="ui-grid-2">
            <InfoRow label="Photos / fichiers" value={String(dossier?.nb_fichiers || 0)} compact />
            <InfoRow label="Notes" value={String(dossier?.nb_notes || 0)} compact />
            <InfoRow
              label="Signature mobile"
              value={photos.some((photo) => getProofType(photo) === "client_signature") ? "Renseignee" : "Non renseignee"}
              compact
            />
            <InfoRow
              label="Confirmation vocale"
              value={photos.some((photo) => getProofType(photo) === "voice_recording") ? "Renseignee" : "Non renseignee"}
              compact
            />
          </div>
          <div style={{ marginTop: "var(--ui-space-4)" }}>
            <OperationProofsPanel
              moduleSource={proofModuleSource}
              sourceId={proofSourceId}
              categorieParDefaut="dossier_terrain"
              titre="Gestion des preuves"
              commentairePlaceholder="Commentaire preuve intervention"
            />
          </div>
        </SectionCard>

        {canUseDossiers ? (
          <div className="ui-grid-2" style={{ alignItems: "start" }}>
            <SectionCard title="Notes" subtitle="Notes de l intervention.">
              <form className="ui-stack-md" onSubmit={handleAddNote}>
                <FormField label="Nouvelle note">
                  <textarea
                    placeholder="Ecrire une note terrain..."
                    value={contenu}
                    onChange={(event) => setContenu(event.target.value)}
                    className="tagora-textarea"
                  />
                </FormField>
                <div>
                  <PrimaryButton type="submit">Creer</PrimaryButton>
                </div>
                {notes.length === 0 ? (
                  <AppCard tone="muted">
                    <p className="ui-text-muted" style={{ margin: 0 }}>Aucune note.</p>
                  </AppCard>
                ) : (
                  <div className="ui-stack-sm">
                    {notes.map((note) => (
                      <AppCard key={note.id} tone="muted" className="ui-stack-xs">
                        <div style={{ color: "var(--ui-color-text)" }}>{note.contenu}</div>
                        {note.created_at ? (
                          <div className="ui-text-muted">{new Date(note.created_at).toLocaleString("fr-CA")}</div>
                        ) : null}
                      </AppCard>
                    ))}
                  </div>
                )}
              </form>
            </SectionCard>

            <SectionCard title="Medias" subtitle="Photos et videos.">
              <div className="ui-stack-md">
                <div className="ui-grid-2">
                  <InfoRow label="Maximum" value="15 fichiers" compact />
                  <InfoRow label="Occupation" value={`${dossier?.nb_fichiers || 0}/15`} compact />
                </div>
                <AppCard tone="muted">
                  <p className="ui-text-muted" style={{ margin: 0 }}>
                    Historique media legacy. Les nouveaux ajouts passent par la section &quot;Gestion des preuves&quot;.
                  </p>
                </AppCard>
                {photos.length === 0 ? (
                  <AppCard tone="muted">
                    <p className="ui-text-muted" style={{ margin: 0 }}>Aucun fichier.</p>
                  </AppCard>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: "var(--ui-space-4)",
                    }}
                  >
                    {photos.map((photo) => (
                      <AppCard key={photo.id} className="ui-stack-sm">
                        <div className="ui-stack-xs">
                          <div className="ui-eyebrow">
                            {getProofType(photo) === "client_signature"
                              ? "Signature client"
                              : getProofType(photo) === "voice_recording"
                                ? "Vocal"
                                : "Document"}
                          </div>
                          <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{getProofName(photo)}</div>
                          <div className="ui-text-muted">
                            {photo.created_at ? new Date(photo.created_at).toLocaleString("fr-CA") : "-"}
                          </div>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: 160,
                            overflow: "hidden",
                            borderRadius: "var(--ui-radius-sm)",
                            background: "#f8fafc",
                            position: "relative",
                          }}
                        >
                          {isVideo(photo.image_url) ? (
                            <video
                              src={photo.image_url}
                              controls
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          ) : isAudio(photo.image_url) ? (
                            <div className="ui-stack-xs" style={{ padding: 12 }}>
                              <div className="ui-eyebrow">{getAudioProofLabel(photo.image_url)}</div>
                              <audio src={photo.image_url} controls style={{ width: "100%" }} />
                            </div>
                          ) : (
                            <Image src={photo.image_url} alt="Photo intervention" fill sizes="200px" style={{ objectFit: "cover" }} />
                          )}
                        </div>
                        <a
                          href={photo.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="tagora-dark-outline-action"
                          style={{ textAlign: "center", padding: "10px 12px", borderRadius: 10, textDecoration: "none" }}
                        >
                          Ouvrir / telecharger
                        </a>
                        <SecondaryButton onClick={() => handleDeletePhoto(photo.id, photo.image_url)}>
                          Supprimer
                        </SecondaryButton>
                      </AppCard>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        ) : null}
      </div>
    </main>
  );
}
