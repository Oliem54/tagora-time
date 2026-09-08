"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import UserIdentityBadge from "@/app/components/ui/UserIdentityBadge";
import HororaAppNav from "@/app/components/horora/HororaAppNav";
import {
  hororaWorkspaceHome,
  hororaWorkspaceLabel,
  type HororaNavId,
  type HororaWorkspace,
} from "@/app/components/horora/horora-nav";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import {
  HORORA_LIGHT_ASSET_PATH,
  hororaLogoAlt,
  hororaLogoAriaLabel,
} from "@/app/lib/brand/horora-premium-2027";
import { cn } from "@/app/components/ui/cn";

const PAGE_CRUMB: Partial<Record<HororaNavId, string>> = {
  dashboard: "Tableau de bord",
  punch: "Pointage",
  profil: "Profil",
  live: "Horodateur live",
  registre: "Registre",
  quarts: "Quarts passés",
  paie: "Rapport comptable",
  effectifs: "Effectifs",
  comptes: "Comptes",
  employes: "Employés",
};

type HororaAppShellProps = {
  workspace: HororaWorkspace;
  active: HororaNavId;
  title?: string;
  subtitle?: string;
  status?: ReactNode;
  primaryAction?: ReactNode;
  actions?: ReactNode;
  companyLabel?: string;
  hideWorkspaceHeader?: boolean;
  logoSrc?: string;
  logoAlt?: string;
  children: ReactNode;
};

export default function HororaAppShell({
  workspace,
  active,
  title,
  subtitle,
  status,
  primaryAction,
  actions,
  companyLabel,
  hideWorkspaceHeader = false,
  logoSrc,
  logoAlt,
  children,
}: HororaAppShellProps) {
  const { user, role, companyAccess } = useCurrentAccess();
  const [navOpen, setNavOpen] = useState(false);
  const heading = title ?? PAGE_CRUMB[active] ?? "HORORA";
  const crumb = PAGE_CRUMB[active] ?? heading;
  const workspaceLabel = hororaWorkspaceLabel(workspace);
  const homeHref = hororaWorkspaceHome(workspace);

  const resolvedCompany = useMemo(() => {
    if (companyLabel) return companyLabel;
    const company = companyAccess.company ?? companyAccess.primaryCompany;
    return company ? getCompanyLabel(company) : null;
  }, [companyAccess.company, companyAccess.primaryCompany, companyLabel]);

  const roleLabel =
    role === "employe"
      ? "Employé"
      : role === "direction"
        ? "Direction"
        : role === "admin"
          ? "Admin"
          : "Rôle non défini";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [active]);

  const markSrc = logoSrc ?? HORORA_LIGHT_ASSET_PATH;
  const markAlt =
    logoAlt !== undefined ? logoAlt : hororaLogoAlt({ nameAlreadyVisible: true });

  return (
    <div
      className={cn(
        "horora-app-shell",
        "horora-direction-shell",
        navOpen && "is-nav-open"
      )}
    >
      {navOpen ? (
        <button
          type="button"
          className="horora-direction-shell-scrim"
          aria-label="Fermer le menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        id="horora-direction-sidebar-nav"
        className={cn("horora-direction-sidebar", navOpen && "is-open")}
        aria-label="Navigation HORORA"
      >
        <div
          className="horora-direction-sidebar-brand"
          aria-label={hororaLogoAriaLabel({ logoIsSoleIdentity: true })}
        >
          <div className="horora-direction-sidebar-logo">
            <Image
              src={markSrc}
              alt={markAlt}
              width={1080}
              height={1080}
              priority
            />
          </div>
        </div>
        <HororaAppNav
          workspace={workspace}
          active={active}
          variant="sidebar"
          onNavigate={() => setNavOpen(false)}
        />
      </aside>

      <div className="horora-direction-frame">
        <header className="horora-direction-topbar">
          <button
            type="button"
            className="horora-direction-menu-toggle"
            aria-expanded={navOpen}
            aria-controls="horora-direction-sidebar-nav"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
            <span>{navOpen ? "Fermer" : "Menu"}</span>
          </button>

          <nav className="horora-direction-breadcrumb" aria-label="Fil d'Ariane">
            <Link href={homeHref}>{workspaceLabel}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{crumb}</span>
          </nav>

          <div className="horora-direction-topbar-meta">
            {resolvedCompany ? (
              <p className="horora-direction-company">
                <span>Entreprise</span>
                <strong>{resolvedCompany}</strong>
              </p>
            ) : null}
            {user?.email ? (
              <UserIdentityBadge
                value={user.email}
                roleLabel={roleLabel}
                role={role}
                className="horora-direction-account"
              />
            ) : null}
            {actions ? (
              <div className="horora-direction-topbar-actions">{actions}</div>
            ) : null}
          </div>
        </header>

        <main className="horora-direction-workspace">
          {hideWorkspaceHeader ? null : (
            <header className="horora-direction-pagehead">
              <div className="horora-direction-pagehead-copy">
                <h1>{heading}</h1>
                {subtitle ? <p>{subtitle}</p> : null}
              </div>
              {status || primaryAction ? (
                <div className="horora-direction-pagehead-aside">
                  {status}
                  {primaryAction}
                </div>
              ) : null}
            </header>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
