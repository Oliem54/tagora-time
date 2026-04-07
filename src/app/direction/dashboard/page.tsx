"use client";

import { useRouter } from "next/navigation";
import HeaderTagora from "../../components/HeaderTagora";
import AccessNotice from "../../components/AccessNotice";
import { supabase } from "../../lib/supabase/client";
import { useCurrentAccess } from "../../hooks/useCurrentAccess";

export default function DirectionDashboardPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useCurrentAccess();

  const quickLinks = [
    {
      href: "/direction/documents",
      label: "Documents",
      permission: "documents" as const,
      description: "Consulter les dossiers, photos et pieces partagees.",
    },
    {
      href: "/direction/livraisons",
      label: "Livraisons",
      permission: "livraisons" as const,
      description: "Planifier et suivre les livraisons operationnelles.",
    },
    {
      href: "/direction/terrain",
      label: "Terrain",
      permission: "terrain" as const,
      description: "Acceder aux sorties terrain et au suivi d execution.",
    },
    {
      href: "/direction/demandes-comptes",
      label: "Demandes de comptes",
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
              <div key={item.href} className="tagora-panel" style={{ margin: 0 }}>
                <h3 className="section-title" style={{ marginBottom: 8 }}>{item.label}</h3>
                <p className="tagora-note" style={{ marginBottom: 16 }}>{item.description}</p>
                <button className="tagora-navy-action" onClick={() => router.push(item.href)}>
                  Ouvrir le module
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
