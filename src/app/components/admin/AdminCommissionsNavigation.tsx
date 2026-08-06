"use client";

import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { CommissionModuleSubnav } from "@/app/admin/commissions/commission-module-ui";
import { withOrganizationId } from "@/app/lib/commissions/pay-plan-organization-context.shared";

export type AdminCommissionsNavigationVariant =
  | "commissions"
  | "acces-direction"
  | "plans"
  | "result";

const ADMIN_DASHBOARD_HREF = "/admin/dashboard";
const COMMISSIONS_HREF = "/admin/commissions";

type AdminCommissionsNavigationProps = {
  variant: AdminCommissionsNavigationVariant;
  organizationId?: string | null;
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
  organizationId = "",
}: AdminCommissionsNavigationProps) {
  const isHub = variant === "commissions";
  const commissionsHref = withOrganizationId(COMMISSIONS_HREF, organizationId);

  return (
    <div className="admin-commissions-navigation">
      <div className="tagora-page-navigation-actions admin-commissions-nav-actions">
        {!isHub ? (
          <Link
            href={commissionsHref}
            className="tagora-dark-outline-action tagora-page-navigation-button"
          >
            <ArrowLeft size={16} aria-hidden />
            <span>Commissions</span>
          </Link>
        ) : null}

        <Link
          href={ADMIN_DASHBOARD_HREF}
          className="tagora-dark-outline-action tagora-page-navigation-button"
        >
          <LayoutDashboard size={16} aria-hidden />
          <span>Admin</span>
        </Link>
      </div>

      <div className="admin-commissions-module-subnav">
        <CommissionModuleSubnav
          active={moduleActive(variant)}
          organizationId={organizationId}
        />
      </div>

      <style jsx>{`
        .admin-commissions-navigation {
          display: grid;
          gap: 12px;
        }

        .admin-commissions-nav-actions {
          gap: 10px;
        }

        .admin-commissions-nav-actions :global(.tagora-page-navigation-button) {
          min-height: 40px;
          padding: 0.55rem 1rem;
          font-size: 0.875rem;
          font-weight: 650;
        }

        .admin-commissions-module-subnav :global(.commission-module-subnav) {
          margin-top: 0;
          gap: 8px;
        }

        .admin-commissions-module-subnav
          :global(.commission-module-subnav-link) {
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.18);
          color: rgba(255, 255, 255, 0.92);
          font-size: 13px;
          font-weight: 650;
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
