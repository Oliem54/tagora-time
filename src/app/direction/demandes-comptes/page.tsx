"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";

type RequestStatus = "pending" | "invited" | "active" | "refused" | "error";
type RequestRole = "employe" | "direction";
type RequestAction =
  | "approve"
  | "refuse"
  | "update_access"
  | "reset_pending"
  | "resend_invitation"
  | "disable_access"
  | "retry"
  | "delete";

type AccountRequest = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: AccountRequestCompany;
  portal_source: RequestRole;
  requested_role: RequestRole;
  requested_permissions: string[] | null;
  message: string | null;
  status: RequestStatus;
  assigned_role: RequestRole | null;
  assigned_permissions: string[] | null;
  review_note: string | null;
  reviewed_at: string | null;
  last_error?: string | null;
  existing_account?: {
    exists: boolean;
    userId: string | null;
    role: RequestRole | null;
    permissions: string[];
    company: AccountRequestCompany | null;
    primaryCompany: AccountRequestCompany | null;
    allowedCompanies: AccountRequestCompany[];
    companyDirectoryContext: string | null;
    emailConfirmed: boolean;
    hasSignedIn: boolean;
    lastSignInAt: string | null;
  } | null;
  review_lock?: {
    isLocked: boolean;
    isExpired: boolean;
    expiresAt: string | null;
  } | null;
  created_at: string;
};

type ActionConfig = {
  action: RequestAction;
  label: string;
  tone: "primary" | "secondary" | "danger";
};

const fallbackPermissions = [...accountRequestPermissionOptions];

function formatRole(role: RequestRole | null | undefined) {
  if (role === "direction") return "Direction";
  if (role === "employe") return "Employe";
  return "Non defini";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusPresentation(status: RequestStatus) {
  if (status === "active") {
    return {
      color: "#166534",
      background: "#dcfce7",
      label: "active",
    };
  }

  if (status === "invited") {
    return {
      color: "#1d4ed8",
      background: "#dbeafe",
      label: "invited",
    };
  }

  if (status === "refused") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      label: "refused",
    };
  }

  if (status === "error") {
    return {
      color: "#b45309",
      background: "#fef3c7",
      label: "error",
    };
  }

  return {
    color: "#92400e",
    background: "#fef3c7",
    label: "pending",
  };
}

function getActionsForStatus(status: RequestStatus): ActionConfig[] {
  if (status === "pending") {
    return [
      { action: "approve", label: "Approuver", tone: "primary" },
      { action: "refuse", label: "Refuser", tone: "secondary" },
      { action: "delete", label: "Supprimer", tone: "danger" },
    ];
  }

  if (status === "invited") {
    return [
      { action: "update_access", label: "Modifier role et permissions", tone: "primary" },
      { action: "resend_invitation", label: "Renvoyer l invitation", tone: "secondary" },
      { action: "reset_pending", label: "Remettre en pending", tone: "secondary" },
      { action: "delete", label: "Supprimer", tone: "danger" },
    ];
  }

  if (status === "active") {
    return [
      { action: "update_access", label: "Modifier role et permissions", tone: "primary" },
      { action: "disable_access", label: "Desactiver l acces", tone: "secondary" },
      { action: "delete", label: "Supprimer", tone: "danger" },
    ];
  }

  if (status === "refused") {
    return [
      { action: "reset_pending", label: "Remettre en pending", tone: "primary" },
      { action: "delete", label: "Supprimer", tone: "danger" },
    ];
  }

  return [
    { action: "retry", label: "Relancer le traitement", tone: "primary" },
    { action: "reset_pending", label: "Remettre en pending", tone: "secondary" },
    { action: "delete", label: "Supprimer", tone: "danger" },
  ];
}

