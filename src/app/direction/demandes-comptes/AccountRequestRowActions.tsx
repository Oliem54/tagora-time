"use client";

import Link from "next/link";
import { ExternalLink, PenLine, Trash2 } from "lucide-react";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";

export default function AccountRequestRowActions({
  request,
  onEdit,
  onDelete,
  deleting,
  canDelete,
}: {
  request: AccountAccessRequestRecord;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
  canDelete?: boolean;
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
      <button
        type="button"
        className="account-requests-action-button account-requests-action-button-primary"
        onClick={onEdit}
      >
        <PenLine size={13} strokeWidth={2} />
        Modifier le compte
      </button>
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
          {deleting ? "Suppression..." : "Supprimer la demande"}
        </button>
      ) : null}
      {request.employee_link?.id ? (
        <Link
          href={`/direction/ressources/employes/${request.employee_link.id}`}
          className="account-requests-action-button account-requests-action-button-secondary"
        >
          <ExternalLink size={13} strokeWidth={2} />
          Ouvrir la fiche employe
        </Link>
      ) : null}
    </div>
  );
}
