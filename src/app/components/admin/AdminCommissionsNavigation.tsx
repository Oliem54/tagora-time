"use client";

import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Users } from "lucide-react";

export type AdminCommissionsNavigationVariant = "commissions" | "acces-direction";

const ADMIN_DASHBOARD_HREF = "/admin/dashboard";
const COMMISSIONS_HREF = "/admin/commissions";
const ACCOUNTS_HREF = "/direction/demandes-comptes";

type AdminCommissionsNavigationProps = {
  variant: AdminCommissionsNavigationVariant;
};

export default function AdminCommissionsNavigation({
  variant,
}: AdminCommissionsNavigationProps) {
  const isAccessPage = variant === "acces-direction";
  const backHref = isAccessPage ? COMMISSIONS_HREF : ADMIN_DASHBOARD_HREF;
  const backLabel = isAccessPage ? "Commissions & objectifs" : "Retour";

  return (
    <div className="admin-commissions-navigation">
      <nav className="admin-commissions-breadcrumb" aria-label="Fil d'Ariane">
        <Link href={ADMIN_DASHBOARD_HREF}>Administration</Link>
        <span className="admin-commissions-breadcrumb-sep" aria-hidden="true">
          /
        </span>
        {isAccessPage ? (
          <>
            <Link href={COMMISSIONS_HREF}>Commissions</Link>
            <span className="admin-commissions-breadcrumb-sep" aria-hidden="true">
              /
            </span>
            <span aria-current="page">Acces direction</span>
          </>
        ) : (
          <span aria-current="page">Commissions & objectifs</span>
        )}
      </nav>

      <div className="tagora-page-navigation-actions">
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
          href={ACCOUNTS_HREF}
          className="tagora-dark-outline-action tagora-page-navigation-button"
        >
          <Users size={16} aria-hidden />
          <span>Gestion des comptes</span>
        </Link>
      </div>

      <style jsx>{`
        .admin-commissions-navigation {
          display: grid;
          gap: 10px;
        }

        .admin-commissions-breadcrumb {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          line-height: 1.4;
          color: rgba(255, 255, 255, 0.78);
        }

        .admin-commissions-breadcrumb :global(a) {
          color: rgba(255, 255, 255, 0.92);
          text-decoration: none;
          font-weight: 600;
        }

        .admin-commissions-breadcrumb :global(a:hover) {
          text-decoration: underline;
        }

        .admin-commissions-breadcrumb-sep {
          opacity: 0.55;
        }

        .admin-commissions-breadcrumb [aria-current="page"] {
          color: rgba(255, 255, 255, 0.62);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