export default function DirectionAccountRequestsPage() {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignedRole, setAssignedRole] = useState<RequestRole>("employe");
  const [assignedPermissions, setAssignedPermissions] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmOverwriteExistingAccount, setConfirmOverwriteExistingAccount] =
    useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [savingAction, setSavingAction] = useState<RequestAction | null>(null);
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

  const selectedRequest = useMemo(
    () => sortedRequests.find((item) => item.id === selectedId) || null,
    [selectedId, sortedRequests]
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

  const fetchRequests = useCallback(async (selectedRequestId?: string | null) => {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    try {
      const response = await fetch("/api/account-requests", {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || "Erreur chargement demandes.");
        setMessageType("error");
        setRequests([]);
        return;
      }

      const nextRequests = Array.isArray(payload.requests) ? payload.requests : [];
      setRequests(nextRequests);

      const preferredId = selectedRequestId ?? selectedId;
      const nextSelected =
        nextRequests.find((item: AccountRequest) => item.id === preferredId)?.id ||
        nextRequests[0]?.id ||
        null;

      setSelectedId(nextSelected);
      setMessage("");
      setMessageType(null);
    } catch {
      setMessage("Impossible de charger les demandes.");
      setMessageType("error");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

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
    if (!selectedRequest) return;

    setAssignedRole(
      selectedRequest.assigned_role ?? selectedRequest.requested_role ?? "employe"
    );
    setAssignedPermissions(
      selectedRequest.assigned_permissions ??
        selectedRequest.requested_permissions ??
        []
    );
    setReviewNote(selectedRequest.review_note ?? "");
    setConfirmOverwriteExistingAccount(false);
  }, [selectedRequest]);

  function togglePermission(permission: string) {
    setAssignedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission]
    );
  }

  async function runAction(action: RequestAction) {
    if (!selectedRequest) return;

    setSavingAction(action);
    setMessage("");
    setMessageType(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    try {
      const response = await fetch(`/api/account-requests/${selectedRequest.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: {
          ...(action === "delete"
            ? {}
            : {
                "Content-Type": "application/json",
              }),
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        ...(action === "delete"
          ? {}
          : {
              body: JSON.stringify({
                action,
                assignedRole,
                assignedPermissions,
                reviewNote,
                confirmOverwriteExistingAccount,
              }),
            }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || "Erreur traitement demande.");
        setMessageType("error");
        return;
      }

      setMessage(getSuccessMessage(action));
      setMessageType("success");
      await fetchRequests(action === "delete" ? null : selectedRequest.id);
    } catch {
      setMessage("Erreur reseau pendant le traitement de la demande.");
      setMessageType("error");
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 1520 }}>
        <HeaderTagora
          title="Gestion des demandes de comptes"
          subtitle="Administrez les demandes pending, invited, active, refused et error, puis intervenez directement sur l acces et les invitations."
        />

        <div className="tagora-stat-grid" style={{ marginBottom: 24 }}>
          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Pending</div>
            <div className="tagora-stat-value">{counts.pending}</div>
          </div>
          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Invited</div>
            <div className="tagora-stat-value">{counts.invited}</div>
          </div>
          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Active</div>
            <div className="tagora-stat-value">{counts.active}</div>
          </div>
          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Refused</div>
            <div className="tagora-stat-value">{counts.refused}</div>
          </div>
          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Error</div>
            <div className="tagora-stat-value">{counts.error}</div>
          </div>
        </div>

        <FeedbackMessage message={message} type={messageType} />

        <div
          className="tagora-split"
          style={{ gridTemplateColumns: "minmax(0, 1.45fr) minmax(360px, 0.8fr)" }}
        >
          <section className="tagora-panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <h2 className="section-title" style={{ marginBottom: 10 }}>
                  Console des demandes
                </h2>
                <p className="tagora-note">
                  Selectionnez une carte pour piloter son cycle de vie complet.
                </p>
              </div>

              <div className="tagora-actions">
                <button
                  type="button"
                  className="tagora-dark-outline-action"
                  onClick={() => void fetchRequests()}
                  disabled={loading}
                >
                  {loading ? "Chargement..." : "Actualiser"}
                </button>

                <Link href="/direction/dashboard" className="tagora-dark-outline-action">
                  Retour dashboard
                </Link>
              </div>
            </div>

            {loading ? (
              <p className="tagora-note">Chargement des demandes...</p>
            ) : sortedRequests.length === 0 ? (
              <p className="tagora-note">Aucune demande de compte pour le moment.</p>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {sortedRequests.map((request) => {
                  const status = getStatusPresentation(request.status);
                  const isSelected = selectedId === request.id;

                  return (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => setSelectedId(request.id)}
                      className="tagora-panel-muted"
                      style={{
                        textAlign: "left",
                        cursor: "pointer",
                        border: isSelected ? "2px solid #1d4ed8" : "1px solid #e2e8f0",
                        boxShadow: isSelected
                          ? "0 10px 26px rgba(29, 78, 216, 0.14)"
                          : undefined,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          flexWrap: "wrap",
                          alignItems: "start",
                        }}
                      >
                        <div>
                          <h3
                            style={{ margin: "0 0 8px 0", fontSize: 20, color: "#17376b" }}
                          >
                            {request.full_name}
                          </h3>
                          <div className="tagora-note">{request.email}</div>
                          <div className="tagora-note">
                            {request.phone || "Telephone non fourni"}
                          </div>
                          <div className="tagora-note">
                            {request.company
                              ? getCompanyLabel(request.company)
                              : "Compagnie non fournie"}
                          </div>
                        </div>

                        <div
                          style={{
                            padding: "6px 12px",
                            borderRadius: 999,
                            fontSize: 13,
                            fontWeight: 700,
                            color: status.color,
                            background: status.background,
                          }}
                        >
                          {status.label}
                        </div>
                      </div>

                      <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
                        <div className="tagora-note">
                          Portail source : {formatRole(request.portal_source)}
                        </div>
                        <div className="tagora-note">
                          Role demande : {formatRole(request.requested_role)}
                        </div>
                        <div className="tagora-note">
                          Role attribue : {formatRole(request.assigned_role)}
                        </div>
                        <div className="tagora-note">
                          Creee le : {formatDate(request.created_at)}
                        </div>
                        {request.reviewed_at ? (
                          <div className="tagora-note">
                            Derniere revue : {formatDate(request.reviewed_at)}
                          </div>
                        ) : null}
                        {request.last_error ? (
                          <div className="tagora-note" style={{ color: "#b45309" }}>
                            Derniere erreur : {request.last_error}
                          </div>
                        ) : null}
                        {request.existing_account?.exists ? (
                          <div className="tagora-note" style={{ color: "#1d4ed8" }}>
                            Compte existant detecte.
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="tagora-panel">
            <h2 className="section-title" style={{ marginBottom: 10 }}>
              Console admin
            </h2>

            {!selectedRequest ? (
              <p className="tagora-note">
                Selectionnez une demande pour gerer son statut, son invitation et son acces.
              </p>
            ) : (
              <div className="tagora-form-grid">
                <div className="tagora-panel-muted" style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#17376b" }}>
                    {selectedRequest.full_name}
                  </div>
                  <div className="tagora-note">{selectedRequest.email}</div>
                  <div className="tagora-note">
                    Statut actuel : {getStatusPresentation(selectedRequest.status).label}
                  </div>
                  <div className="tagora-note">
                    Portail source : {formatRole(selectedRequest.portal_source)}
                  </div>
                  <div className="tagora-note">
                    Compagnie : {getCompanyLabel(selectedRequest.company)}
                  </div>
                  <div className="tagora-note">
                    Message : {selectedRequest.message || "Aucun commentaire"}
                  </div>
                </div>

                <div>
                  <label className="tagora-field-label">Role admin cible</label>
                  <select
                    className="tagora-select"
                    value={assignedRole}
                    onChange={(e) =>
                      setAssignedRole(
                        e.target.value === "direction" ? "direction" : "employe"
                      )
                    }
                  >
                    <option value="employe">Employe</option>
                    <option value="direction">Direction</option>
                  </select>
                </div>

                <div>
                  <label className="tagora-field-label">Permissions admin cibles</label>
                  <div className="tagora-panel-muted" style={{ display: "grid", gap: 10 }}>
                    {permissionOptions.map((option) => (
                      <label
                        key={option.value}
                        style={{ display: "flex", alignItems: "center", gap: 10, color: "#334155" }}
                      >
                        <input
                          type="checkbox"
                          checked={assignedPermissions.includes(option.value)}
                          onChange={() => togglePermission(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="tagora-field-label">Note admin</label>
                  <textarea
                    className="tagora-textarea"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Note interne, justification ou commentaire d intervention."
                  />
                </div>

                <div className="tagora-panel-muted" style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 800, color: "#17376b" }}>Compte existant</div>
                  {selectedRequest.existing_account?.exists ? (
                    <>
                      <div className="tagora-note">Compte existant : oui</div>
                      <div className="tagora-note">
                        Role actuel : {formatRole(selectedRequest.existing_account.role)}
                      </div>
                      <div className="tagora-note">
                        Compagnie actuelle :{" "}
                        {selectedRequest.existing_account.company
                          ? getCompanyLabel(selectedRequest.existing_account.company)
                          : "Non definie"}
                      </div>
                      <div className="tagora-note">
                        Compagnies autorisees :
                        {selectedRequest.existing_account.allowedCompanies.length > 0
                          ? ` ${selectedRequest.existing_account.allowedCompanies
                              .map((company) => getCompanyLabel(company))
                              .join(", ")}`
                          : " aucune"}
                      </div>
                      <div className="tagora-note">
                        Permissions actuelles :
                        {selectedRequest.existing_account.permissions.length > 0
                          ? ` ${selectedRequest.existing_account.permissions.join(", ")}`
                          : " aucune"}
                      </div>
                      <div className="tagora-note">
                        Courriel confirme :
                        {selectedRequest.existing_account.emailConfirmed ? " oui" : " non"}
                      </div>
                      <div className="tagora-note">
                        Derniere connexion :
                        {selectedRequest.existing_account.lastSignInAt
                          ? ` ${formatDate(selectedRequest.existing_account.lastSignInAt)}`
                          : " aucune"}
                      </div>
                      <button
                        type="button"
                        className={
                          confirmOverwriteExistingAccount
                            ? "tagora-dark-action"
                            : "tagora-dark-outline-action"
                        }
                        onClick={() =>
                          setConfirmOverwriteExistingAccount((current) => !current)
                        }
                      >
                        {confirmOverwriteExistingAccount
                          ? "Ecrasement force actif"
                          : "Forcer l ecrasement"}
                      </button>
                    </>
                  ) : (
                    <div className="tagora-note">Aucun compte existant detecte pour ce courriel.</div>
                  )}
                </div>

                {selectedRequest.review_lock?.isLocked ? (
                  <div className="tagora-note" style={{ color: "#92400e" }}>
                    Traitement verrouille jusqu au {formatDate(selectedRequest.review_lock.expiresAt)}.
                  </div>
                ) : null}

                <div>
                  <div className="tagora-field-label">Actions disponibles</div>
                  <div className="tagora-actions">
                    {getActionsForStatus(selectedRequest.status).map((item) => {
                      const isBusy = savingAction === item.action;

                      return (
                        <button
                          key={item.action}
                          type="button"
                          className={getButtonClassName(item.tone)}
                          onClick={() => void runAction(item.action)}
                          disabled={Boolean(savingAction)}
                        >
                          {isBusy ? "Traitement..." : item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function getButtonClassName(tone: ActionConfig["tone"]) {
  if (tone === "danger") return "tagora-btn-danger";
  if (tone === "secondary") return "tagora-dark-outline-action";
  return "tagora-btn tagora-btn-primary";
}

function getSuccessMessage(action: RequestAction) {
  if (action === "approve") return "Demande approuvee avec succes.";
  if (action === "refuse") return "Demande refusee avec succes.";
  if (action === "update_access") return "Role et permissions mis a jour.";
  if (action === "reset_pending") return "Demande remise en pending.";
  if (action === "resend_invitation") return "Invitation renvoyee avec succes.";
  if (action === "disable_access") return "Acces desactive avec succes.";
  if (action === "retry") return "Traitement relance avec succes.";
  return "Demande supprimee avec succes.";
}
