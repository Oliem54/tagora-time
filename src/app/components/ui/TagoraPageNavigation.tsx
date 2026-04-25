"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import type { AppRole } from "@/app/lib/auth/roles";

const AREA_CONFIG = {
  direction: {
    dashboardHref: "/direction/dashboard",
    dashboardLabel: "Tableau de bord direction",
  },
  employe: {
    dashboardHref: "/employe/dashboard",
    dashboardLabel: "Tableau de bord employe",
  },
} as const;

function getAreaFromPath(pathname: string): AppRole | null {
  if (pathname.startsWith("/direction")) {
    return "direction";
  }

  if (pathname.startsWith("/employe")) {
    return "employe";
  }

  return null;
}

function getBackHref(
  area: AppRole,
  pathname: string,
  livraisonId: string | null
) {
  const { dashboardHref } = AREA_CONFIG[area];

  if (area === "direction") {
    if (
      pathname.startsWith("/direction/ressources/employes/") ||
      pathname === "/direction/ressources/employes/nouveau"
    ) {
      return "/direction/ressources/employes";
    }

    if (
      pathname === "/direction/ressources/employes" ||
      pathname === "/direction/ressources/bases-gps" ||
      pathname === "/direction/ressources/vehicules" ||
      pathname === "/direction/ressources/remorques"
    ) {
      return "/direction/ressources";
    }

    if (pathname.startsWith("/direction/ressources")) {
      return dashboardHref;
    }

    if (pathname === "/direction/terrain/new") {
      return "/direction/terrain";
    }

    if (pathname === "/direction/sav") {
      return "/direction/livraisons";
    }

    if (pathname === "/direction/ramassages") {
      return "/direction/livraisons";
    }

    if (pathname === "/direction/livraisons") {
      return dashboardHref;
    }

    if (pathname.startsWith("/direction/sorties-terrain")) {
      return livraisonId ? "/direction/livraisons" : "/direction/terrain";
    }

    return pathname === dashboardHref ? "/direction" : dashboardHref;
  }

  if (pathname === "/employe/documents/new") {
    return "/employe/documents";
  }

  if (pathname.startsWith("/employe/dossiers/")) {
    return "/employe/terrain";
  }

  if (pathname === "/employe/livraisons") {
    return "/employe/dashboard";
  }

  return pathname === dashboardHref ? "/employe" : dashboardHref;
}

export default function TagoraPageNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!pathname) {
    return null;
  }

  const area = getAreaFromPath(pathname);

  if (!area || pathname === `/${area}` || pathname === `/${area}/login`) {
    return null;
  }

  const { dashboardHref, dashboardLabel } = AREA_CONFIG[area];
  const backHref = getBackHref(
    area,
    pathname,
    searchParams.get("livraison_id")
  );
  const dashboardIsCurrent = pathname === dashboardHref;

  return (
    <div className="tagora-page-navigation">
      <div className="tagora-page-navigation-actions">
        <Link href={backHref} className="tagora-dark-outline-action tagora-page-navigation-button">
          <ArrowLeft size={16} />
          <span>Retour</span>
        </Link>

        <Link
          href={dashboardHref}
          className={`tagora-page-navigation-button ${
            dashboardIsCurrent ? "tagora-dark-outline-action" : "tagora-dark-action"
          }`}
          aria-current={dashboardIsCurrent ? "page" : undefined}
        >
          <LayoutDashboard size={16} />
          <span>{dashboardLabel}</span>
        </Link>
      </div>
    </div>
  );
}
