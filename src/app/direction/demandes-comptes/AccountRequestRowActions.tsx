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
}: {
  request: AccountAccessRequestRecord;
  onManage: () => void;
  onDelete: () => void;
  deleting?: boolean;
  canDelete?: boolean;
  canManage?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        justifyItems: "end",
        alignItems: "center",
      }}
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
          className="account-requests-action-button"
          onClick={onDelete}
          disabled={Boolean(deleting)}
          style={{
            borderColor: "rgba(185, 28, 28, 0.3)",
            color: "#b91c1c",
            background: "rgba(254, 242, 242, 0.92)",
          }}
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
