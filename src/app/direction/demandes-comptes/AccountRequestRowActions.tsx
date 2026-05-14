"use client";

import Link from "next/link";
import { ExternalLink, PenLine, Pencil, Trash2 } from "lucide-react";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";

export default function AccountRequestRowActions({
  request,
  onEditRequestDetails,
  onEditAccountAccess,
  onDelete,
  deleting,
  canDelete,
  canEditRequestDetails,
  canEditAccountAccess,
}: {
  request: AccountAccessRequestRecord;
  onEditRequestDetails: () => void;
  onEditAccountAccess: () => void;
  onDelete: () => void;
  deleting?: boolean;
  canDelete?: boolean;
  canEditRequestDetails?: boolean;
  canEditAccountAccess?: boolean;
}) {
  const showDetails =
    Boolean(canEditRequestDetails) &&
    (request.status === "pending" || request.status === "error");

  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        justifyItems: "end",
        alignItems: "center",
      }}
    >
      {showDetails ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-primary"
          onClick={onEditRequestDetails}
        >
          <Pencil size={13} strokeWidth={2} />
          Modifier
        </button>
      ) : null}
      {canEditAccountAccess ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-secondary"
          onClick={onEditAccountAccess}
        >
          <PenLine size={13} strokeWidth={2} />
          Accès et approbation
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
