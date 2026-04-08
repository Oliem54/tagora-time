"use client";

import { useRouter } from "next/navigation";
import HeaderTagora from "../../components/HeaderTagora";
import AccessNotice from "../../components/AccessNotice";
import { supabase } from "../../lib/supabase/client";
import { useCurrentAccess } from "../../hooks/useCurrentAccess";

type QuickLink = {
  href: string;
  label: string;
  actionLabel: string;
  permission: "documents" | "livraisons" | "terrain" | "ressources" | null;
  description: string;
};

export default function DirectionDashboardPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useCurrentAccess();

  const quickLinks: QuickLink[] = [
    {
      href: "/direction/documents",
      label: "Documents",
      actionLabel: "Voir les documents",
      permission: "documents" as const,
      description: "Consulter les dossiers, photos et pieces partagees.",
    },
    {
      href: "/direction/livraisons",
      label: "Livraisons",
      actionLabel: "Gerer les livraisons",
      permission: "livraisons" as const,
      description: "Planifier et suivre les livraisons operationnelles.",
    },
    {
      href: "/direction/terrain",
      label: "Terrain",
      actionLabel: "Acceder au terrain",
      permission: "terrain" as const,
      description: "Acceder aux sorties terrain et au suivi d execution.",
    },
    {
      href: "/direction/sorties-terrain",
      label: "Sorties terrain",
      actionLabel: "Consulter les sorties",
      permission: "terrain" as const,
      description: "Saisir et consulter les sorties terrain detaillees.",
    },
    {
      href: "/direction/temps-titan",
      label: "Temps Titan",
      actionLabel: "Consulter les heures",
      permission: "terrain" as const,
      description: "Suivre les heures terrain refacturables a Titan.",
    },
    {
      href: "/direction/facturation-titan",
      label: "Facturation Titan",
      actionLabel: "Voir la facturation",
      permission: "terrain" as const,
      description: "Consulter la synthese de facturation Titan.",
    },
    {
      href: "/direction/horodateur",
      label: "Horodateur",
      actionLabel: "Superviser les pointages",
      permission: "terrain" as const,
      description: "Suivre les quarts, pauses, sorties et anomalies V1.",
    },
    {
      href: "/direction/ressources",
      label: "Ressources",
      actionLabel: "Gerer les ressources",
      permission: "ressources" as const,
      description: "Gerer employes, vehicules et remorques.",
    },
    {
      href: "/direction/demandes-comptes",
      label: "Demandes de comptes",
      actionLabel: "Traiter les demandes",
      permission: null,
      description: "Traiter les demandes de creation de compte en attente.",
    },
  ];

  const visibleLinks = quickLinks.filter((item) =>
    item.permission ? hasPermission(item.permission) : true
  );

  const hiddenModules = quickLinks.filter(
    (item) => item.permission && !hasPermission(item.permission)
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/direction/login");
  }

  if (loading) {
    return (
      <div className="page-container">
        <HeaderTagora title="Dashboard direction" subtitle="Vue d ensemble et gestion" />
        <AccessNotice description="Verification de la session direction et des permissions actives." />
      </div>
    );
  }

  if (!user) {
    router.push("/direction/login");
    return null;
  }

  return (
    <div className="page-container">
      <HeaderTagora title="Dashboard direction" subtitle="Vue d ensemble et gestion" />

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 8 }}>Session</h2>
            <p className="tagora-note">Connecte comme : {user.email || "direction"}</p>
          </div>
          <button className="tagora-dark-action" onClick={handleLogout}>
            Se deconnecter
          </button>
        </div>
      </div>

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Acces rapide</h2>
        <p className="tagora-note" style={{ marginBottom: 18 }}>
          Les modules visibles ici correspondent aux permissions actuellement actives sur votre compte direction.
        </p>

        {visibleLinks.length === 0 ? (
          <AccessNotice description="Aucun module metier n est encore ouvert sur ce compte. La direction peut toutefois continuer a gerer les demandes de comptes si ce module reste visible." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {visibleLinks.map((item) => (
              <div
                key={item.href}
                className="tagora-panel"
                style={{
                  margin: 0,
                  minHeight: 210,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  border: "1px solid #d9e2ec",
                  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
                }}
              >
                <h3 className="section-title" style={{ marginBottom: 8 }}>{item.label}</h3>
                <p className="tagora-note" style={{ marginBottom: 16 }}>{item.description}</p>
                <button
                  onClick={() => router.push(item.href)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 10px 24px rgba(15, 23, 42, 0.24)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(15, 23, 42, 0.18)";
                  }}
                  style={{
                    width: "100%",
                    minHeight: 44,
                    border: "1px solid #0b1f3a",
                    borderRadius: 12,
                    padding: "11px 14px",
                    background: "linear-gradient(135deg, #0f2948 0%, #1f3b63 100%)",
                    color: "#f8fafc",
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.01em",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
                    boxShadow: "0 6px 16px rgba(15, 23, 42, 0.18)",
                  }}
                >
                  {item.actionLabel}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {hiddenModules.length > 0 ? (
        <div style={{ marginTop: 24 }}>
          <AccessNotice
            title="Modules limites"
            description={`Les modules suivants restent masques sur ce compte : ${hiddenModules.map((item) => item.label).join(", ")}.`}
          />
        </div>
      ) : null}
    </div>
  );
}
