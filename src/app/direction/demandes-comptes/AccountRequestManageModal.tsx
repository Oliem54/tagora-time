"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, KeyRound, Mail, Shield, UserRound } from "lucide-react";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import {
  type AccountAccessAction,
  type AccountAccessRequestRecord,
  type AccountAccessStatus,
} from "@/app/lib/account-access";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { getPasswordPolicyMessage } from "@/app/lib/auth/passwords";
import EmployeeLinkStatusBadge from "./EmployeeLinkStatusBadge";

type RequestRole = "employe" | "direction" | "admin";

export type AccountSecurityAction =
  | "reset_password"
  | "send_reset_link"
  | "set_temporary_password";

type ActionConfig = {
  action: AccountAccessAction;
  label: string;
  tone: "primary" | "secondary" | "danger";
};

export type ManageIdentityPayload = {
  fullName: string;
  email: string;
  phone: string;
  company: AccountRequestCompany;
  requestedRole: "employe" | "direction";
  requestedPermissions: string[];
  message: string;
};

function formatRole(role: RequestRole | null | undefined) {
  if (role === "admin") return "Admin";
  if (role === "direction") return "Direction";
  if (role === "employe") return "Employe";
  return "Non defini";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusLabel(status: AccountAccessStatus) {
  if (status === "active") return "Actif";
  if (status === "invited") return "Invite";
  if (status === "refused") return "Refuse";
  if (status === "error") return "Erreur";
  return "En attente";
}

function getPrimaryActionForStatus(status: AccountAccessStatus): ActionConfig | null {
  if (status === "pending") {
    return { action: "approve", label: "Approuver", tone: "primary" };
  }
  if (status === "invited" || status === "active") {
    return { action: "update_access", label: "Enregistrer les acces", tone: "primary" };
  }
  return null;
}

function getSecondaryActionsForStatus(status: AccountAccessStatus): ActionConfig[] {
  if (status === "invited") {
    return [
      { action: "resend_invitation", label: "Renvoyer l invitation", tone: "secondary" },
      { action: "reset_pending", label: "Remettre en attente", tone: "secondary" },
    ];
  }
  if (status === "active") {
    return [{ action: "disable_access", label: "Desactiver l acces", tone: "danger" }];
  }
  if (status === "refused") {
    return [{ action: "reset_pending", label: "Remettre en attente", tone: "secondary" }];
  }
  if (status === "error") {
    return [
      { action: "retry", label: "Relancer", tone: "secondary" },
      { action: "reset_pending", label: "Remettre en attente", tone: "secondary" },
    ];
  }
  return [{ action: "refuse", label: "Refuser", tone: "danger" }];
}

function getButtonClassName(tone: ActionConfig["tone"]) {
  if (tone === "danger") return "tagora-btn-danger";
  if (tone === "secondary") return "tagora-dark-outline-action";
  return "tagora-dark-action";
}

function ManageSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="tagora-panel-muted ui-stack-sm" style={{ padding: 16, borderRadius: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "#173d75", display: "flex" }}>{icon}</span>
        <h3 className="section-title" style={{ margin: 0, fontSize: 15 }}>
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

export default function AccountRequestManageModal({
  request,
  open,
  onClose,
  canManageRoles,
  canEditDetails,
  permissionOptions,
  assignedRole,
  assignedPermissions,
  reviewNote,
  confirmOverwriteExistingAccount,
  savingAction,
  savingDetails,
  securityAction,
  onRoleChange,
  onReviewNoteChange,
  onTogglePermission,
  onConfirmOverwriteChange,
  onSaveIdentity,
  onRunAction,
  onRunSecurityAction,
  onDelete,
  deleting,
}: {
  request: AccountAccessRequestRecord | null;
  open: boolean;
  onClose: () => void;
  canManageRoles: boolean;
  canEditDetails: boolean;
  permissionOptions: Array<{ value: string; label: string }>;
  assignedRole: RequestRole;
  assignedPermissions: string[];
  reviewNote: string;
  confirmOverwriteExistingAccount: boolean;
  savingAction: AccountAccessAction | null;
  savingDetails: boolean;
  securityAction: AccountSecurityAction | null;
  onRoleChange: (role: RequestRole) => void;
  onReviewNoteChange: (value: string) => void;
  onTogglePermission: (permission: string) => void;
  onConfirmOverwriteChange: () => void;
  onSaveIdentity: (payload: ManageIdentityPayload) => Promise<void>;
  onRunAction: (action: AccountAccessAction) => void;
  onRunSecurityAction: (action: AccountSecurityAction, temporaryPassword?: string) => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState<AccountRequestCompany>("oliem_solutions");
  const [requestedRole, setRequestedRole] = useState<"employe" | "direction">("employe");
  const [requestedPermissions, setRequestedPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");

  useEffect(() => {
    if (!open || !request) return;
    setFullName(request.full_name ?? "");
    setEmail(request.email ?? "");
    setPhone(request.phone ?? "");
    setCompany((request.company as AccountRequestCompany) ?? "oliem_solutions");
    setRequestedRole(request.requested_role === "direction" ? "direction" : "employe");
    setRequestedPermissions(
      Array.isArray(request.requested_permissions) ? [...request.requested_permissions] : []
    );
    setMessage(request.message ?? "");
    setTemporaryPassword("");
    setConfirmTemporaryPassword("");
  }, [open, request]);

  if (!open || !request) {
    return null;
  }

  const primaryAction = getPrimaryActionForStatus(request.status);
  const secondaryActions = getSecondaryActionsForStatus(request.status);
  const hasAuthAccount = Boolean(request.existing_account?.exists || request.invited_user_id);
  const canUsePasswordActions = canManageRoles && hasAuthAccount;
  const permissionChoices =
    permissionOptions.length > 0 ? permissionOptions : accountRequestPermissionOptions;
  const busy = Boolean(savingAction || savingDetails || securityAction);

  function toggleRequestedPermission(slug: string) {
    setRequestedPermissions((prev) =>
      prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug]
    );
  }

  async function handleIdentitySubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEditDetails) return;
    await onSaveIdentity({
      fullName,
      email,
      phone,
      company,
      requestedRole,
      requestedPermissions,
      message,
    });
  }

  function handleSetTemporaryPassword() {
    if (temporaryPassword !== confirmTemporaryPassword) return;
    onRunSecurityAction("set_temporary_password", temporaryPassword);
  }

  return (
    <ModalOverlay onClose={onClose} busy={busy}>
      <div
        className="tagora-panel ui-stack-md"
        style={{
          position: "relative",
          width: "min(720px, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: 22,
          borderRadius: 16,
          boxShadow: "0 18px 48px rgba(15,23,42,0.18)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div>
            <div className="tagora-label">Gerer le compte</div>
            <h2 className="section-title" style={{ margin: "4px 0 0" }}>
              {request.full_name}
            </h2>
          </div>
          <button
            type="button"
            className="tagora-dark-outline-action"
            onClick={onClose}
            disabled={busy}
            style={{ height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
          >
            Fermer
          </button>
        </div>

        <p className="tagora-note" style={{ margin: 0 }}>
          {request.email} · Statut : {getStatusLabel(request.status)} · Portail :{" "}
          {formatRole(request.portal_source as RequestRole)} · {getCompanyLabel(request.company)}
        </p>

        <form onSubmit={(e) => void handleIdentitySubmit(e)} className="ui-stack-md">
          <ManageSection title="Identite" icon={<UserRound size={16} />}>
            <div className="tagora-form-grid">
              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Nom complet</span>
                <input
                  className="tagora-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={!canEditDetails || savingDetails}
                  required
                />
              </label>
              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Courriel</span>
                <input
                  className="tagora-input"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!canEditDetails || savingDetails}
                  required
                />
              </label>
              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Telephone</span>
                <input
                  className="tagora-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!canEditDetails || savingDetails}
                />
              </label>
              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Compagnie</span>
                <select
                  className="tagora-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value as AccountRequestCompany)}
                  disabled={!canEditDetails || savingDetails}
                >
                  {ACCOUNT_REQUEST_COMPANIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Role demande (portail)</span>
                <select
                  className="tagora-input"
                  value={requestedRole}
                  onChange={(e) =>
                    setRequestedRole(e.target.value === "direction" ? "direction" : "employe")
                  }
                  disabled={!canEditDetails || savingDetails}
                >
                  <option value="employe">Employe</option>
                  <option value="direction">Direction</option>
                </select>
              </label>
              <div className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Permissions demandees</span>
                <div className="tagora-panel-muted account-requests-permissions" style={{ marginTop: 6 }}>
                  {permissionChoices.map((option) => (
                    <label key={option.value} className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={requestedPermissions.includes(option.value)}
                        onChange={() => toggleRequestedPermission(option.value)}
                        disabled={!canEditDetails || savingDetails}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Message</span>
                <textarea
                  className="tagora-textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={!canEditDetails || savingDetails}
                  rows={2}
                />
              </label>
            </div>
            {canEditDetails ? (
              <button type="submit" className="tagora-dark-action" disabled={savingDetails}>
                {savingDetails ? "Enregistrement..." : "Enregistrer l identite"}
              </button>
            ) : (
              <p className="tagora-note" style={{ margin: 0 }}>
                Modification reservee a la direction ou aux administrateurs.
              </p>
            )}
          </ManageSection>
        </form>

        <ManageSection title="Acces et permissions" icon={<Shield size={16} />}>
          {canManageRoles ? (
            <>
              <div className="tagora-form-grid">
                <label className="tagora-field">
                  <span className="tagora-label">Role assigne</span>
                  <select
                    className="tagora-input"
                    value={assignedRole}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "direction") onRoleChange("direction");
                      else if (v === "admin") onRoleChange("admin");
                      else onRoleChange("employe");
                    }}
                    disabled={Boolean(savingAction)}
                  >
                    <option value="employe">Employe</option>
                    <option value="direction">Direction</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Note admin</span>
                  <textarea
                    className="tagora-textarea"
                    value={reviewNote}
                    onChange={(e) => onReviewNoteChange(e.target.value)}
                    disabled={Boolean(savingAction)}
                    rows={2}
                  />
                </label>
              </div>
              <div className="tagora-panel-muted account-requests-permissions">
                {permissionChoices.map((option) => (
                  <label key={option.value} className="account-requests-permission-option">
                    <input
                      type="checkbox"
                      checked={assignedPermissions.includes(option.value)}
                      onChange={() => onTogglePermission(option.value)}
                      disabled={Boolean(savingAction)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              {request.existing_account?.exists ? (
                <label className="account-requests-permission-option">
                  <input
                    type="checkbox"
                    checked={confirmOverwriteExistingAccount}
                    onChange={onConfirmOverwriteChange}
                    disabled={Boolean(savingAction)}
                  />
                  <span>Autoriser le remplacement des acces existants</span>
                </label>
              ) : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {primaryAction ? (
                  <button
                    type="button"
                    className={getButtonClassName(primaryAction.tone)}
                    onClick={() => onRunAction(primaryAction.action)}
                    disabled={Boolean(savingAction)}
                  >
                    {savingAction === primaryAction.action ? "Traitement..." : primaryAction.label}
                  </button>
                ) : null}
                {secondaryActions.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    className={getButtonClassName(item.tone)}
                    onClick={() => onRunAction(item.action)}
                    disabled={Boolean(savingAction)}
                  >
                    {savingAction === item.action ? "Traitement..." : item.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="tagora-note" style={{ margin: 0 }}>
              Gestion des acces reservee aux administrateurs.
            </p>
          )}
        </ManageSection>

        <ManageSection title="Fiche employe" icon={<ExternalLink size={16} />}>
          <EmployeeLinkStatusBadge employeeLink={request.employee_link} />
          <p className="tagora-note" style={{ margin: "8px 0 0" }}>
            Derniere connexion : {formatDate(request.existing_account?.lastSignInAt)}
          </p>
          {request.employee_link?.id ? (
            <Link
              href={`/direction/ressources/employes/${request.employee_link.id}`}
              className="tagora-dark-outline-action"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 34,
                padding: "0 12px",
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              <ExternalLink size={14} />
              Ouvrir la fiche employe
            </Link>
          ) : (
            <p className="tagora-note" style={{ margin: 0 }}>
              Aucune fiche liee. L approbation cree ou relie la fiche automatiquement.
            </p>
          )}
        </ManageSection>

        <ManageSection title="Securite / mot de passe" icon={<KeyRound size={16} />}>
          <p className="tagora-note" style={{ margin: 0 }}>
            Le mot de passe actuel n est jamais affiche ni lu. {getPasswordPolicyMessage()}
          </p>
          {canManageRoles ? (
            <div className="ui-stack-sm" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => onRunSecurityAction("reset_password")}
                disabled={!canUsePasswordActions || Boolean(securityAction)}
              >
                {securityAction === "reset_password"
                  ? "Envoi..."
                  : "Reinitialiser le mot de passe (courriel)"}
              </button>
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => onRunSecurityAction("send_reset_link")}
                disabled={!canUsePasswordActions || Boolean(securityAction)}
              >
                {securityAction === "send_reset_link"
                  ? "Envoi..."
                  : "Envoyer le lien de reinitialisation"}
              </button>
              {!hasAuthAccount ? (
                <p className="tagora-note" style={{ margin: 0 }}>
                  Compte Auth requis : approuvez la demande avant la gestion du mot de passe.
                </p>
              ) : null}
              <div className="tagora-form-grid" style={{ marginTop: 8 }}>
                <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Nouveau mot de passe temporaire</span>
                  <input
                    className="tagora-input"
                    type="password"
                    autoComplete="new-password"
                    value={temporaryPassword}
                    onChange={(e) => setTemporaryPassword(e.target.value)}
                    disabled={!canUsePasswordActions || Boolean(securityAction)}
                  />
                </label>
                <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Confirmer le mot de passe</span>
                  <input
                    className="tagora-input"
                    type="password"
                    autoComplete="new-password"
                    value={confirmTemporaryPassword}
                    onChange={(e) => setConfirmTemporaryPassword(e.target.value)}
                    disabled={!canUsePasswordActions || Boolean(securityAction)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="tagora-dark-action"
                onClick={handleSetTemporaryPassword}
                disabled={
                  !canUsePasswordActions ||
                  Boolean(securityAction) ||
                  !temporaryPassword ||
                  temporaryPassword !== confirmTemporaryPassword
                }
              >
                {securityAction === "set_temporary_password"
                  ? "Application..."
                  : "Definir un mot de passe temporaire"}
              </button>
            </div>
          ) : (
            <p className="tagora-note" style={{ margin: 0 }}>
              Actions de securite reservees aux administrateurs.
            </p>
          )}
        </ManageSection>

        <ManageSection title="Actions" icon={<Mail size={16} />}>
          {request.review_lock?.isLocked ? (
            <div className="account-requests-lock">
              Traitement verrouille jusqu au {formatDate(request.review_lock.expiresAt)}.
            </div>
          ) : null}
          {canManageRoles ? (
            <button
              type="button"
              className="tagora-btn-danger"
              onClick={onDelete}
              disabled={Boolean(deleting || savingAction)}
            >
              {deleting ? "Suppression..." : "Supprimer la demande"}
            </button>
          ) : null}
        </ManageSection>
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({
  children,
  onClose,
  busy,
}: {
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        disabled={busy}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          background: "transparent",
          cursor: busy ? "default" : "pointer",
        }}
      />
      {children}
    </div>
  );
}
