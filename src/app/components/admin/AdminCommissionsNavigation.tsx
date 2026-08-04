"use client";

import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Users } from "lucide-react";
import { CommissionModuleSubnav } from "@/app/admin/commissions/commission-module-ui";

export type AdminCommissionsNavigationVariant =
  | "commissions"
  | "acces-direction"
  | "plans"
  | "result";

const ADMIN_DASHBOARD_HREF = "/admin/dashboard";
const COMMISSIONS_HREF = "/admin/commissions";
const ACCOUNTS_HREF = "/direction/demandes-comptes";

type AdminCommissionsNavigationProps = {
  variant: AdminCommissionsNavigationVariant;
};

function moduleActive(
  variant: AdminCommissionsNavigationVariant
):
  | "dashboard"
  | "objectives"
  | "plans"
  | "results"
  | "pending"
  | "paid"
  | "books" {
  if (variant === "acces-direction") return "books";
  if (variant === "plans") return "plans";
  if (variant === "result") return "results";
  return "dashboard";
}

export default function AdminCommissionsNavigation({
  variant,
}: AdminCommissionsNavigationProps) {
  const isAccessPage = variant === "acces-direction";
  const isPlansPage = variant === "plans" || variant === "result";
  const backHref = isAccessPage || isPlansPage ? COMMISSIONS_HREF : ADMIN_DASHBOARD_HREF;
  const backLabel =
    isAccessPage || isPlansPage ? "Retour au tableau Commissions" : "Retour";

  const breadcrumbCurrent =
    variant === "acces-direction"
      ? "Partage des livres"
      : variant === "plans"
        ? "Plans de rémunération"
        : variant === "result"
          ? "Résultat de commission"
          : "Commissions & objectifs";

  return (
    <div className="admin-commissions-navigation">
      <nav className="admin-commissions-breadcrumb" aria-label="Fil d'Ariane">
        <Link href={ADMIN_DASHBOARD_HREF}>Administration</Link>
        <span className="admin-commissions-breadcrumb-sep" aria-hidden="true">
          /
        </span>
        {variant === "commissions" ? (
          <span aria-current="page">Commissions & objectifs</span>
        ) : (
          <>
            <Link href={COMMISSIONS_HREF}>Commissions</Link>
            <span className="admin-commissions-breadcrumb-sep" aria-hidden="true">
              /
            </span>
            <span aria-current="page">{breadcrumbCurrent}</span>
          </>
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

      <div className="admin-commissions-module-subnav">
        <CommissionModuleSubnav active={moduleActive(variant)} />
      </div>

      <style jsx>{`
        .admin-commissions-navigation {
          display: grid;
          gap: 12px;
        }

        .admin-commissions-breadcrumb {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          line-height: 1.4;
          color: rgba(255, 255, 255, 0.72);
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

        .admin-commissions-module-subnav {
          margin-top: 2px;
        }

        .admin-commissions-module-subnav
          :global(.commission-module-subnav-link) {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.22);
          color: #fff;
        }

        .admin-commissions-module-subnav
          :global(.commission-module-subnav-link.is-active) {
          background: #ffffff;
          border-color: #ffffff;
          color: #0f172a;
        }
      `}</style>
    </div>
  );
}
