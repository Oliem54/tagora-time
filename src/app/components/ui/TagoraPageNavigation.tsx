"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, LayoutDashboard } from "lucide-react";
import type { AppRole } from "@/app/lib/auth/roles";

type BreadcrumbItem = {
  href?: string;
  label: string;
  current?: boolean;
};

const AREA_CONFIG = {
  direction: {
    dashboardHref: "/direction/dashboard",
    dashboardLabel: "Dashboard Direction",
  },
  employe: {
    dashboardHref: "/employe/dashboard",
    dashboardLabel: "Dashboard Employe",
  },
} as const;

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  ressources: "Ressources",
  employes: "Employes",
  "bases-gps": "Bases GPS",
  vehicules: "Vehicules",
  remorques: "Remorques",
  terrain: "Terrain",
  livraisons: "Livraisons",
  "sorties-terrain": "Sorties terrain",
  horodateur: "Horodateur",
  documents: "Documents",
  profil: "Profil",
  dossiers: "Dossiers",
  "mot-de-passe": "Mot de passe",
  demandes: "Demandes",
  "demandes-comptes": "Demandes de comptes",
  "temps-titan": "Temps Titan",
  "facturation-titan": "Facturation Titan",
  paie: "Paie",
  "paie-compagnies": "Paie compagnies",
  nouveau: "Nouveau",
  new: "Nouveau",
};

function getAreaFromPath(pathname: string): AppRole | null {
  if (pathname.startsWith("/direction")) {
    return "direction";
  }

  if (pathname.startsWith("/employe")) {
    return "employe";
  }

  return null;
}

function humanizeSegment(segment: string) {
  const normalized = segment.replace(/-/g, " ").trim();

  if (!normalized) {
    return "Page";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getSegmentLabel(
  area: AppRole,
  segment: string,
  previousSegment?: string
) {
  if (/^\d+$/.test(segment)) {
    if (previousSegment === "employes") return "Fiche employe";
    if (previousSegment === "dossiers") return "Dossier";
    return "Detail";
  }

  if (segment === "nouveau" || segment === "new") {
    if (area === "direction" && previousSegment === "employes") {
      return "Nouvel employe";
    }

    return "Nouveau";
  }

  return SEGMENT_LABELS[segment] ?? humanizeSegment(segment);
}

function buildBreadcrumbs(area: AppRole, pathname: string): BreadcrumbItem[] {
  const { dashboardHref, dashboardLabel } = AREA_CONFIG[area];
  const segments = pathname.split("/").filter(Boolean).slice(1);
  const breadcrumbs: BreadcrumbItem[] = [
    {
      href: pathname === dashboardHref ? undefined : dashboardHref,
      label: dashboardLabel,
      current: pathname === dashboardHref,
    },
  ];

  if (segments.length === 0 || segments[0] === "dashboard") {
    return breadcrumbs;
  }

  let href = `/${area}`;

  segments.forEach((segment, index) => {
    href += `/${segment}`;

    breadcrumbs.push({
      href: index === segments.length - 1 ? undefined : href,
      label: getSegmentLabel(area, segment, segments[index - 1]),
      current: index === segments.length - 1,
    });
  });

  return breadcrumbs;
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

    if (pathname.startsWith("/direction/sorties-terrain")) {
      return livraisonId ? "/direction/livraisons" : dashboardHref;
    }

    return pathname === dashboardHref ? "/direction" : dashboardHref;
  }

  if (pathname === "/employe/documents/new") {
    return "/employe/documents";
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
  const breadcrumbs = buildBreadcrumbs(area, pathname);
  const backHref = getBackHref(
    area,
    pathname,
    searchParams.get("livraison_id")
  );
  const dashboardIsCurrent = pathname === dashboardHref;

  return (
    <div className="tagora-page-navigation">
      <div className="tagora-page-navigation-breadcrumbs">
        {breadcrumbs.map((item, index) => (
          <span
            key={`${item.label}-${index}`}
            className="tagora-page-navigation-crumb"
          >
            {index > 0 ? (
              <ChevronRight
                size={14}
                className="tagora-page-navigation-separator"
              />
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="tagora-page-navigation-link"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current={item.current ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </span>
        ))}
      </div>

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
