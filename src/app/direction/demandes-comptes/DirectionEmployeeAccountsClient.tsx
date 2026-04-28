"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleAlert,
  Clock3,
  LayoutDashboard,
  Mail,
  OctagonX,
  UserCheck,
} from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import UserIdentityBadge from "@/app/components/ui/UserIdentityBadge";
import StatusBadge from "@/app/components/ui/StatusBadge";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import {
  type AccountAccessAction,
  type AccountAccessRequestRecord,
  type AccountAccessStatus,
} from "@/app/lib/account-access";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";
import AccountRequestRowActions from "./AccountRequestRowActions";
import EmployeeLinkStatusBadge from "./EmployeeLinkStatusBadge";

type RequestRole = "employe" | "direction" | "admin";
type AccountSecurityAction = "reset_password" | "send_reset_link";

type ActionConfig = {
  action: AccountAccessAction;
  label: string;
  tone: "primary" | "secondary" | "danger";
};

const fallbackPermissions = [...accountRequestPermissionOptions];

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

function buildApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const parts = [
    "error" in payload && typeof payload.error === "string" ? payload.error : null,
    "details" in payload && typeof payload.details === "string" ? payload.details : null,
    "hint" in payload && typeof payload.hint === "string" ? payload.hint : null,
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(" | ") : fallback;
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

function getPrimaryActionForStatus(status: AccountAccessStatus): ActionConfig | null {
  if (status === "pending") {
    return { action: "approve", label: "Approuver", tone: "primary" };
  }

  if (status === "invited" || status === "active") {
    return {
      action: "update_access",
      label: "Enregistrer les acces",
      tone: "primary",
    };
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

function getSuccessMessage(action: AccountAccessAction) {
  if (action === "approve") return "Demande approuvee avec succes.";
  if (action === "refuse") return "Demande refusee avec succes.";
  if (action === "update_access") return "Acces mis a jour.";
  if (action === "reset_pending") return "Demande remise en attente.";
  if (action === "resend_invitation") return "Invitation renvoyee avec succes.";
  if (action === "disable_access") return "Acces desactive avec succes.";
  return "Traitement relance avec succes.";
}

function getButtonClassName(tone: ActionConfig["tone"]) {
  if (tone === "danger") return "tagora-btn-danger";
  if (tone === "secondary") return "tagora-dark-outline-action";
  return "tagora-dark-action";
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="tagora-panel-muted" style={{ padding: 12, borderRadius: 14 }}>
      <div className="tagora-label">{label}</div>
      <div style={{ marginTop: 6, color: "#0f172a", fontWeight: 700, fontSize: 13 }}>
        {value}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "pending" | "invited" | "active" | "refused" | "error";
  icon: ReactNode;
}) {
  return (
    <div className={`account-requests-premium-stat account-requests-stat-${tone}`}>
      <div className="account-requests-premium-stat-icon">{icon}</div>
      <div className="account-requests-premium-stat-copy">
        <div className="account-requests-premium-stat-label">{label}</div>
        <div className="account-requests-premium-stat-value">{value}</div>
      </div>
    </div>
  );
}

function AccountEditDrawer({
  request,
  assignedRole,
  assignedPermissions,
  reviewNote,
  confirmOverwriteExistingAccount,
  permissionOptions,
  savingAction,
  securityAction,
  onClose,
  onRoleChange,
  onReviewNoteChange,
  onTogglePermission,
  onConfirmOverwriteChange,
  onRunAction,
  onRunSecurityAction,
}: {
  request: AccountAccessRequestRecord;
  assignedRole: RequestRole;
  assignedPermissions: string[];
  reviewNote: string;
  confirmOverwriteExistingAccount: boolean;
  permissionOptions: Array<{ value: string; label: string }>;
  savingAction: AccountAccessAction | null;
  securityAction: AccountSecurityAction | null;
  onClose: () => void;
  onRoleChange: (role: RequestRole) => void;
  onReviewNoteChange: (value: string) => void;
  onTogglePermission: (permission: string) => void;
  onConfirmOverwriteChange: () => void;
  onRunAction: (action: AccountAccessAction) => void;
  onRunSecurityAction: (action: AccountSecurityAction) => void;
}) {
  const primaryAction = getPrimaryActionForStatus(request.status);
  const secondaryActions = getSecondaryActionsForStatus(request.status);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15,23,42,0.22)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        style={{
          flex: 1,
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
      />

      <aside
        className="tagora-panel ui-stack-md"
        style={{
          margin: 0,
          width: "min(680px, 100vw)",
          height: "100vh",
          overflowY: "auto",
          borderRadius: 0,
          padding: 18,
          boxShadow: "-12px 0 32px rgba(15,23,42,0.12)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          <div className="ui-stack-xs">
            <div className="tagora-label">Compte application</div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              {request.full_name}
            </h2>
            <p className="tagora-note" style={{ margin: 0 }}>
              {request.email}
            </p>
          </div>

          <button
            type="button"
            className="tagora-dark-outline-action"
            onClick={onClose}
            style={{ height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
          >
            Fermer
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <SummaryItem label="Statut" value={getStatusLabel(request.status)} />
          <SummaryItem label="Portail source" value={formatRole(request.portal_source as RequestRole)} />
          <SummaryItem label="Compagnie" value={getCompanyLabel(request.company)} />
          <SummaryItem
            label="Derniere connexion"
            value={formatDate(request.existing_account?.lastSignInAt)}
          />
          <SummaryItem
            label="Etat fiche employe"
            value={request.employee_link?.label ?? "Fiche employe manquante"}
          />
          <SummaryItem
            label="Activation courriel"
            value={request.existing_account?.emailConfirmed ? "Confirmee" : "En attente"}
          />
        </div>

        <div className="tagora-form-grid">
          <label className="tagora-field">
            <span className="tagora-label">Role</span>
            <select
              className="tagora-input"
              value={assignedRole}
              onChange={(event) => {
                const v = event.target.value;
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
            <span className="tagora-label">Note admin compte</span>
            <textarea
              className="tagora-textarea"
              value={reviewNote}
              onChange={(event) => onReviewNoteChange(event.target.value)}
              placeholder="Note admin"
              readOnly={Boolean(savingAction)}
            />
          </label>
        </div>

        <div className="ui-stack-xs">
          <div className="tagora-label">Permissions</div>
          <div className="tagora-panel-muted account-requests-permissions">
            {permissionOptions.map((option) => (
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

        {request.review_lock?.isLocked ? (
          <div className="account-requests-lock">
            Traitement verrouille jusqu au {formatDate(request.review_lock.expiresAt)}.
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          <div className="tagora-panel-muted ui-stack-sm" style={{ padding: 20 }}>
            <div className="ui-stack-xs">
              <div className="tagora-label">Acces et activation</div>
            </div>

            {primaryAction ? (
              <button
                type="button"
                className={getButtonClassName(primaryAction.tone)}
                onClick={() => onRunAction(primaryAction.action)}
                disabled={Boolean(savingAction)}
                style={{ height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
              >
                {savingAction === primaryAction.action ? "Traitement..." : primaryAction.label}
              </button>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {secondaryActions.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  className={getButtonClassName(item.tone)}
                  onClick={() => onRunAction(item.action)}
                  disabled={Boolean(savingAction)}
                  style={{ height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
                >
                  {savingAction === item.action ? "Traitement..." : item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tagora-panel-muted ui-stack-sm" style={{ padding: 20 }}>
            <div className="ui-stack-xs">
              <div className="tagora-label">Securite</div>
            </div>

            <button
              type="button"
              className="tagora-dark-outline-action"
              onClick={() => onRunSecurityAction("reset_password")}
              disabled={
                !request.employee_link?.id ||
                !request.existing_account?.exists ||
                Boolean(securityAction)
              }
              style={{ height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
            >
              {securityAction === "reset_password"
                ? "Envoi..."
                : "Reinitialiser le mot de passe"}
            </button>

            <button
              type="button"
              className="tagora-dark-outline-action"
              onClick={() => onRunSecurityAction("send_reset_link")}
              disabled={
                !request.employee_link?.id ||
                !request.existing_account?.exists ||
                Boolean(securityAction)
              }
              style={{ height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
            >
              {securityAction === "send_reset_link"
                ? "Envoi..."
                : "Envoyer le lien de reinitialisation"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {request.employee_link?.id ? (
            <Link
              href={`/direction/ressources/employes/${request.employee_link.id}`}
              className="tagora-dark-outline-action"
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: 10,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Ouvrir la fiche employe
            </Link>
          ) : (
            <p className="tagora-note" style={{ margin: 0 }}>
              Fiche employe manquante.
            </p>
          )}

          <button
            type="button"
            className="tagora-dark-action"
            onClick={onClose}
            style={{ height: 34, padding: "0 12px", borderRadius: 10, fontSize: 12 }}
          >
            Terminer
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function DirectionEmployeeAccountsClient() {
  const { user } = useCurrentAccess();
  const [requests, setRequests] = useState<AccountAccessRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [assignedRole, setAssignedRole] = useState<RequestRole>("employe");
  const [assignedPermissions, setAssignedPermissions] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmOverwriteExistingAccount, setConfirmOverwriteExistingAccount] =
    useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [savingAction, setSavingAction] = useState<AccountAccessAction | null>(null);
  const [securityAction, setSecurityAction] = useState<AccountSecurityAction | null>(null);
  const [permissionOptions, setPermissionOptions] = useState<
    Array<{ value: string; label: string }>
  >(fallbackPermissions);

  const sortedRequests = useMemo(
    () =>
      [...requests].sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      ),
    [requests]
  );

  const editingRequest = useMemo(
    () => sortedRequests.find((item) => item.id === editingRequestId) ?? null,
    [editingRequestId, sortedRequests]
  );

  const counts = useMemo(
    () => ({
      pending: sortedRequests.filter((item) => item.status === "pending").length,
      invited: sortedRequests.filter((item) => item.status === "invited").length,
      active: sortedRequests.filter((item) => item.status === "active").length,
      refused: sortedRequests.filter((item) => item.status === "refused").length,
      error: sortedRequests.filter((item) => item.status === "error").length,
    }),
    [sortedRequests]
  );

  const fetchRequests = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/account-requests", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-account-requests-client": "browser-authenticated",
          "Cache-Control": "no-store",
        },
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage("Impossible de charger les demandes pour le moment.");
        setMessageType("error");
        setRequests([]);
        return;
      }

      const nextRequests = Array.isArray(payload.requests) ? payload.requests : [];

      setRequests(nextRequests);
      setMessage("");
      setMessageType(null);
    } catch {
      setMessage("Impossible de charger les demandes pour le moment.");
      setMessageType("error");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setAccessToken(data.session?.access_token ?? null);
      setIsReady(true);
    };

    void init();
  }, []);

  useEffect(() => {
    if (!isReady || !accessToken) {
      return;
    }

    void fetchRequests();
  }, [accessToken, fetchRequests, isReady]);

  useEffect(() => {
    async function loadPermissions() {
      try {
        const response = await fetch("/api/permissions");
        const payload = await response.json();

        if (
          response.ok &&
          Array.isArray(payload.permissions) &&
          payload.permissions.length > 0
        ) {
          setPermissionOptions(payload.permissions);
        }
      } catch {
        setPermissionOptions(fallbackPermissions);
      }
    }

    void loadPermissions();
  }, []);

  useEffect(() => {
    if (!editingRequest) {
      return;
    }

    setAssignedRole(
      (editingRequest.assigned_role ??
        editingRequest.requested_role ??
        "employe") as RequestRole
    );
    setAssignedPermissions(
      editingRequest.assigned_permissions ?? editingRequest.requested_permissions ?? []
    );
    setReviewNote(editingRequest.review_note ?? "");
    setConfirmOverwriteExistingAccount(false);
  }, [editingRequest]);

  function togglePermission(permission: string) {
    setAssignedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission]
    );
  }

  async function runAction(action: AccountAccessAction, request: AccountAccessRequestRecord) {
    if (!accessToken) {
      return;
    }

    setSavingAction(action);
    setMessage("");
    setMessageType(null);

    try {
      const response = await window.fetch(`/api/account-requests/${request.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-account-requests-client": "browser-authenticated",
          "x-account-requests-page": "direction-demandes-comptes",
        },
        body: JSON.stringify({
          action,
          assignedRole,
          assignedPermissions,
          reviewNote,
          confirmOverwriteExistingAccount,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(buildApiErrorMessage(payload, "Le traitement de la demande n a pas pu aboutir."));
        setMessageType("error");
        return;
      }

      setMessage(getSuccessMessage(action));
      setMessageType("success");
      await fetchRequests();
    } catch {
      setMessage("Le traitement de la demande n a pas pu aboutir.");
      setMessageType("error");
    } finally {
      setSavingAction(null);
    }
  }

  async function runSecurityAction(action: AccountSecurityAction, request: AccountAccessRequestRecord) {
    if (!request.employee_link?.id || !accessToken) {
      return;
    }

    setSecurityAction(action);
    setMessage("");
    setMessageType(null);

    try {
      const response = await fetch(
        `/api/employees/${request.employee_link.id}/account-security`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );
      const payload = await response.json();

      if (!response.ok) {
        setMessage(buildApiErrorMessage(payload, "L action de securite a echoue."));
        setMessageType("error");
        return;
      }

      setMessage(
        typeof payload.message === "string"
          ? payload.message
          : "Action de securite terminee."
      );
      setMessageType("success");
      await fetchRequests();
    } catch {
      setMessage("L action de securite a echoue.");
      setMessageType("error");
    } finally {
      setSecurityAction(null);
    }
  }

  return (
    <main className="tagora-app-shell account-requests-page">
      <div className="tagora-app-content account-requests-premium-layout">
        <section className="account-requests-premium-hero">
          <div className="account-requests-premium-logo-card">
            <Image
              src="/logo.png"
              alt="Logo TAGORA"
              width={220}
              height={110}
              priority
              className="account-requests-premium-logo"
            />
          </div>

          <div className="account-requests-premium-hero-copy">
            <h1 className="account-requests-premium-title">Demandes de comptes</h1>
          </div>

          <div className="account-requests-premium-hero-actions">
            {user?.email ? <UserIdentityBadge value={user.email} /> : null}
            <Link href="/direction" className="account-requests-hero-button account-requests-hero-button-secondary">
              <LayoutDashboard size={14} />
              Tableau
            </Link>
            <Link href="/direction/dashboard" className="account-requests-hero-button account-requests-hero-button-light">
              <ArrowLeft size={14} />
              Retour
            </Link>
          </div>
        </section>

        <div className="account-requests-stats">
          <StatCard
            label="En attente"
            value={counts.pending}
            tone="pending"
            icon={<Clock3 size={20} strokeWidth={1.9} />}
          />
          <StatCard
            label="Invites"
            value={counts.invited}
            tone="invited"
            icon={<Mail size={20} strokeWidth={1.9} />}
          />
          <StatCard
            label="Actifs"
            value={counts.active}
            tone="active"
            icon={<UserCheck size={20} strokeWidth={1.9} />}
          />
          <StatCard
            label="Refuses"
            value={counts.refused}
            tone="refused"
            icon={<OctagonX size={20} strokeWidth={1.9} />}
          />
          <StatCard
            label="Erreurs"
            value={counts.error}
            tone="error"
            icon={<CircleAlert size={20} strokeWidth={1.9} />}
          />
        </div>

        <FeedbackMessage message={message} type={messageType} />

        <section className="account-requests-premium-shell">
          <div className="account-requests-premium-toolbar">
            <button
              type="button"
              className="account-requests-toolbar-button"
              onClick={() => void fetchRequests()}
              disabled={loading}
            >
              {loading ? "Actualisation..." : "Actualiser"}
            </button>
          </div>

          {loading ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Chargement...
              </p>
            </div>
          ) : sortedRequests.length === 0 ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Aucune demande.
              </p>
            </div>
          ) : (
            <div className="account-requests-premium-table-wrap">
              <table className="account-requests-premium-table">
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Demandeur</th>
                    <th>Portail</th>
                    <th>Acces</th>
                    <th>Compte</th>
                    <th>Fiche employe</th>
                    <th>Derniere connexion</th>
                    <th>Cree le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRequests.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <div className="account-requests-requester">
                          <div className="account-requests-requester-name">{request.full_name}</div>
                          <div className="account-requests-requester-meta">{request.email}</div>
                          <div className="account-requests-requester-meta">
                            {request.phone || "Telephone non fourni"}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="account-requests-cell-stack">
                          <span className="account-requests-cell-main">
                            {formatRole(request.portal_source)}
                          </span>
                          <span className="account-requests-cell-sub">
                            {getCompanyLabel(request.company as AccountRequestCompany)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="account-requests-cell-stack">
                          <span className="account-requests-cell-main">
                            {formatRole((request.assigned_role ?? request.requested_role) as RequestRole)}
                          </span>
                          <span className="account-requests-cell-sub">
                            {formatPermissions(request.assigned_permissions ?? request.requested_permissions)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="account-requests-cell-stack">
                          <StatusBadge
                            label={getStatusLabel(request.status)}
                            tone={getStatusTone(request.status)}
                          />
                          <span className="account-requests-cell-sub">
                            {request.existing_account?.exists ? "Compte detecte" : "Compte a creer"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="account-requests-cell-stack">
                          <EmployeeLinkStatusBadge employeeLink={request.employee_link} />
                          {request.employee_link?.id ? (
                            <span className="account-requests-cell-sub">#{request.employee_link.id}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="account-requests-cell-date">
                        {formatDate(request.existing_account?.lastSignInAt)}
                      </td>
                      <td className="account-requests-cell-date">
                        {formatDate(request.created_at)}
                      </td>
                      <td>
                        <div className="account-requests-cell-actions">
                          <AccountRequestRowActions
                            request={request}
                            onEdit={() => setEditingRequestId(request.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editingRequest ? (
        <AccountEditDrawer
          request={editingRequest}
          assignedRole={assignedRole}
          assignedPermissions={assignedPermissions}
          reviewNote={reviewNote}
          confirmOverwriteExistingAccount={confirmOverwriteExistingAccount}
          permissionOptions={permissionOptions}
          savingAction={savingAction}
          securityAction={securityAction}
          onClose={() => setEditingRequestId(null)}
          onRoleChange={setAssignedRole}
          onReviewNoteChange={setReviewNote}
          onTogglePermission={togglePermission}
          onConfirmOverwriteChange={() =>
            setConfirmOverwriteExistingAccount((current) => !current)
          }
          onRunAction={(action) => void runAction(action, editingRequest)}
          onRunSecurityAction={(action) => void runSecurityAction(action, editingRequest)}
        />
      ) : null}
    </main>
  );
}
