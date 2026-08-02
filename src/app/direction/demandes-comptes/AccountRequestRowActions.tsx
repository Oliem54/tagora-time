"use client";

import Link from "next/link";
import { ExternalLink, Link2, Settings2, ShieldOff, ShieldPlus, Trash2 } from "lucide-react";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";
import { isAccessDisabledRequest } from "@/app/lib/account-access";
import { canReconcileExistingAccountRequest } from "@/app/lib/account-reconcile.shared";

export default function AccountRequestRowActions({
  request,
  onManage,
  onDelete,
  onDisableAccess,
  onReactivateAccess,
  onReconcile,
  deleting,
  disabling,
  reactivating,
  reconciling,
  canDelete,
  canManage,
  canManageRoles,
  variant = "full",
  layout = "table",
}: {
  request: AccountAccessRequestRecord;
  onManage: () => void;
  onDelete: () => void;
  onDisableAccess?: () => void;
  onReactivateAccess?: () => void;
  onReconcile?: () => void;
  deleting?: boolean;
  disabling?: boolean;
  reactivating?: boolean;
  reconciling?: boolean;
  canDelete?: boolean;
  canManage?: boolean;
  canManageRoles?: boolean;
  variant?: "full" | "compact";
  layout?: "table" | "mobile";
}) {
  const isMobile = layout === "mobile";
  const accessDisabled = isAccessDisabledRequest(request);
  const hasEmployeeLink = Boolean(request.employee_link?.id);
  const isExistingEmployee = request.employee_link?.status === "existing";
  const showReconcile =
    Boolean(canManageRoles && onReconcile) && canReconcileExistingAccountRequest(request);
  const isCompact = variant === "compact" && !isMobile;

  if (isCompact) {
    return (
      <div className="account-requests-cell-actions account-requests-cell-actions--compact">
        {canManage ? (
          <button
            type="button"
            className="account-requests-action-button account-requests-action-button-primary account-requests-action-button--table-primary"
            onClick={onManage}
          >
            <Settings2 size={13} strokeWidth={2} />
            Gérer
          </button>
        ) : null}
        {showReconcile ? (
          <button
            type="button"
            className="account-requests-action-button account-requests-action-button-text"
            onClick={onReconcile}
            disabled={Boolean(reconciling)}
          >
            {reconciling ? "Réconciliation…" : "Réconcilier"}
          </button>
        ) : null}
      </div>
    );
  }

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
          Gérer
        </button>
      ) : null}
      {showReconcile ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-reconcile"
          onClick={onReconcile}
          disabled={Boolean(reconciling)}
        >
          <Link2 size={13} strokeWidth={2} />
          {reconciling ? "Réconciliation…" : "Réconcilier compte"}
        </button>
      ) : null}
      {canManageRoles && request.status === "active" && !accessDisabled && onDisableAccess ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-danger"
          onClick={onDisableAccess}
          disabled={Boolean(disabling)}
        >
          <ShieldOff size={13} strokeWidth={2} />
          {disabling ? "Désactivation…" : "Désactiver l'accès"}
        </button>
      ) : null}
      {canManageRoles && accessDisabled && onReactivateAccess ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-primary"
          onClick={onReactivateAccess}
          disabled={Boolean(reactivating)}
        >
          <ShieldPlus size={13} strokeWidth={2} />
          {reactivating ? "Réactivation…" : "Réactiver l'accès"}
        </button>
      ) : null}
      {hasEmployeeLink ? (
        <Link
          href={`/direction/ressources/employes/${request.employee_link!.id}`}
          className="account-requests-action-button account-requests-action-button-secondary"
        >
          <ExternalLink size={13} strokeWidth={2} />
          {isExistingEmployee ? "Voir / associer fiche employé" : "Fiche employé"}
        </Link>
      ) : isExistingEmployee ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-secondary"
          onClick={onManage}
          disabled={!canManage}
          title={
            canManage
              ? "Ouvrir la gestion pour lier cette demande à la fiche employé existante."
              : undefined
          }
        >
          <ExternalLink size={13} strokeWidth={2} />
          Lier à cet employé
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          className="account-requests-action-button account-requests-action-button-danger"
          onClick={onDelete}
          disabled={Boolean(deleting)}
          title="Suppression définitive de la demande (administrateur uniquement)."
        >
          <Trash2 size={13} strokeWidth={2} />
          {deleting ? "Suppression…" : "Supprimer la demande"}
        </button>
      ) : null}
    </div>
  );
}
