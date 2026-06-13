"use client";

import { useMemo } from "react";
import StatusBadge from "@/app/components/ui/StatusBadge";
import {
  getAccountRequestPortalSummaryLabel,
  type AccountAccessRequestRecord,
} from "@/app/lib/account-access";
import {
  buildAccountReconciliationDiagnostic,
  isReconciliationCandidate,
} from "@/app/lib/account-reconcile.shared";
import EmployeeLinkStatusBadge from "./EmployeeLinkStatusBadge";

export default function EmployeeLinkCellContent({
  request,
}: {
  request: AccountAccessRequestRecord;
}) {
  const employeeLink = request.employee_link;
  const diagnostic = useMemo(
    () => buildAccountReconciliationDiagnostic(request),
    [request]
  );
  const showReconcileBadge = isReconciliationCandidate(request);
  const portalSummary = getAccountRequestPortalSummaryLabel(request);

  if (!employeeLink || employeeLink.status === "missing") {
    return (
      <div className="account-requests-cell-employee-stack">
        <StatusBadge label="Fiche employé manquante" tone="warning" />
      </div>
    );
  }

  return (
    <div className="account-requests-cell-employee-stack">
      <div className="account-requests-cell-badge-row">
        <EmployeeLinkStatusBadge employeeLink={employeeLink} />
        {showReconcileBadge ? <StatusBadge label="À réconcilier" tone="warning" /> : null}
      </div>
      {employeeLink.id ? (
        <span className="account-requests-cell-sub">ID employé #{employeeLink.id}</span>
      ) : null}
      <span className="account-requests-cell-sub">
        Compte lié : {diagnostic.authLinkedOnProfile ? "Oui" : "Non"}
      </span>
      {employeeLink.actif === true ? (
        <span className="account-requests-cell-sub">Fiche RH : Active</span>
      ) : employeeLink.actif === false ? (
        <span className="account-requests-cell-sub">Fiche RH : Inactive</span>
      ) : null}
      {portalSummary ? (
        <span className="account-requests-cell-sub account-requests-cell-sub--emphasis">
          {portalSummary}
        </span>
      ) : null}
    </div>
  );
}
