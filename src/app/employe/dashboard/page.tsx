"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock3, FileStack, Lightbulb, ShieldCheck, Truck, Waypoints } from "lucide-react";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "../../lib/supabase/client";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import InfoRow from "@/app/components/ui/InfoRow";
import ModuleTile from "@/app/components/ui/ModuleTile";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";

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
  const userId = user?.id ?? null;
  const canUseDossiers = hasPermission("dossiers");
  const canUseLivraisons = hasPermission("livraisons");

  const [dossiers, setDossiers] = useState<DossierCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (accessLoading) {
        return;
      }

      if (!userId) {
        router.push("/employe/login");
        return;
      }
      if (!canUseDossiers) {
        setDossiers([]);
        setLoading(false);
        return;
      }

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

    void loadData();
  }, [accessLoading, canUseDossiers, router, userId]);

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
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader
            title="Tableau de bord employe"
            subtitle="Chargement"
          />
          <SectionCard title="Chargement" subtitle="Acces en cours." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Tableau de bord employe"
          subtitle="Acces rapide."
          actions={
            <div
              style={{
                display: "flex",
                gap: "var(--ui-space-3)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <SecondaryButton onClick={() => router.push("/employe/profil")}>
                Profil
              </SecondaryButton>
              <SecondaryButton onClick={handleLogout}>Se deconnecter</SecondaryButton>
            </div>
          }
        />

        <SectionCard title="Acces" subtitle="Modules.">
          <div className="ui-grid-auto">
            <ModuleTile
              title="Horodateur"
              description="Pointage."
              icon={<Clock3 size={24} strokeWidth={2.1} />}
              accent="linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(15,41,72,0.08) 100%)"
              action={
                <PrimaryButton onClick={() => router.push("/employe/horodateur")} style={{ width: "100%", justifyContent: "space-between" }}>
                  <span>Acceder</span>
                  <ArrowUpRight size={16} />
                </PrimaryButton>
              }
            />
            <ModuleTile
              title="Terrain"
              description="Sorties."
              icon={<Waypoints size={24} strokeWidth={2.1} />}
              accent="linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,41,72,0.08) 100%)"
              action={
                <SecondaryButton onClick={() => router.push("/employe/terrain")} style={{ width: "100%", justifyContent: "space-between" }}>
                  <span>Acceder</span>
                  <ArrowUpRight size={16} />
                </SecondaryButton>
              }
            />
            {canUseLivraisons ? (
              <ModuleTile
                title="Livraisons"
                description="Suivi."
                icon={<Truck size={24} strokeWidth={2.1} />}
                accent="linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(15,41,72,0.08) 100%)"
                action={
                  <SecondaryButton onClick={() => router.push("/employe/livraisons")} style={{ width: "100%", justifyContent: "space-between" }}>
                    <span>Acceder</span>
                    <ArrowUpRight size={16} />
                  </SecondaryButton>
                }
              />
            ) : null}
            {canUseDossiers ? (
              <ModuleTile
                title="Nouveau dossier"
                description="Creation."
                icon={<FileStack size={24} strokeWidth={2.1} />}
                accent="linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(15,41,72,0.08) 100%)"
                action={
                  <PrimaryButton onClick={() => router.push("/employe/dossiers/new")} style={{ width: "100%", justifyContent: "space-between" }}>
                    <span>Creer</span>
                    <ArrowUpRight size={16} />
                  </PrimaryButton>
                }
              />
            ) : null}
            <ModuleTile
              title="Profil"
              description="Securite."
              icon={<ShieldCheck size={24} strokeWidth={2.1} />}
              accent="linear-gradient(135deg, rgba(14,116,144,0.18) 0%, rgba(15,41,72,0.08) 100%)"
              action={
                <SecondaryButton onClick={() => router.push("/employe/profil")} style={{ width: "100%", justifyContent: "space-between" }}>
                  <span>Gerer</span>
                  <ArrowUpRight size={16} />
                </SecondaryButton>
              }
            />
            <ModuleTile
              title="Ameliorations"
              description="Retours."
              icon={<Lightbulb size={24} strokeWidth={2.1} />}
              accent="linear-gradient(135deg, rgba(236,72,153,0.16) 0%, rgba(15,41,72,0.08) 100%)"
              action={
                <SecondaryButton onClick={() => router.push("/ameliorations")} style={{ width: "100%", justifyContent: "space-between" }}>
                  <span>Acceder</span>
                  <ArrowUpRight size={16} />
                </SecondaryButton>
              }
            />
          </div>
        </SectionCard>

        <SectionCard title="Mes dossiers" subtitle="Dossiers terrain.">
          {!canUseDossiers ? (
            <AppCard tone="muted">
              <p className="ui-text-muted" style={{ margin: 0 }}>
                Module masque.
              </p>
            </AppCard>
          ) : dossiers.length === 0 ? (
            <AppCard tone="muted" className="ui-stack-md" style={{ textAlign: "center", padding: "40px 24px" }}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "var(--ui-color-text)",
                }}
              >
                Aucun dossier pour le moment
              </div>
              <p className="ui-text-muted" style={{ margin: 0 }}>
                Creez un dossier.
              </p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <PrimaryButton onClick={() => router.push("/employe/dossiers/new")}>
                  Creer
                </PrimaryButton>
              </div>
            </AppCard>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: "var(--ui-space-4)",
              }}
            >
              {dossiers.map((dossier) => (
                <AppCard
                  key={dossier.id}
                  className="ui-stack-md"
                  style={{
                    minHeight: 420,
                    transition: "transform 160ms ease, box-shadow 160ms ease",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = "translateY(-3px)";
                    event.currentTarget.style.boxShadow = "var(--ui-shadow-lg)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = "translateY(0)";
                    event.currentTarget.style.boxShadow = "var(--ui-shadow-sm)";
                  }}
                >
                  <div className="ui-stack-sm">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div className="ui-stack-xs">
                        <span className="ui-eyebrow">Dossier</span>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 28,
                            lineHeight: 1.05,
                            letterSpacing: "-0.03em",
                            color: "var(--ui-color-primary)",
                          }}
                        >
                          {dossier.nom}
                        </h3>
                      </div>
                      <span
                        style={{
                          ...getStatutStyle(dossier.statut),
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "6px 12px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        {dossier.statut}
                      </span>
                    </div>
                    <InfoRow label="Client" value={dossier.client} />
                    <InfoRow label="Description" value={dossier.description} />
                  </div>

                  <AppCard tone="muted" className="ui-stack-sm">
                    <span className="ui-eyebrow">Resume du dossier</span>
                    <div className="ui-grid-2">
                      <InfoRow label="Notes" value={String(dossier.notesCount)} compact />
                      <InfoRow label="Fichiers joints" value={String(dossier.fichiersCount)} compact />
                      <InfoRow label="Photos" value={String(dossier.photosCount)} compact />
                      <InfoRow label="Videos" value={String(dossier.videosCount)} compact />
                    </div>
                  </AppCard>

                  {dossier.previewUrl ? (
                    <div
                      style={{
                        position: "relative",
                        width: 120,
                        height: 120,
                        border: "1px solid var(--ui-color-border)",
                        borderRadius: "var(--ui-radius-md)",
                        overflow: "hidden",
                        background: "#fff",
                      }}
                    >
                      <Image
                        src={dossier.previewUrl}
                        alt="Apercu dossier"
                        fill
                        unoptimized
                        sizes="120px"
                        style={{ objectFit: "cover", display: "block" }}
                      />
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      gap: "var(--ui-space-3)",
                      flexWrap: "wrap",
                    }}
                  >
                    <PrimaryButton onClick={() => router.push(`/employe/dossiers/${dossier.id}`)}>
                      Acceder
                    </PrimaryButton>
                    <button onClick={() => handleDelete(dossier.id)} className="tagora-btn-danger">
                      Supprimer
                    </button>
                  </div>

                  <select
                    value={dossier.statut}
                    onChange={(e) => handleChangeStatut(dossier.id, e.target.value)}
                    className="tagora-select"
                    style={{ maxWidth: 220 }}
                  >
                    <option value="Nouveau">Nouveau</option>
                    <option value="En cours">En cours</option>
                    <option value="Terminé">Terminé</option>
                  </select>
                </AppCard>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
