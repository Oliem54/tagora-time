"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  getDashboardLabelForRole,
  getDashboardPathForRole,
  type AppRole,
} from "@/app/lib/auth/roles";

function getAreaFromPath(pathname: string): AppRole | null {
  if (pathname.startsWith("/admin")) {
    return "admin";
  }
  /** Module améliorations : route racine hors `/admin/*`, réservé aux admins (AuthGate / garde client). */
  if (pathname === "/ameliorations" || pathname.startsWith("/ameliorations/")) {
    return "admin";
  }
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
  livraisonId: string | null,
  roleDashboardHref: string,
  userRole: AppRole | null
) {
  const dashboardHref = roleDashboardHref;

  if (area === "admin") {
    return pathname === dashboardHref ? "/admin" : dashboardHref;
  }

  if (area === "direction") {
    if (pathname.startsWith("/direction/commissions/livres/")) {
      return "/direction/commissions";
    }

    if (pathname === "/direction/commissions") {
      if (userRole === "admin") {
        return "/admin/commissions";
      }
      return "/direction/dashboard";
    }

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

    if (pathname === "/direction/effectifs") {
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

  if (pathname === "/employe/mon-livre") {
    return "/employe/dashboard";
  }

  return pathname === dashboardHref ? "/employe" : dashboardHref;
}

function getDashboardLink(
  pathname: string,
  userRole: AppRole | null,
  area: AppRole
): { href: string; label: string } {
  const role = userRole ?? area;

  if (
    area === "direction" &&
    (pathname === "/direction/commissions" || pathname.startsWith("/direction/commissions/livres/"))
  ) {
    if (role === "admin") {
      return { href: "/admin/dashboard", label: "Administration" };
    }
    return { href: "/direction/dashboard", label: "Tableau de bord direction" };
  }

  return {
    href: getDashboardPathForRole(role),
    label: getDashboardLabelForRole(role),
  };
}

export default function TagoraPageNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { role: userRole } = useCurrentAccess();

  if (!pathname) {
    return null;
  }

  const area = getAreaFromPath(pathname);

  if (!area || pathname === `/${area}` || pathname === `/${area}/login`) {
    return null;
  }

  const dashboardLink = getDashboardLink(pathname, userRole, area);
  const dashboardHref = dashboardLink.href;
  const dashboardLabel = dashboardLink.label;
  const backHref = getBackHref(
    area,
    pathname,
    searchParams.get("livraison_id"),
    userRole ? getDashboardPathForRole(userRole) : getDashboardPathForRole(area),
    userRole
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
