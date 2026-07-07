"use client";

import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Wallet } from "lucide-react";

export type AdminCompensationNavigationVariant = "list" | "detail";

const ADMIN_DASHBOARD_HREF = "/admin/dashboard";
const REMUNERATION_HREF = "/admin/remuneration";
const COMPENSATION_LIST_HREF = "/admin/compensation/ventes";

type AdminCompensationNavigationProps = {
  variant: AdminCompensationNavigationVariant;
  eventReference?: string | null;
};

export default function AdminCompensationNavigation({
  variant,
  eventReference,
}: AdminCompensationNavigationProps) {
  const isDetail = variant === "detail";

  return (
    <div className="admin-compensation-navigation">
      <nav className="admin-compensation-breadcrumb" aria-label="Fil d'Ariane">
        <Link href={ADMIN_DASHBOARD_HREF}>Administration</Link>
        <span className="admin-compensation-breadcrumb-sep" aria-hidden="true">
          /
        </span>
        <Link href={REMUNERATION_HREF}>Finance & remuneration</Link>
        <span className="admin-compensation-breadcrumb-sep" aria-hidden="true">
          /
        </span>
        {isDetail ? (
          <>
            <Link href={COMPENSATION_LIST_HREF}>Compensation</Link>
            <span className="admin-compensation-breadcrumb-sep" aria-hidden="true">
              /
            </span>
            <span aria-current="page">{eventReference ?? "Detail vente"}</span>
          </>
        ) : (
          <span aria-current="page">Compensation</span>
        )}
      </nav>

      <div className="tagora-page-navigation-actions">
        <Link
          href={isDetail ? COMPENSATION_LIST_HREF : REMUNERATION_HREF}
          className="tagora-dark-outline-action tagora-page-navigation-button"
        >
          <ArrowLeft size={16} aria-hidden />
          <span>{isDetail ? "Retour aux ventes" : "Finance & remuneration"}</span>
        </Link>

        <Link
          href={ADMIN_DASHBOARD_HREF}
          className="tagora-dark-action tagora-page-navigation-button"
        >
          <LayoutDashboard size={16} aria-hidden />
          <span>Tableau de bord admin</span>
        </Link>

        <Link
          href={COMPENSATION_LIST_HREF}
          className="tagora-dark-outline-action tagora-page-navigation-button"
        >
          <Wallet size={16} aria-hidden />
          <span>Ventes compensation</span>
        </Link>
      </div>
    </div>
  );
}
