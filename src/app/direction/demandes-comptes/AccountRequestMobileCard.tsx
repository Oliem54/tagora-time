"use client";

import type { ReactNode } from "react";
import StatusBadge from "@/app/components/ui/StatusBadge";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import type { AccountAccessRequestRecord, AccountAccessStatus } from "@/app/lib/account-access";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import AccountRequestRowActions from "./AccountRequestRowActions";
import EmployeeLinkStatusBadge from "./EmployeeLinkStatusBadge";

type RequestRole = "employe" | "direction" | "admin";

function formatRole(role: RequestRole | string | null | undefined) {
  if (role === "admin") return "Admin";
  if (role === "direction") return "Direction";
  if (role === "employe") return "Employe";
  return "Non defini";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPermissions(values: string[] | null | undefined) {
  return values && values.length > 0
    ? values
        .map((value) => {
          const match = accountRequestPermissionOptions.find((item) => item.value === value);
          return match?.label ?? value;
        })
        .join(", ")
    : "Aucune";
}

function getStatusLabel(status: AccountAccessStatus) {
  if (status === "active") return "Actif";
  if (status === "invited") return "Invite";
  if (status === "refused") return "Refuse";
  if (status === "error") return "Erreur";
  return "En attente";
}

function getStatusTone(status: AccountAccessStatus) {
  if (status === "active") return "success" as const;
  if (status === "invited") return "info" as const;
  if (status === "refused") return "danger" as const;
  if (status === "error") return "warning" as const;
  return "warning" as const;
}

function MobileField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="account-requests-mobile-card__field">
      <span className="account-requests-mobile-card__field-label">{label}</span>
      <div className="account-requests-mobile-card__field-value">{children}</div>
    </div>
  );
}

export default function AccountRequestMobileCard({
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
  const role = (request.assigned_role ?? request.requested_role) as RequestRole;

  return (
    <article className="account-requests-mobile-card">
      <header className="account-requests-mobile-card__head">
        <h3 className="account-requests-mobile-card__name">{request.full_name}</h3>
        <StatusBadge label={getStatusLabel(request.status)} tone={getStatusTone(request.status)} />
      </header>

      <div className="account-requests-mobile-card__fields">
        <MobileField label="Courriel">{request.email}</MobileField>
        <MobileField label="Telephone">{request.phone || "Non fourni"}</MobileField>
        <MobileField label="Portail">{formatRole(request.portal_source)}</MobileField>
        <MobileField label="Role / acces">
          {formatRole(role)}
          <span className="account-requests-mobile-card__sub">
            {formatPermissions(request.assigned_permissions ?? request.requested_permissions)}
          </span>
        </MobileField>
        <MobileField label="Compagnie">
          {getCompanyLabel(request.company as AccountRequestCompany)}
        </MobileField>
        <MobileField label="Compte">
          {request.existing_account?.exists ? "Compte detecte" : "Compte a creer"}
        </MobileField>
        <MobileField label="Fiche employe">
          <EmployeeLinkStatusBadge employeeLink={request.employee_link} />
          {request.employee_link?.id ? (
            <span className="account-requests-mobile-card__sub">#{request.employee_link.id}</span>
          ) : null}
        </MobileField>
        <MobileField label="Derniere connexion">
          <span className="account-requests-mobile-card__date">
            {formatDate(request.existing_account?.lastSignInAt)}
          </span>
        </MobileField>
        <MobileField label="Cree le">
          <span className="account-requests-mobile-card__date">{formatDate(request.created_at)}</span>
        </MobileField>
      </div>

      <footer className="account-requests-mobile-card__actions">
        <AccountRequestRowActions
          layout="mobile"
          request={request}
          onManage={onManage}
          onDelete={onDelete}
          deleting={deleting}
          canDelete={canDelete}
          canManage={canManage}
        />
      </footer>
    </article>
  );
}
