"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type Note = {
  id: number;
  contenu: string | null;
  created_at?: string;
};

type Photo = {
  id: number;
  image_url: string;
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
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [documentsNotice, setDocumentsNotice] = useState("");

  const canUseDocuments = hasPermission("documents");
  const canUseDossiers = hasPermission("dossiers");

  const dossierTitle = useMemo(() => {
    if (!dossier) return `Dossier #${dossierId}`;
    return dossier.nom || dossier.client || `Dossier #${dossierId}`;
  }, [dossier, dossierId]);

  const fetchDossier = useCallback(async () => {
    const { data, error } = await supabase
      .from("dossiers")
      .select("id, nom, client, description, nb_photos, nb_notes, nb_fichiers")
      .eq("id", dossierId)
      .single();

    if (error) {
      setFeedback(
        "Ce dossier n est pas accessible avec votre session actuelle ou n existe plus."
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
        "Les notes et fichiers de ce dossier sont limites sur votre compte."
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
        "Les notes et fichiers de ce dossier sont limites sur votre compte."
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
            "La permission documents n est pas active sur votre compte. Les notes et medias sont masques, mais le dossier reste consultable."
          );
        }
      }

      setLoading(false);
    }

    void init();
  }, [accessLoading, canUseDocuments, canUseDossiers, dossierId, fetchDossier, fetchNotes, fetchPhotos, router, userId]);

  const handleAddNote = async () => {
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

  const handleUploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setFeedback("");

    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `dossier-${dossierId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("photos-dossiers")
      .upload(filePath, file);

    if (uploadError) {
      setFeedback(
        "Impossible d envoyer ce fichier. Verifie la permission documents et l acces au stockage."
      );
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("photos-dossiers")
      .getPublicUrl(filePath);

    const imageUrl = publicUrlData.publicUrl;

    const { error: insertError } = await supabase.from("photos_dossier").insert([
      {
        dossier_id: dossierId,
        image_url: imageUrl,
        user_id: user.id,
      },
    ]);

    if (insertError) {
      setFeedback(
        "Le fichier a ete envoye mais son enregistrement a echoue. Verifie les droits documents."
      );
      setUploading(false);
      return;
    }

    const uploadedVideo = isVideo(imageUrl);

    await supabase
      .from("dossiers")
      .update({
        nb_photos: uploadedVideo
          ? dossier?.nb_photos || 0
          : (dossier?.nb_photos || 0) + 1,
        nb_fichiers: (dossier?.nb_fichiers || 0) + 1,
      })
      .eq("id", dossierId);

    await fetchDossier();
    await fetchPhotos();
    setUploading(false);
    event.target.value = "";
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

    await supabase
      .from("dossiers")
      .update({
        nb_photos: deletedVideo
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
          <AuthenticatedPageHeader title={`Dossier #${dossierId}`} subtitle="Notes et medias." />
          <SectionCard title="Chargement" subtitle="Acces en cours." />
        </div>
      </main>
    );
  }

  if (!canUseDossiers) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title={`Dossier #${dossierId}`} subtitle="Notes et medias." />
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
          subtitle="Notes et medias."
        />

        {feedback ? <SectionCard title="Action" subtitle={feedback} tone="muted" /> : null}
        {documentsNotice ? <SectionCard title="Acces partiel" subtitle={documentsNotice} tone="muted" /> : null}

        <div className="ui-grid-auto">
          <StatCard label="Photos" value={dossier?.nb_photos || 0} />
          <StatCard label="Notes" value={dossier?.nb_notes || 0} />
          <StatCard label="Fichiers" value={dossier?.nb_fichiers || 0} />
        </div>

        <SectionCard title="Resume" subtitle="Informations principales.">
          {dossier ? (
            <div className="ui-grid-3">
              <InfoRow label="Nom" value={dossier.nom || `Dossier #${dossier.id}`} />
              <InfoRow label="Client" value={dossier.client || "-"} />
              <InfoRow label="Description" value={dossier.description || "-"} />
            </div>
          ) : (
            <AppCard tone="muted">
              <p className="ui-text-muted" style={{ margin: 0 }}>Aucun detail.</p>
            </AppCard>
          )}
        </SectionCard>

        {canUseDocuments ? (
          <div className="ui-grid-2" style={{ alignItems: "start" }}>
            <SectionCard title="Notes" subtitle="Notes du dossier.">
              <div className="ui-stack-md">
                <FormField label="Nouvelle note">
                  <textarea
                    placeholder="Ecrire une note terrain..."
                    value={contenu}
                    onChange={(event) => setContenu(event.target.value)}
                    className="tagora-textarea"
                  />
                </FormField>
                <div>
                  <PrimaryButton onClick={handleAddNote}>Creer</PrimaryButton>
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
              </div>
            </SectionCard>

            <SectionCard title="Medias" subtitle="Photos et videos.">
              <div className="ui-stack-md">
                <div className="ui-grid-2">
                  <InfoRow label="Maximum" value="15 fichiers" compact />
                  <InfoRow label="Occupation" value={`${dossier?.nb_fichiers || 0}/15`} compact />
                </div>
                <FormField label="Ajouter un fichier" hint="Images et videos acceptees.">
                  <input type="file" accept="image/*,video/*" onChange={handleUploadPhoto} className="tagora-input" />
                </FormField>
                {uploading ? <div className="ui-text-muted">Upload en cours...</div> : null}
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
                          ) : (
                            <Image src={photo.image_url} alt="Photo dossier" fill sizes="200px" style={{ objectFit: "cover" }} />
                          )}
                        </div>
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
