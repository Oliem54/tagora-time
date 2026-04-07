"use client";

import { useRouter } from "next/navigation";
import HeaderTagora from "../../components/HeaderTagora";
import AccessNotice from "../../components/AccessNotice";
import { useCurrentAccess } from "../../hooks/useCurrentAccess";

export default function DirectionTerrainPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useCurrentAccess();

  const terrainLinks = [
    {
      href: "/direction/sorties-terrain",
      label: "Sorties terrain",
      description: "Suivre les executions reelles, les kilometres et les temps de route.",
    },
    {
      href: "/direction/temps-titan",
      label: "Temps Titan",
      description: "Consolider les heures, couts et refacturations Titan.",
    },
    {
      href: "/direction/facturation-titan",
      label: "Facturation Titan",
      description: "Verifier les montants a facturer sur la periode.",
    },
  ];

  if (loading) {
    return (
      <div className="page-container">
        <HeaderTagora title="Terrain direction" subtitle="Suivi des operations terrain" />
        <AccessNotice description="Verification des acces terrain en cours." />
      </div>
    );
  }

  if (!user) {
    router.push("/direction/login");
    return null;
  }

  if (!hasPermission("terrain")) {
    return (
      <div className="page-container">
        <HeaderTagora title="Terrain direction" subtitle="Suivi des operations terrain" />
        <AccessNotice description="La permission terrain n est pas active sur ce compte direction. Les modules operationnels restent masques jusqu a attribution de cet acces." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora title="Terrain direction" subtitle="Suivi des operations terrain" />

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Zone terrain</h2>
        <p className="tagora-note" style={{ marginBottom: 18 }}>
          Ce hub reprend les modules relies aux sorties, aux livraisons executees et au suivi Titan, avec les permissions appliquees a la source.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          {terrainLinks.map((item) => (
            <div key={item.href} className="tagora-panel" style={{ margin: 0 }}>
              <h3 className="section-title" style={{ marginBottom: 8 }}>{item.label}</h3>
              <p className="tagora-note" style={{ marginBottom: 16 }}>{item.description}</p>
              <button className="tagora-navy-action" onClick={() => router.push(item.href)}>
                Ouvrir
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
