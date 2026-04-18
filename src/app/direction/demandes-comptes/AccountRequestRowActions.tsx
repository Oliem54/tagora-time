"use client";

import Link from "next/link";
import { ExternalLink, PenLine } from "lucide-react";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";

export default function AccountRequestRowActions({
  request,
  onEdit,
}: {
  request: AccountAccessRequestRecord;
  onEdit: () => void;
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
