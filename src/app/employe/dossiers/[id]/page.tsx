"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import HeaderTagora from "../../../components/HeaderTagora";
import AccessNotice from "../../../components/AccessNotice";
import { supabase } from "../../../lib/supabase/client";
import { useCurrentAccess } from "../../../hooks/useCurrentAccess";

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
      <div className="page-container">
        <HeaderTagora title={`Dossier #${dossierId}`} subtitle="Notes, photos et videos terrain" />
        <AccessNotice description="Verification des acces dossier et chargement des donnees en cours." />
      </div>
    );
  }

  if (!canUseDossiers) {
    return (
      <div className="page-container">
        <HeaderTagora title={`Dossier #${dossierId}`} subtitle="Notes, photos et videos terrain" />
        <AccessNotice description="La permission dossiers n est pas active sur votre compte. Le detail du dossier reste donc bloque." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora title={dossierTitle} subtitle="Notes, photos et videos terrain" />

      {feedback ? <AccessNotice title="Action bloquee" description={feedback} /> : null}
      {documentsNotice ? (
        <div style={{ marginTop: feedback ? 18 : 0 }}>
          <AccessNotice title="Acces partiel" description={documentsNotice} />
        </div>
      ) : null}

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>
          Resume du dossier
        </h2>
        {dossier ? (
          <div className="tagora-note" style={{ display: "grid", gap: 8 }}>
            <div><strong>Nom :</strong> {dossier.nom || `Dossier #${dossier.id}`}</div>
            <div><strong>Client :</strong> {dossier.client || "-"}</div>
            <div><strong>Description :</strong> {dossier.description || "-"}</div>
            <div><strong>Photos :</strong> {dossier.nb_photos || 0}</div>
            <div><strong>Notes :</strong> {dossier.nb_notes || 0}</div>
            <div><strong>Fichiers :</strong> {dossier.nb_fichiers || 0}</div>
          </div>
        ) : (
          <p className="tagora-note">Aucun detail de dossier disponible.</p>
        )}
      </div>

      {canUseDocuments ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            gap: 20,
            alignItems: "start",
            marginTop: 24,
          }}
        >
          <div className="tagora-panel" style={{ minHeight: 560 }}>
            <h2 className="section-title" style={{ marginBottom: 18 }}>
              Ajouter une note
            </h2>

            <textarea
              placeholder="Ecrire une note terrain..."
              value={contenu}
              onChange={(event) => setContenu(event.target.value)}
              className="tagora-textarea"
            />

            <button onClick={handleAddNote} className="tagora-dark-action" style={{ marginTop: 16 }}>
              Ajouter la note
            </button>

            <h2 className="section-title" style={{ marginTop: 28, marginBottom: 16 }}>
              Notes
            </h2>

            {notes.length === 0 ? (
              <p className="tagora-note">Aucune note pour le moment.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {notes.map((note) => (
                  <div
                    key={note.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      marginBottom: 0,
                      padding: 14,
                      borderRadius: 14,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ color: "#0f172a", marginBottom: note.created_at ? 8 : 0 }}>
                      {note.contenu}
                    </div>
                    {note.created_at ? (
                      <div className="tagora-note">
                        {new Date(note.created_at).toLocaleString("fr-CA")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tagora-panel" style={{ minHeight: 560 }}>
            <h2 className="section-title" style={{ marginBottom: 16 }}>
              Ajouter photos et videos
            </h2>

            <p className="tagora-note" style={{ marginBottom: 8 }}>
              Maximum 15 fichiers par dossier.
            </p>

            <p className="tagora-note" style={{ marginBottom: 18 }}>
              Fichiers deja dans le dossier : {dossier?.nb_fichiers || 0}/15
            </p>

            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleUploadPhoto}
              className="tagora-input"
            />

            {uploading ? <p className="tagora-note" style={{ marginTop: 12 }}>Upload en cours...</p> : null}

            <h2 className="section-title" style={{ marginTop: 28, marginBottom: 16 }}>
              Photos et videos du dossier
            </h2>

            {photos.length === 0 ? (
              <p className="tagora-note">Aucun fichier pour le moment.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 14,
                }}
              >
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: 10,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: 140,
                        overflow: "hidden",
                        borderRadius: 10,
                        background: "#f8fafc",
                        marginBottom: 10,
                        position: "relative",
                      }}
                    >
                      {isVideo(photo.image_url) ? (
                        <video
                          src={photo.image_url}
                          controls
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      ) : (
                        <Image
                          src={photo.image_url}
                          alt="Photo dossier"
                          fill
                          sizes="200px"
                          style={{ objectFit: "cover" }}
                        />
                      )}
                    </div>

                    <button
                      onClick={() => handleDeletePhoto(photo.id, photo.image_url)}
                      className="tagora-dark-outline-action"
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="actions-row" style={{ marginTop: 24 }}>
        <button
          onClick={() => router.push("/employe/dashboard")}
          className="tagora-dark-outline-action"
        >
          Retour au dashboard
        </button>
      </div>
    </div>
  );
}

