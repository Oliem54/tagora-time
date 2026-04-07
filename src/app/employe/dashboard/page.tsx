"use client";

import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import HeaderTagora from "../../components/HeaderTagora";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type NoteRow = {
  id: number;
  dossier_id: number;
};

type MediaRow = {
  id: number;
  dossier_id: number;
  image_url: string | null;
};

type DossierCard = {
  id: number;
  nom: string;
  client: string;
  description: string;
  statut: string;
  notesCount: number;
  fichiersCount: number;
  photosCount: number;
  videosCount: number;
  previewUrl: string | null;
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

function getStatutStyle(statut: string) {
  if (statut === "Terminé") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (statut === "En cours") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
    };
  }

  return {
    background: "#e0e7ff",
    color: "#1d4ed8",
    border: "1px solid #93c5fd",
  };
}

export default function EmployeDashboardPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();

  const [email, setEmail] = useState("");
  const [dossiers, setDossiers] = useState<DossierCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (accessLoading) {
        return;
      }

      if (!user) {
        router.push("/employe/login");
        return;
      }

      setEmail(user.email || "");

      if (!hasPermission("dossiers")) {
        setDossiers([]);
        setLoading(false);
        return;
      }

      const userId = user.id;

      const { data: dossiersData, error: dossiersError } = await supabase
        .from("dossiers")
        .select("id, nom, client, description, statut")
        .eq("user_id", userId)
        .order("id", { ascending: false });

      if (dossiersError) {
        alert("Erreur chargement dossiers : " + dossiersError.message);
        setLoading(false);
        return;
      }

      const dossiersFiltres = (dossiersData || []).filter(
        (dossier) =>
          dossier.nom?.trim() ||
          dossier.client?.trim() ||
          dossier.description?.trim()
      );

      if (dossiersFiltres.length === 0) {
        setDossiers([]);
        setLoading(false);
        return;
      }

      const dossierIds = dossiersFiltres.map((d) => d.id);

      const { data: notesData, error: notesError } = await supabase
        .from("notes_dossier")
        .select("id, dossier_id")
        .in("dossier_id", dossierIds);

      if (notesError) {
        alert("Erreur chargement notes : " + notesError.message);
        setLoading(false);
        return;
      }

      const { data: mediasData, error: mediasError } = await supabase
        .from("photos_dossier")
        .select("id, dossier_id, image_url")
        .in("dossier_id", dossierIds)
        .order("id", { ascending: false });

      if (mediasError) {
        alert("Erreur chargement médias : " + mediasError.message);
        setLoading(false);
        return;
      }

      const notesByDossier: Record<number, number> = {};
      ((notesData as NoteRow[] | null) || []).forEach((note) => {
        notesByDossier[note.dossier_id] =
          (notesByDossier[note.dossier_id] || 0) + 1;
      });

      const mediasByDossier: Record<number, MediaRow[]> = {};
      ((mediasData as MediaRow[] | null) || []).forEach((media) => {
        if (!mediasByDossier[media.dossier_id]) {
          mediasByDossier[media.dossier_id] = [];
        }
        mediasByDossier[media.dossier_id].push(media);
      });

      const cards: DossierCard[] = dossiersFiltres.map((dossier) => {
        const medias = mediasByDossier[dossier.id] || [];

        const photos = medias.filter(
          (m) => m.image_url && !isVideo(m.image_url)
        );
        const videos = medias.filter(
          (m) => m.image_url && isVideo(m.image_url)
        );

        const previewPhoto = photos.length > 0 ? photos[0].image_url! : null;

        return {
          id: dossier.id,
          nom: dossier.nom || "Sans nom",
          client: dossier.client || "-",
          description: dossier.description || "-",
          statut: dossier.statut || "Nouveau",
          notesCount: notesByDossier[dossier.id] || 0,
          fichiersCount: medias.length,
          photosCount: photos.length,
          videosCount: videos.length,
          previewUrl: previewPhoto,
        };
      });

      setDossiers(cards);
      setLoading(false);
    };

    loadData();
  }, [accessLoading, hasPermission, router, user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/employe/login");
  };

  const handleDelete = async (id: number) => {
    const confirmation = window.confirm("Supprimer ce dossier ?");

    if (!confirmation) return;

    const { error } = await supabase.from("dossiers").delete().eq("id", id);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setDossiers((prev) => prev.filter((dossier) => dossier.id !== id));
  };

  const handleChangeStatut = async (id: number, statut: string) => {
    const { error } = await supabase
      .from("dossiers")
      .update({ statut })
      .eq("id", id);

    if (error) {
      alert("Erreur statut : " + error.message);
      return;
    }

    setDossiers((prev) =>
      prev.map((dossier) =>
        dossier.id === id ? { ...dossier, statut } : dossier
      )
    );
  };

  if (loading || accessLoading) {
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
        title="Dashboard employé"
        subtitle="Vue d’ensemble des dossiers terrain"
      />

      <div style={{ marginBottom: 18, fontSize: 18 }}>
        Connecté comme : {email}
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 28,
        }}
      >
        {hasPermission("dossiers") ? (
          <button
            onClick={() => router.push("/employe/dossiers/new")}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            style={{
              padding: "14px 22px",
              border: "none",
              borderRadius: 14,
              background: "#d6b21f",
              color: "#1e293b",
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 700,
              boxShadow: "0 8px 18px rgba(214, 178, 31, 0.28)",
              transition: "all 0.15s ease",
            }}
          >
            Ajouter un dossier
          </button>
        ) : null}

        <button
          onClick={() => router.push("/employe/terrain")}
          className="tagora-navy-action"
          style={{
            padding: "14px 22px",
            border: "none",
            borderRadius: 14,
            background: "#17376b",
            color: "white",
            cursor: "pointer",
            fontSize: 18,
            fontWeight: 700,
            boxShadow: "0 8px 18px rgba(23, 55, 107, 0.22)",
            transition: "all 0.15s ease",
          }}
        >
          Terrain employé
        </button>

        {hasPermission("livraisons") ? (
          <button
            onClick={() => router.push("/employe/livraisons")}
            className="tagora-navy-action"
            style={{
              padding: "14px 22px",
              border: "none",
              borderRadius: 14,
              background: "#17376b",
              color: "white",
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 700,
              boxShadow: "0 8px 18px rgba(23, 55, 107, 0.22)",
              transition: "all 0.15s ease",
            }}
          >
            Livraisons
          </button>
        ) : null}

        <button
          onClick={handleLogout}
          className="tagora-navy-action"
          style={{
            padding: "14px 22px",
            border: "none",
            borderRadius: 14,
            background: "#17376b",
            color: "white",
            cursor: "pointer",
            fontSize: 18,
            fontWeight: 700,
            boxShadow: "0 8px 18px rgba(23, 55, 107, 0.22)",
            transition: "all 0.15s ease",
          }}
        >
          Se déconnecter
        </button>
      </div>

      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          marginBottom: 18,
        }}
      >
        Mes dossiers
      </div>

      {!hasPermission("dossiers") ? (
        <AccessNotice description="La permission dossiers n est pas active sur votre compte. Les actions et donnees de dossier sont donc masquees sur ce dashboard." />
      ) : dossiers.length === 0 ? (
        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: 40,
            border: "1px solid #e2e8f0",
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>
            Aucun dossier pour le moment
          </div>

          <div style={{ color: "#64748b", marginBottom: 20 }}>
            Commence par créer ton premier dossier terrain
          </div>

          <button
            onClick={() => router.push("/employe/dossiers/new")}
            style={{
              padding: "12px 20px",
              borderRadius: 12,
              background: "#d6b21f",
              border: "none",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Créer un dossier
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
            gap: 18,
          }}
        >
          {dossiers.map((dossier) => (
            <div
              key={dossier.id}
              style={{
                background: "white",
                borderRadius: 24,
                padding: 24,
                border: "1px solid #e5e7eb",
                boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)",
                transition: "all 0.2s ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow =
                  "0 30px 60px rgba(15, 23, 42, 0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0px)";
                e.currentTarget.style.boxShadow =
                  "0 20px 40px rgba(15, 23, 42, 0.08)";
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#17376b",
                  marginBottom: 8,
                }}
              >
                {dossier.nom}
              </div>

              <div
                style={{
                  ...getStatutStyle(dossier.statut),
                  display: "inline-block",
                  padding: "6px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {dossier.statut}
              </div>

              <div
                style={{
                  fontSize: 18,
                  color: "#64748b",
                  marginBottom: 6,
                }}
              >
                Client : {dossier.client}
              </div>

              <div
                style={{
                  fontSize: 18,
                  color: "#475569",
                  marginBottom: 18,
                }}
              >
                {dossier.description}
              </div>

              <div
                style={{
                  background: "#fffbe8",
                  border: "1px solid #f1e3a0",
                  borderRadius: 16,
                  padding: 18,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    marginBottom: 10,
                    color: "#334155",
                  }}
                >
                  Résumé du dossier
                </div>

                <div style={{ fontSize: 17, color: "#475569", lineHeight: 1.6 }}>
                  <div>Notes : {dossier.notesCount}</div>
                  <div>Fichiers joints : {dossier.fichiersCount}</div>
                  <div>Photos : {dossier.photosCount}</div>
                  <div>Vidéos : {dossier.videosCount}</div>
                </div>
              </div>

              {dossier.previewUrl ? (
                <div
                  style={{
                    width: 110,
                    height: 110,
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "#fff",
                    marginBottom: 18,
                  }}
                >
                  <img
                    src={dossier.previewUrl}
                    alt="Aperçu dossier"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <button
                  onClick={() => router.push(`/employe/dossiers/${dossier.id}`)}
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
                    fontSize: 15,
                    fontWeight: 700,
                    transition: "all 0.15s ease",
                  }}
                >
                  Voir
                </button>

                <button
                  onClick={() => handleDelete(dossier.id)}
                  style={{
                    padding: "12px 18px",
                    borderRadius: 12,
                    border: "1px solid #fca5a5",
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

              <select
                value={dossier.statut}
                onChange={(e) => handleChangeStatut(dossier.id, e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  background: "white",
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                <option value="Nouveau">Nouveau</option>
                <option value="En cours">En cours</option>
                <option value="Terminé">Terminé</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

