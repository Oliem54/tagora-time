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
  employee_profile?: {
    id: number | null;
    nom: string | null;
    courriel: string | null;
    telephone: string | null;
    actif: boolean | null;
    notes: string | null;
    primary_company: AccountRequestCompany | null;
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

function getStatusPresentation(status: RequestStatus) {
  if (status === "active") {
    return {
      color: "#166534",
      background: "#dcfce7",
      label: "Actif",
    };
  }

  if (status === "invited") {
    return {
      color: "#1d4ed8",
      background: "#dbeafe",
      label: "Invite",
    };
  }

  if (status === "refused") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      label: "Refuse",
    };
  }

  if (status === "error") {
    return {
      color: "#b45309",
      background: "#fef3c7",
      label: "Erreur",
    };
  }

  return {
    color: "#92400e",
    background: "#fef3c7",
    label: "En attente",
  };
}

function getPrimaryActionForStatus(status: RequestStatus): ActionConfig | null {
  if (status === "pending") {
    return {
      action: "approve",
      label: "Approuver l acces",
      tone: "primary",
    };
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

function getSecondaryActionsForStatus(status: RequestStatus): ActionConfig[] {
  if (status === "pending") {
    return [
      { action: "approve", label: "Approuver", tone: "secondary" },
    ];
  }

  if (status === "invited") {
    return [
      { action: "resend_invitation", label: "Renvoyer l invitation", tone: "secondary" },
      { action: "reset_pending", label: "Remettre en attente", tone: "secondary" },
      { action: "delete", label: "Supprimer", tone: "danger" },
    ];
  }

  if (status === "active") {
    return [
      { action: "disable_access", label: "Desactiver l acces", tone: "secondary" },
    ];
  }

  if (status === "refused") {
    return [
      { action: "reset_pending", label: "Remettre en attente", tone: "secondary" },
    ];
  }

  return [
    { action: "retry", label: "Relancer le traitement", tone: "secondary" },
    { action: "reset_pending", label: "Remettre en attente", tone: "secondary" },
  ];
}

function getDestructiveActionForStatus(status: RequestStatus): ActionConfig | null {
  if (status === "pending") {
    return { action: "refuse", label: "Refuser", tone: "danger" };
  }

  if (
    status === "invited" ||
    status === "active" ||
    status === "refused" ||
    status === "error"
  ) {
    return { action: "delete", label: "Supprimer", tone: "danger" };
  }

  return null;
}

function getAccountStateLabel(request: AccountRequest) {
  if (request.status === "active") return "Compte actif";
  if (request.status === "invited") return "Invitation envoyee";
  if (request.status === "error") return "Erreur de provisioning";
  if (request.status === "refused") return "Acces refuse";
  return request.existing_account?.exists ? "Compte a valider" : "Aucun compte";
}

export default function DirectionEmployeeAccountsClient() {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
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
  const primaryAction = useMemo(
    () =>
      selectedRequest ? getPrimaryActionForStatus(selectedRequest.status) : null,
    [selectedRequest]
  );
  const secondaryActions = useMemo(
    () =>
      selectedRequest ? getSecondaryActionsForStatus(selectedRequest.status) : [],
    [selectedRequest]
  );
  const destructiveAction = useMemo(
    () =>
      selectedRequest
        ? getDestructiveActionForStatus(selectedRequest.status)
        : null,
    [selectedRequest]
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

  const fetchRequests = useCallback(
    async (selectedRequestId?: string | null) => {
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
        const nextSelectedId =
          nextRequests.find((item: AccountRequest) => item.id === selectedRequestId)?.id ||
          nextRequests[0]?.id ||
          null;

        setRequests(nextRequests);
        setSelectedId(nextSelectedId);
        setMessage("");
        setMessageType(null);
      } catch {
        setMessage("Impossible de charger les demandes pour le moment.");
        setMessageType("error");
        setRequests([]);
      } finally {
        setLoading(false);
      }
    },
    [accessToken]
  );

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
    if (!selectedRequest) {
      return;
    }

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
    if (!selectedRequest || !accessToken) {
      return;
    }

    setSavingAction(action);
    setMessage("");
    setMessageType(null);

    try {
      const response = await window.fetch(`/api/account-requests/${selectedRequest.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-account-requests-client": "browser-authenticated",
          "x-account-requests-page": "direction-demandes-comptes",
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
                employeeProfile: selectedRequest.employee_profile ?? null,
              }),
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
      await fetchRequests(action === "delete" ? null : selectedRequest.id);
    } catch {
      setMessage("Le traitement de la demande n a pas pu aboutir.");
      setMessageType("error");
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <main className="tagora-app-shell account-requests-page">
      <div className="tagora-app-content" style={{ maxWidth: 1460 }}>
        <HeaderTagora
          title="Gestion des comptes employe"
          subtitle="Acces, activation, roles, permissions et securite uniquement."
        />

        <div
          className="tagora-panel"
          style={{
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div className="ui-stack-xs">
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Page compte uniquement
            </h2>
            <p className="tagora-note" style={{ margin: 0 }}>
              L emploi, l horaire, les alertes SMS, la refacturation Titan et les autres
              parametres operationnels se gerent maintenant uniquement dans la fiche
              profil employe.
            </p>
          </div>
          <Link href="/direction/dashboard" className="tagora-dark-outline-action">
            Retour
          </Link>
        </div>

        <div className="tagora-stat-grid account-requests-stats">
          <StatCard label="En attente" value={counts.pending} tone="pending" />
          <StatCard label="Invites" value={counts.invited} tone="invited" />
          <StatCard label="Actifs" value={counts.active} tone="active" />
          <StatCard label="Refuses" value={counts.refused} tone="refused" />
          <StatCard label="Erreurs" value={counts.error} tone="error" />
        </div>

        <FeedbackMessage message={message} type={messageType} />

        <div
          className="tagora-split"
          style={{ gridTemplateColumns: "minmax(320px, 0.92fr) minmax(0, 1.55fr)", gap: 28 }}
        >
          <section className="tagora-panel account-requests-panel">
            <div className="account-requests-section-head">
              <div>
                <h2 className="section-title account-requests-section-title">
                  Comptes employe
                </h2>
                <p className="tagora-note account-requests-section-note">
                  La liste ci dessous sert uniquement a gerer l acces au systeme.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="tagora-panel-muted account-requests-empty">
                <p className="tagora-note">Chargement...</p>
              </div>
            ) : sortedRequests.length === 0 ? (
              <div className="tagora-panel-muted account-requests-empty">
                <p className="tagora-note">Aucune demande.</p>
              </div>
            ) : (
              <div className="account-requests-list">
                {sortedRequests.map((request) => {
                  const status = getStatusPresentation(request.status);
                  const isSelected = selectedId === request.id;

                  return (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => setSelectedId(request.id)}
                      className={`account-requests-card${isSelected ? " is-selected" : ""}`}
                    >
                      <div className="account-requests-card-head">
                        <div className="account-requests-card-identity">
                          <h3 className="account-requests-card-title">{request.full_name}</h3>
                          <div className="account-requests-card-contact">
                            <div className="account-requests-card-contact-item">
                              <span className="account-requests-card-meta-label">Courriel</span>
                              <span className="account-requests-card-email">{request.email}</span>
                            </div>
                            <div className="account-requests-card-contact-item">
                              <span className="account-requests-card-meta-label">Telephone</span>
                              <span className="account-requests-card-secondary">
                                {request.phone || "Non fourni"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span
                          className="account-requests-status-badge"
                          style={{
                            color: status.color,
                            background: status.background,
                          }}
                        >
                          {status.label}
                        </span>
                      </div>

                      <div className="account-requests-card-meta">
                        <div className="account-requests-card-meta-item">
                          <span className="account-requests-card-meta-label">Portail</span>
                          <span className="account-requests-card-meta-value">
                            {formatRole(request.portal_source)}
                          </span>
                        </div>
                        <div className="account-requests-card-meta-item">
                          <span className="account-requests-card-meta-label">Role</span>
                          <span className="account-requests-card-meta-value">
                            {formatRole(request.assigned_role ?? request.requested_role)}
                          </span>
                        </div>
                        <div className="account-requests-card-meta-item">
                          <span className="account-requests-card-meta-label">Compte</span>
                          <span className="account-requests-card-meta-value">
                            {request.existing_account?.exists ? "Existant" : "A creer"}
                          </span>
                        </div>
                        <div className="account-requests-card-meta-item">
                          <span className="account-requests-card-meta-label">Creation</span>
                          <span className="account-requests-card-meta-value">
                            {formatDate(request.created_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="ui-stack-md">
            {!selectedRequest ? (
              <div className="tagora-panel">
                <div className="tagora-panel-muted account-requests-empty">
                  <p className="tagora-note">Selectionnez un compte pour ouvrir le detail.</p>
                </div>
              </div>
            ) : (
              <>
                <section className="tagora-panel ui-stack-md">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div className="ui-stack-xs">
                      <h2 className="section-title" style={{ marginBottom: 0 }}>
                        {selectedRequest.full_name}
                      </h2>
                      <p className="tagora-note" style={{ margin: 0 }}>
                        {selectedRequest.email}
                      </p>
                    </div>
                    <span
                      className="account-requests-status-badge"
                      style={{
                        color: getStatusPresentation(selectedRequest.status).color,
                        background: getStatusPresentation(selectedRequest.status).background,
                      }}
                    >
                      {getStatusPresentation(selectedRequest.status).label}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                      gap: 16,
                    }}
                  >
                    <SummaryItem label="Statut du compte" value={getAccountStateLabel(selectedRequest)} />
                    <SummaryItem
                      label="Compte existant"
                      value={selectedRequest.existing_account?.exists ? "Oui" : "Non"}
                    />
                    <SummaryItem label="Portail" value={formatRole(selectedRequest.portal_source)} />
                    <SummaryItem label="Date de creation" value={formatDate(selectedRequest.created_at)} />
                    <SummaryItem
                      label="Derniere connexion"
                      value={formatDate(selectedRequest.existing_account?.lastSignInAt)}
                    />
                    <SummaryItem
                      label="Statut employe"
                      value={selectedRequest.employee_profile?.actif === false ? "Employe inactif" : "Employe actif"}
                    />
                  </div>

                  <div
                    className="tagora-panel-muted"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                      alignItems: "center",
                      padding: 18,
                    }}
                  >
                    <div className="ui-stack-xs">
                      <div className="tagora-label">Navigation</div>
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>
                        Compte ici, emploi dans la fiche employe
                      </div>
                    </div>
                    <div className="account-requests-actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        onClick={() => setSelectedId(null)}
                        disabled={Boolean(savingAction)}
                      >
                        Retour a la liste
                      </button>
                      {selectedRequest.employee_profile?.id ? (
                        <Link
                          href={`/direction/ressources/employes/${selectedRequest.employee_profile.id}`}
                          className="tagora-dark-action"
                        >
                          Ouvrir la fiche employe
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="tagora-panel ui-stack-md">
                  <div className="ui-stack-xs">
                    <h2 className="section-title" style={{ marginBottom: 0 }}>
                      Acces et securite
                    </h2>
                    <p className="tagora-note" style={{ margin: 0 }}>
                      Cette page ne modifie plus les donnees d emploi. Elle sert uniquement
                      au compte, au role, aux permissions et a la note admin.
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                      gap: 16,
                    }}
                  >
                    <SummaryItem label="Courriel du compte" value={selectedRequest.email} />
                    <SummaryItem label="Telephone" value={selectedRequest.phone || "Non fourni"} />
                    <SummaryItem label="Compagnie" value={getCompanyLabel(selectedRequest.company)} />
                    <SummaryItem label="Role demande" value={formatRole(selectedRequest.requested_role)} />
                    <SummaryItem
                      label="Permissions demandees"
                      value={formatPermissions(selectedRequest.requested_permissions)}
                    />
                    <SummaryItem label="Role actuel" value={formatRole(selectedRequest.existing_account?.role)} />
                    <SummaryItem
                      label="Permissions actuelles"
                      value={formatPermissions(selectedRequest.existing_account?.permissions)}
                    />
                    <SummaryItem
                      label="Courriel confirme"
                      value={selectedRequest.existing_account?.emailConfirmed ? "Oui" : "Non"}
                    />
                  </div>

                  <div className="tagora-form-grid">
                    <label className="tagora-field">
                      <span className="tagora-label">Role admin cible</span>
                      <select
                        className="tagora-input"
                        value={assignedRole}
                        onChange={(e) =>
                          setAssignedRole(
                            e.target.value === "direction" ? "direction" : "employe"
                          )
                        }
                        disabled={Boolean(savingAction)}
                      >
                        <option value="employe">Employe</option>
                        <option value="direction">Direction</option>
                      </select>
                    </label>
                    <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                      <span className="tagora-label">Note admin liee au compte</span>
                      <textarea
                        className="tagora-textarea"
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Note admin"
                        readOnly={Boolean(savingAction)}
                      />
                    </label>
                  </div>

                  <div className="tagora-panel-muted account-requests-permissions">
                    {permissionOptions.map((option) => (
                      <label key={option.value} className="account-requests-permission-option">
                        <input
                          type="checkbox"
                          checked={assignedPermissions.includes(option.value)}
                          onChange={() => togglePermission(option.value)}
                          disabled={Boolean(savingAction)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="tagora-panel ui-stack-md">
                  <div className="ui-stack-xs">
                    <h2 className="section-title" style={{ marginBottom: 0 }}>
                      Actions compte
                    </h2>
                    <p className="tagora-note" style={{ margin: 0 }}>
                      Activation, invitation, modification d acces et administration du compte.
                    </p>
                  </div>

                  {selectedRequest.existing_account?.exists ? (
                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={confirmOverwriteExistingAccount}
                        onChange={() =>
                          setConfirmOverwriteExistingAccount((current) => !current)
                        }
                      />
                      <span>Autoriser le remplacement des acces existants</span>
                    </label>
                  ) : null}

                  {selectedRequest.review_lock?.isLocked ? (
                    <div className="account-requests-lock">
                      Traitement verrouille jusqu au {formatDate(selectedRequest.review_lock.expiresAt)}.
                    </div>
                  ) : null}

                  {primaryAction ? (
                    <div
                      className="tagora-panel-muted"
                      style={{ display: "grid", gap: 14, padding: 20, border: "1px solid #c7d2fe" }}
                    >
                      <div>
                        <div className="tagora-field-label">Action principale</div>
                        <p className="tagora-note" style={{ margin: "8px 0 0" }}>
                          {primaryAction.action === "approve"
                            ? "Cree ou active le compte avec les acces choisis."
                            : "Enregistre les changements de role, permissions et note admin."}
                        </p>
                      </div>
                      <div className="account-requests-actions">
                        <button
                          type="button"
                          className={getButtonClassName(primaryAction.tone)}
                          onClick={() => void runAction(primaryAction.action)}
                          disabled={Boolean(savingAction)}
                        >
                          {savingAction === primaryAction.action ? "Traitement..." : primaryAction.label}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {secondaryActions.length > 0 ? (
                    <div className="tagora-panel-muted" style={{ display: "grid", gap: 14, padding: 20 }}>
                      <div>
                        <div className="tagora-field-label">Actions secondaires</div>
                        <p className="tagora-note" style={{ margin: "8px 0 0" }}>
                          Actions complementaires selon l etat reel du compte.
                        </p>
                      </div>
                      <div className="account-requests-actions">
                        {secondaryActions.map((item) => {
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
                  ) : null}

                  {destructiveAction ? (
                    <div
                      className="tagora-panel-muted"
                      style={{ display: "grid", gap: 14, padding: 20, border: "1px solid #fecaca" }}
                    >
                      <div>
                        <div className="tagora-field-label">Action destructive</div>
                        <p className="tagora-note" style={{ margin: "8px 0 0" }}>
                          Action irreversible sur la demande de compte.
                        </p>
                      </div>
                      <div className="account-requests-actions">
                        <button
                          type="button"
                          className="tagora-btn-danger"
                          onClick={() => void runAction(destructiveAction.action)}
                          disabled={Boolean(savingAction)}
                        >
                          {savingAction === destructiveAction.action ? "Traitement..." : destructiveAction.label}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="account-requests-summary-item">
      <span className="account-requests-card-meta-label">{label}</span>
      <span className="account-requests-summary-value">{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pending" | "invited" | "active" | "refused" | "error";
}) {
  return (
    <div className={`tagora-stat-card account-requests-stat-card account-requests-stat-${tone}`}>
      <div className="tagora-stat-label">{label}</div>
      <div className="tagora-stat-value">{value}</div>
    </div>
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
  if (action === "reset_pending") return "Demande remise en attente.";
  if (action === "resend_invitation") return "Invitation renvoyee avec succes.";
  if (action === "disable_access") return "Acces desactive avec succes.";
  if (action === "retry") return "Traitement relance avec succes.";
  return "Demande supprimee avec succes.";
}
