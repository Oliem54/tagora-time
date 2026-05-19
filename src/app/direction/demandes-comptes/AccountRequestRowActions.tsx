"use client";

import Link from "next/link";
import { ExternalLink, Settings2, Trash2 } from "lucide-react";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";

export default function AccountRequestRowActions({
  request,
  onManage,
  onDelete,
  deleting,
  canDelete,
  canManage,
  layout = "table",
}: {
  request: AccountAccessRequestRecord;
  onManage: () => void;
  onDelete: () => void;
  deleting?: boolean;
  canDelete?: boolean;
  canManage?: boolean;
  layout?: "table" | "mobile";
}) {
  const isMobile = layout === "mobile";

  return (
    <div
      className={
        isMobile
          ? "account-requests-mobile-actions"
          : "account-requests-cell-actions"
      }
    >
      {canManage ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-primary"
          onClick={onManage}
        >
          <Settings2 size={13} strokeWidth={2} />
          Gerer
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-danger"
          onClick={onDelete}
          disabled={Boolean(deleting)}
        >
          <Trash2 size={13} strokeWidth={2} />
          {deleting ? "Suppression..." : "Supprimer"}
        </button>
      ) : null}
      {request.employee_link?.id ? (
        <Link
          href={`/direction/ressources/employes/${request.employee_link.id}`}
          className="account-requests-action-button account-requests-action-button-secondary"
        >
          <ExternalLink size={13} strokeWidth={2} />
          Fiche employe
        </Link>
      ) : null}
    </div>
  );
}
