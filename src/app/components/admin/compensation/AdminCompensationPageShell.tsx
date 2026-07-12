"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, LayoutDashboard, Wallet } from "lucide-react";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";

export type AdminCompensationPageShellVariant = "list" | "detail";

const ADMIN_DASHBOARD_HREF = "/admin/dashboard";
const FINANCE_SECTION_HREF = "/admin#admin-section-finance-remuneration";
const LIVRE_HREF = "/admin/compensation/ventes";
const COMMISSIONS_HREF = "/admin/commissions";

type AdminCompensationPageShellProps = {
  variant: AdminCompensationPageShellVariant;
  title: string;
  eventReference?: string | null;
  toolbar?: ReactNode;
  children?: ReactNode;
};

/**
 * Structure DOM obligatoire (deux blocs frères) :
 * 1) header.admin-compensation-brand-header → logo + badge uniquement
 * 2) div.admin-compensation-page-content → breadcrumb + titre + actions + children
 *
 * Le chrome n’est jamais passé à AuthenticatedPageHeader (ni navigation, ni children).
 */
export default function AdminCompensationPageShell({
  variant,
  title,
  eventReference,
  toolbar,
  children,
}: AdminCompensationPageShellProps) {
  const isDetail = variant === "detail";
  const backHref = isDetail ? LIVRE_HREF : FINANCE_SECTION_HREF;
  const backLabel = isDetail ? "Retour au livre" : "Retour";

  return (
    <div className="admin-compensation-page">
      <header className="admin-compensation-brand-header">
        <AuthenticatedPageHeader
          className="ui-page-header-premium-2027 admin-compensation-brand-header__bar"
          showNavigation={false}
          logoAlt="TAGORA Time"
        />
      </header>

      <div className="admin-compensation-page-content">
        <section className="admin-compensation-page-chrome">
          <nav className="admin-compensation-breadcrumb" aria-label="Fil d'Ariane">
            <Link href={ADMIN_DASHBOARD_HREF}>Administration</Link>
            <span className="admin-compensation-breadcrumb-sep" aria-hidden="true">
              /
            </span>
            <Link href={FINANCE_SECTION_HREF}>Finance & rémunération</Link>
            <span className="admin-compensation-breadcrumb-sep" aria-hidden="true">
              /
            </span>
            {isDetail ? (
              <>
                <Link href={LIVRE_HREF}>Livre de commissions</Link>
                <span className="admin-compensation-breadcrumb-sep" aria-hidden="true">
                  /
                </span>
                <span aria-current="page">{eventReference?.trim() || "Détail"}</span>
              </>
            ) : (
              <span aria-current="page">Livre de commissions</span>
            )}
          </nav>

          <div className="admin-compensation-page-chrome__main">
            <h1 className="admin-compensation-page-chrome__title">{title}</h1>

            <div className="admin-compensation-page-chrome__actions">
              <Link
                href={backHref}
                className="tagora-dark-outline-action tagora-page-navigation-button"
              >
                <ArrowLeft size={16} aria-hidden />
                <span>{backLabel}</span>
              </Link>
              <Link
                href={ADMIN_DASHBOARD_HREF}
                className="tagora-dark-action tagora-page-navigation-button"
              >
                <LayoutDashboard size={16} aria-hidden />
                <span>Tableau de bord admin</span>
              </Link>
              <Link
                href={COMMISSIONS_HREF}
                className="tagora-dark-outline-action tagora-page-navigation-button"
              >
                <Wallet size={16} aria-hidden />
                <span>Commissions & objectifs</span>
              </Link>
              {toolbar}
            </div>
          </div>
        </section>

        {children}
      </div>
    </div>
  );
}
