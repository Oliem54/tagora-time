"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import UserIdentityBadge from "@/app/components/ui/UserIdentityBadge";
import HorodateurDirectionModuleNav, {
  type HorodateurDirectionModuleNavActive,
} from "@/app/direction/horodateur/HorodateurDirectionModuleNav";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import {
  HORORA_LIGHT_ASSET_PATH,
  hororaLogoAlt,
  hororaLogoAriaLabel,
} from "@/app/lib/brand/horora-premium-2027";
import { cn } from "@/app/components/ui/cn";

const PAGE_META: Record<
  HorodateurDirectionModuleNavActive,
  { title: string; crumb: string }
> = {
  live: { title: "Horodateur live", crumb: "Horodateur live" },
  registre: { title: "Registre", crumb: "Registre" },
  quarts: { title: "Quarts passés", crumb: "Quarts passés" },
  paie: { title: "Rapport comptable", crumb: "Rapport comptable" },
};

type HorodateurDirectionPageShellProps = {
  active: HorodateurDirectionModuleNavActive;
  title?: string;
  subtitle?: string;
  status?: ReactNode;
  primaryAction?: ReactNode;
  actions?: ReactNode;
  companyLabel?: string;
  hideWorkspaceHeader?: boolean;
  children: ReactNode;
};

export default function HorodateurDirectionPageShell({
  active,
  title,
  subtitle,
  status,
  primaryAction,
  actions,
  companyLabel,
  hideWorkspaceHeader = false,
  children,
}: HorodateurDirectionPageShellProps) {
  const { user, role, companyAccess } = useCurrentAccess();
  const [navOpen, setNavOpen] = useState(false);
  const meta = PAGE_META[active];
  const heading = title ?? meta.title;

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

  return (
    <div className={cn("horora-direction-shell", navOpen && "is-nav-open")}>
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
              src={HORORA_LIGHT_ASSET_PATH}
              alt={hororaLogoAlt({ nameAlreadyVisible: true })}
              width={1080}
              height={1080}
              priority
            />
          </div>
          <p className="horora-direction-sidebar-product">HORORA</p>
        </div>
        <HorodateurDirectionModuleNav
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
            <Link href="/direction/dashboard">Direction</Link>
            <span aria-hidden="true">/</span>
            <span>Horodateur</span>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{meta.crumb}</span>
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
