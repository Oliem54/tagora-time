"use client";

import HeaderTagora from "../../../components/HeaderTagora";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase/client";

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
  const { id } = useParams();
  const router = useRouter();

  const [contenu, setContenu] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const dossierId = Number(id);

  const fetchDossier = async () => {
    const { data, error } = await supabase
      .from("dossiers")
      .select("id, nom, client, description, nb_photos, nb_notes, nb_fichiers")
      .eq("id", dossierId)
      .single();

    if (!error) {
      setDossier(data);
    }
  };

  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from("notes_dossier")
      .select("*")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false });

    if (!error) {
      setNotes(data || []);
    }
  };

  const fetchPhotos = async () => {
    const { data, error } = await supabase
      .from("photos_dossier")
      .select("*")
      .eq("dossier_id", dossierId)
      .order("id", { ascending: false });

    if (!error) {
      setPhotos(data || []);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.push("/employe/login");
        return;
      }

      await fetchDossier();
      await fetchNotes();
      await fetchPhotos();
      setLoading(false);
    };

    init();
  }, [dossierId, router]);

  const handleAddNote = async () => {
    if (!contenu.trim()) {
      alert("Écris une note");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      alert("Non connecté");
      router.push("/employe/login");
      return;
    }

    const { error } = await supabase.from("notes_dossier").insert([
      {
        dossier_id: dossierId,
        contenu,
        user_id: userData.user.id,
      },
    ]);

    if (error) {
      alert("Erreur: " + error.message);
      return;
    }

    await supabase
      .from("dossiers")
      .update({
        nb_notes: (dossier?.nb_notes || 0) + 1,
      })
      .eq("id", dossierId);

    setContenu("");
    await fetchDossier();
    await fetchNotes();
  };

  const handleUploadPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      alert("Non connecté");
      router.push("/employe/login");
      return;
    }

    setUploading(true);

    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`;
    const filePath = `dossier-${dossierId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("photos-dossiers")
      .upload(filePath, file);

    if (uploadError) {
      alert("Erreur upload: " + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("photos-dossiers")
      .getPublicUrl(filePath);

    const imageUrl = publicUrlData.publicUrl;

    const { error: insertError } = await supabase
      .from("photos_dossier")
      .insert([
        {
          dossier_id: dossierId,
          image_url: imageUrl,
          user_id: userData.user.id,
        },
      ]);

    if (insertError) {
      alert("Erreur enregistrement photo: " + insertError.message);
      setUploading(false);
      return;
    }

    const isUploadedVideo = isVideo(imageUrl);

    await supabase
      .from("dossiers")
      .update({
        nb_photos: isUploadedVideo
          ? dossier?.nb_photos || 0
          : (dossier?.nb_photos || 0) + 1,
        nb_fichiers: (dossier?.nb_fichiers || 0) + 1,
      })
      .eq("id", dossierId);

    await fetchDossier();
    await fetchPhotos();
    setUploading(false);

    e.target.value = "";
  };

  const handleDeletePhoto = async (photoId: number, imageUrl: string) => {
    const confirmation = window.confirm("Supprimer ce fichier ?");
    if (!confirmation) return;

    const { error } = await supabase
      .from("photos_dossier")
      .delete()
      .eq("id", photoId);

    if (error) {
      alert("Erreur suppression: " + error.message);
      return;
    }

    const isDeletedVideo = isVideo(imageUrl);

    await supabase
      .from("dossiers")
      .update({
        nb_photos: isDeletedVideo
          ? dossier?.nb_photos || 0
          : Math.max((dossier?.nb_photos || 0) - 1, 0),
        nb_fichiers: Math.max((dossier?.nb_fichiers || 0) - 1, 0),
      })
      .eq("id", dossierId);

    await fetchDossier();
    await fetchPhotos();
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f5f7fb",
          padding: "30px 40px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Chargement...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "30px 40px",
        color: "#0f172a",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <HeaderTagora
        title={`Dossier #${dossierId}`}
        subtitle="Notes, photos et vidéos terrain"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: 24,
            border: "1px solid #e5e7eb",
            boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: 18,
              fontSize: 28,
              color: "#17376b",
            }}
          >
            Ajouter une note
          </h2>

          <textarea
            placeholder="Écrire une note terrain..."
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            onFocus={(e) => {
              e.currentTarget.style.border = "1px solid #17376b";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(23, 55, 107, 0.15)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = "1px solid #cbd5e1";
              e.currentTarget.style.boxShadow = "none";
            }}
            style={{
              width: "100%",
              height: 130,
              padding: 14,
              border: "1px solid #cbd5e1",
              borderRadius: 12,
              background: "white",
              color: "black",
              display: "block",
              resize: "none",
              boxSizing: "border-box",
              outline: "none",
              transition: "all 0.2s ease",
            }}
          />

          <br />

          <button
            onClick={handleAddNote}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            style={{
              padding: "12px 18px",
              border: "none",
              borderRadius: 12,
              background: "#d6b21f",
              color: "#1e293b",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 15,
              transition: "all 0.15s ease",
            }}
          >
            Ajouter la note
          </button>

          <h2
            style={{
              marginTop: 28,
              marginBottom: 16,
              fontSize: 26,
              color: "#17376b",
            }}
          >
            Notes
          </h2>

          {notes.length === 0 ? (
            <p>Aucune note pour le moment.</p>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                style={{
                  border: "1px solid #e5e7eb",
                  marginBottom: 10,
                  padding: 14,
                  borderRadius: 14,
                  background: "#fafafa",
                  boxShadow: "0 6px 14px rgba(15, 23, 42, 0.04)",
                }}
              >
                {note.contenu}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: 24,
            border: "1px solid #e5e7eb",
            boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: 16,
              fontSize: 28,
              color: "#17376b",
            }}
          >
            Ajouter photos et vidéos
          </h2>

          <p style={{ marginBottom: 8 }}>Maximum 15 fichiers par dossier</p>

          <p style={{ marginTop: 0, color: "#475569" }}>
            Fichiers déjà dans le dossier : {dossier?.nb_fichiers || 0}/15
          </p>

          <input
            type="file"
            accept="image/*,video/*"
            onChange={handleUploadPhoto}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "white",
              boxSizing: "border-box",
            }}
          />

          {uploading && <p>Upload en cours...</p>}

          <h2
            style={{
              marginTop: 28,
              marginBottom: 16,
              fontSize: 26,
              color: "#17376b",
            }}
          >
            Photos et vidéos du dossier
          </h2>

          {photos.length === 0 ? (
            <p>Aucun fichier pour le moment.</p>
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
                    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.05)",
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
                      <img
                        src={photo.image_url}
                        alt="Photo dossier"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    )}
                  </div>

                  <button
                    onClick={() => handleDeletePhoto(photo.id, photo.image_url)}
                    style={{
                      padding: "8px 12px",
                      border: "1px solid #fca5a5",
                      borderRadius: 12,
                      background: "#fff",
                      color: "#dc2626",
                      cursor: "pointer",
                      fontWeight: 700,
                      transition: "all 0.15s ease",
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <br />

      <button
        onClick={() => router.push("/employe/dashboard")}
        style={{
          padding: "12px 18px",
          border: "none",
          borderRadius: 12,
          background: "#17376b",
          color: "white",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        Retour au dashboard
      </button>
    </div>
  );
}