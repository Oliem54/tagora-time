"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleAlert,
  Clock3,
  LayoutDashboard,
  Mail,
  OctagonX,
  UserCheck,
  UserPlus,
} from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import UserIdentityBadge from "@/app/components/ui/UserIdentityBadge";
import StatusBadge from "@/app/components/ui/StatusBadge";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import {
  type AccountAccessAction,
  type AccountAccessListFilter,
  type AccountAccessRequestRecord,
  type AccountAccessStatus,
  isAccessDisabledRequest,
  matchesAccountAccessFilter,
} from "@/app/lib/account-access";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";
import TagoraStatCard from "@/app/components/TagoraStatCard";
import type { TagoraStatTone } from "@/app/components/tagora-stat-tone";
import AccountRequestCreateModal, {
  type CreateAccountPayload,
} from "./AccountRequestCreateModal";
import AccountRequestManageModal, {
  type AccountSecurityAction,
  type ManageIdentityPayload,
} from "./AccountRequestManageModal";
import AccountRequestMobileCard from "./AccountRequestMobileCard";
import AccountRequestRowActions from "./AccountRequestRowActions";
import EmployeeLinkStatusBadge from "./EmployeeLinkStatusBadge";

type RequestRole = "employe" | "direction" | "admin";

const fallbackPermissions = [...accountRequestPermissionOptions];

function formatRole(role: RequestRole | null | undefined) {
  if (role === "admin") return "Admin";
  if (role === "direction") return "Direction";
  if (role === "employe") return "Employe";
  return "Non defini";
}

function getViewerRoleLabel(role: string | null | undefined) {
  if (role === "admin") return "Admin";
  if (role === "direction") return "Direction";
  if (role === "manager") return "Manager";
  if (role === "employe" || role === "employee") return "Employe";
  return null;
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

function getStatusLabel(status: AccountAccessStatus, request?: AccountAccessRequestRecord) {
  if (request && isAccessDisabledRequest(request)) return "Accès désactivé";
  if (status === "active") return "Actif";
  if (status === "invited") return "Invité";
  if (status === "refused") return "Refusé";
  if (status === "error") return "Erreur";
  return "En attente";
}

function getStatusTone(status: AccountAccessStatus, request?: AccountAccessRequestRecord) {
  if (request && isAccessDisabledRequest(request)) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "invited") return "info" as const;
  if (status === "refused") return "danger" as const;
  if (status === "error") return "warning" as const;
  return "warning" as const;
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

function accountStatTone(
  tone: "pending" | "invited" | "active" | "refused" | "error"
): TagoraStatTone {
  if (tone === "pending") return "orange";
  if (tone === "invited") return "blue";
  if (tone === "active") return "green";
  if (tone === "refused") return "red";
  return "orange";
}


export default function DirectionEmployeeAccountsClient() {
  const searchParams = useSearchParams();
  const { user, role } = useCurrentAccess();
  const canManageRoles = role === "admin";
  const canEditRequestDetails = role === "direction" || role === "admin";
  const viewerRoleLabel = getViewerRoleLabel(role);
  const [requests, setRequests] = useState<AccountAccessRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [managingRequestId, setManagingRequestId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [assignedRole, setAssignedRole] = useState<RequestRole>("employe");
  const [assignedPermissions, setAssignedPermissions] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmOverwriteExistingAccount, setConfirmOverwriteExistingAccount] =
    useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [savingAction, setSavingAction] = useState<AccountAccessAction | null>(null);
  const [securityAction, setSecurityAction] = useState<AccountSecurityAction | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [disablingRequestId, setDisablingRequestId] = useState<string | null>(null);
  const [reactivatingRequestId, setReactivatingRequestId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AccountAccessListFilter>("all");
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

  const filteredRequests = useMemo(
    () => sortedRequests.filter((item) => matchesAccountAccessFilter(item, statusFilter)),
    [sortedRequests, statusFilter]
  );

  const managingRequest = useMemo(
    () => sortedRequests.find((item) => item.id === managingRequestId) ?? null,
    [managingRequestId, sortedRequests]
  );

  const canOpenManage = canEditRequestDetails || canManageRoles;

  const counts = useMemo(
    () => ({
      pending: sortedRequests.filter((item) => item.status === "pending").length,
      invited: sortedRequests.filter((item) => item.status === "invited").length,
      active: sortedRequests.filter((item) => item.status === "active").length,
      disabled: sortedRequests.filter((item) => isAccessDisabledRequest(item)).length,
      refused: sortedRequests.filter(
        (item) => item.status === "refused" && !isAccessDisabledRequest(item)
      ).length,
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

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRequests();
  }, [accessToken, fetchRequests, isReady]);

  useEffect(() => {
    if (searchParams.get("create") === "1" && canEditRequestDetails) {
      setCreateOpen(true);
    }
  }, [canEditRequestDetails, searchParams]);

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
    if (!managingRequest) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignedRole(
      (managingRequest.assigned_role ??
        managingRequest.requested_role ??
        "employe") as RequestRole
    );
    setAssignedPermissions(
      managingRequest.assigned_permissions ?? managingRequest.requested_permissions ?? []
    );
    setReviewNote(managingRequest.review_note ?? "");
    setConfirmOverwriteExistingAccount(false);
  }, [managingRequest]);

  function togglePermission(permission: string) {
    setAssignedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission]
    );
  }

  async function saveRequestDetails(payload: ManageIdentityPayload) {
    if (!accessToken || !managingRequest) {
      return;
    }
    if (!canEditRequestDetails) {
      setMessage("Action reservee a la direction ou aux administrateurs.");
      setMessageType("error");
      return;
    }

    setSavingDetails(true);
    setMessage("");
    setMessageType(null);

    try {
      const response = await window.fetch(`/api/account-requests/${managingRequest.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-account-requests-client": "browser-authenticated",
          "x-account-requests-page": "direction-demandes-comptes",
        },
        body: JSON.stringify({
          action: "update_request_details",
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          company: payload.company,
          requestedRole: payload.requestedRole,
          requestedPermissions: payload.requestedPermissions,
          message: payload.message,
        }),
      });

      const responsePayload = await response.json();

      if (!response.ok) {
        setMessage(
          buildApiErrorMessage(
            responsePayload,
            "La mise a jour de la demande n a pas pu aboutir."
          )
        );
        setMessageType("error");
        return;
      }

      setMessage("Informations enregistrees avec succes.");
      setMessageType("success");
      await fetchRequests();
    } catch {
      setMessage("La mise a jour de la demande n a pas pu aboutir.");
      setMessageType("error");
    } finally {
      setSavingDetails(false);
    }
  }

  async function runAction(action: AccountAccessAction, request: AccountAccessRequestRecord) {
    if (!accessToken) {
      return;
    }
    if (!canManageRoles) {
      setMessage("Action reservee aux administrateurs.");
      setMessageType("error");
      return;
    }

    setSavingAction(action);
    setMessage("");
    setMessageType(null);

    if (action === "disable_access") {
      setDisablingRequestId(request.id);
    }

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
      if (action === "disable_access") {
        setDisablingRequestId(null);
      }
    }
  }

  async function runSecurityAction(
    action: AccountSecurityAction,
    request: AccountAccessRequestRecord,
    temporaryPassword?: string
  ) {
    if (!accessToken) {
      return;
    }
    if (!canManageRoles) {
      setMessage("Action reservee aux administrateurs.");
      setMessageType("error");
      return;
    }

    const securityUrl = request.employee_link?.id
      ? `/api/employees/${request.employee_link.id}/account-security`
      : `/api/account-requests/${request.id}/account-security`;

    setSecurityAction(action);
    setMessage("");
    setMessageType(null);

    try {
      const response = await fetch(securityUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-account-requests-client": "browser-authenticated",
        },
        body: JSON.stringify({
          action,
          ...(action === "set_temporary_password" && temporaryPassword
            ? { password: temporaryPassword }
            : {}),
        }),
      });
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

  async function createAccount(payload: CreateAccountPayload) {
    if (!canEditRequestDetails) {
      setMessage("Action reservee a la direction ou aux administrateurs.");
      setMessageType("error");
      return;
    }

    setCreating(true);
    setMessage("");
    setMessageType(null);

    try {
      const response = await fetch("/api/account-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone || null,
          company: payload.company,
          portalSource: payload.portalSource,
          requestedRole: payload.requestedRole,
          requestedPermissions: payload.requestedPermissions,
          message: payload.message || null,
        }),
      });

      const responsePayload = await response.json();

      if (!response.ok) {
        setMessage(
          buildApiErrorMessage(responsePayload, "La creation du profil n a pas pu aboutir.")
        );
        setMessageType("error");
        return;
      }

      setCreateOpen(false);
      setMessage(
        canManageRoles
          ? "Profil cree. Ouvrez « Gerer » pour approuver ou definir le mot de passe."
          : "Profil cree en attente d approbation par un administrateur."
      );
      setMessageType("success");
      await fetchRequests();
    } catch {
      setMessage("La creation du profil n a pas pu aboutir.");
      setMessageType("error");
    } finally {
      setCreating(false);
    }
  }

  async function disableRequestAccess(request: AccountAccessRequestRecord) {
    if (!accessToken || !canManageRoles) {
      setMessage("Action réservée aux administrateurs.");
      setMessageType("error");
      return;
    }

    const ok = window.confirm(
      "Désactiver l'accès portail pour cette demande ? L'utilisateur ne pourra plus se connecter, mais la fiche employé et l'historique seront conservés."
    );
    if (!ok) return;

    setDisablingRequestId(request.id);
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
          action: "disable_access",
          assignedRole:
            request.assigned_role ?? request.requested_role ?? assignedRole,
          assignedPermissions:
            request.assigned_permissions ??
            request.requested_permissions ??
            assignedPermissions,
          reviewNote: request.review_note ?? reviewNote,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(buildApiErrorMessage(payload, "La désactivation de l'accès a échoué."));
        setMessageType("error");
        return;
      }

      setMessage(getSuccessMessage("disable_access"));
      setMessageType("success");
      await fetchRequests();
    } catch {
      setMessage("La désactivation de l'accès a échoué.");
      setMessageType("error");
    } finally {
      setDisablingRequestId(null);
    }
  }

  async function reactivateRequestAccess(request: AccountAccessRequestRecord) {
    if (!accessToken || !canManageRoles) {
      setMessage("Action réservée aux administrateurs.");
      setMessageType("error");
      return;
    }

    const employeeId = request.employee_link?.id;
    if (!employeeId) {
      setMessage(
        "Réactivation impossible : aucune fiche employé liée. Ouvrez « Gérer » ou associez la fiche depuis la page employés."
      );
      setMessageType("error");
      return;
    }

    setReactivatingRequestId(request.id);
    setMessage("");
    setMessageType(null);

    try {
      const response = await fetch(`/api/employees/${employeeId}/account-security`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-account-requests-client": "browser-authenticated",
        },
        body: JSON.stringify({ action: "reactivate_account" }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(buildApiErrorMessage(payload, "La réactivation de l'accès a échoué."));
        setMessageType("error");
        return;
      }

      setMessage(
        typeof payload.message === "string"
          ? payload.message
          : "Accès réactivé avec succès."
      );
      setMessageType("success");
      await fetchRequests();
    } catch {
      setMessage("La réactivation de l'accès a échoué.");
      setMessageType("error");
    } finally {
      setReactivatingRequestId(null);
    }
  }

  async function deleteRequest(request: AccountAccessRequestRecord) {
    if (!accessToken) {
      return;
    }

    if (
      !window.confirm(
        "Supprimer définitivement cette demande de compte ? Cette action est irréversible et ne désactive pas l'accès portail existant."
      )
    ) {
      return;
    }

    setDeletingRequestId(request.id);
    setMessage("");
    setMessageType(null);

    try {
      const response = await fetch(`/api/account-requests/${request.id}`, {
        method: "DELETE",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-account-requests-client": "browser-authenticated",
          "x-account-requests-page": "direction-demandes-comptes",
        },
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 403) {
          setMessage("Seul un administrateur peut supprimer une demande.");
          setMessageType("error");
          return;
        }
        if (response.status === 404) {
          setMessage("La demande de compte est introuvable.");
          setMessageType("error");
          await fetchRequests();
          return;
        }
        setMessage(
          buildApiErrorMessage(payload, "La suppression de la demande n a pas pu aboutir.")
        );
        setMessageType("error");
        return;
      }

      setMessage("Demande de compte supprimee avec succes.");
      setMessageType("success");
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setManagingRequestId((current) => (current === request.id ? null : current));
    } catch {
      setMessage("La suppression de la demande n a pas pu aboutir.");
      setMessageType("error");
    } finally {
      setDeletingRequestId(null);
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
            <h1 className="account-requests-premium-title">
              Demandes de comptes · Gestion des accès
            </h1>
            <p className="account-requests-premium-description">
              Gérez les demandes de comptes, les accès portail et les liaisons avec les fiches
              employés.
            </p>
          </div>

          <div className="account-requests-premium-hero-actions">
            {user?.email ? <UserIdentityBadge value={user.email} roleLabel={viewerRoleLabel} /> : null}
            <Link
              href="/direction/ressources/employes"
              className="account-requests-hero-button account-requests-hero-button-secondary"
            >
              Fiches employés
            </Link>
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

        <div className="tagora-stat-grid tagora-stat-grid--five" style={{ marginBottom: 10 }}>
          <TagoraStatCard
            title="En attente"
            value={counts.pending}
            tone={accountStatTone("pending")}
            icon={<Clock3 strokeWidth={1.9} aria-hidden />}
          />
          <TagoraStatCard
            title="Invités"
            value={counts.invited}
            tone={accountStatTone("invited")}
            icon={<Mail strokeWidth={1.9} aria-hidden />}
          />
          <TagoraStatCard
            title="Actifs"
            value={counts.active}
            tone={accountStatTone("active")}
            icon={<UserCheck strokeWidth={1.9} aria-hidden />}
          />
          <TagoraStatCard
            title="Refusés"
            value={counts.refused}
            tone={accountStatTone("refused")}
            icon={<OctagonX strokeWidth={1.9} aria-hidden />}
          />
          <TagoraStatCard
            title="Erreurs"
            value={counts.error}
            tone={accountStatTone("error")}
            icon={<CircleAlert strokeWidth={1.9} aria-hidden />}
          />
        </div>

        <FeedbackMessage message={message} type={messageType} />

        <section className="account-requests-premium-shell">
          <div className="account-requests-premium-toolbar">
            <label className="tagora-field account-requests-status-filter" style={{ marginBottom: 0 }}>
              <span className="tagora-label">Filtrer par statut</span>
              <select
                className="tagora-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AccountAccessListFilter)}
              >
                <option value="all">Tous ({sortedRequests.length})</option>
                <option value="pending">En attente ({counts.pending})</option>
                <option value="invited">Invités ({counts.invited})</option>
                <option value="active">Actifs ({counts.active})</option>
                <option value="disabled">Désactivés ({counts.disabled})</option>
                <option value="refused">Refusés ({counts.refused})</option>
                <option value="error">Erreurs ({counts.error})</option>
              </select>
            </label>
            {canEditRequestDetails ? (
              <button
                type="button"
                className="account-requests-toolbar-button"
                onClick={() => setCreateOpen(true)}
              >
                <UserPlus size={14} />
                Ajouter un accès manuellement
              </button>
            ) : null}
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
          ) : filteredRequests.length === 0 ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Aucune demande ne correspond à ce filtre.
              </p>
            </div>
          ) : (
            <>
            <div className="account-requests-premium-table-wrap account-requests-premium-table-wrap--desktop">
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
                  {filteredRequests.map((request) => (
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
                            label={getStatusLabel(request.status, request)}
                            tone={getStatusTone(request.status, request)}
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
                            onManage={() => setManagingRequestId(request.id)}
                            onDelete={() => void deleteRequest(request)}
                            onDisableAccess={() => void disableRequestAccess(request)}
                            onReactivateAccess={() => void reactivateRequestAccess(request)}
                            deleting={deletingRequestId === request.id}
                            disabling={disablingRequestId === request.id}
                            reactivating={reactivatingRequestId === request.id}
                            canDelete={canManageRoles}
                            canManage={canOpenManage}
                            canManageRoles={canManageRoles}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="account-requests-mobile-list" aria-label="Liste des demandes de comptes">
              {filteredRequests.map((request) => (
                <AccountRequestMobileCard
                  key={request.id}
                  request={request}
                  onManage={() => setManagingRequestId(request.id)}
                  onDelete={() => void deleteRequest(request)}
                  onDisableAccess={() => void disableRequestAccess(request)}
                  onReactivateAccess={() => void reactivateRequestAccess(request)}
                  deleting={deletingRequestId === request.id}
                  disabling={disablingRequestId === request.id}
                  reactivating={reactivatingRequestId === request.id}
                  canDelete={canManageRoles}
                  canManage={canOpenManage}
                  canManageRoles={canManageRoles}
                />
              ))}
            </div>
            </>
          )}
        </section>
      </div>

      <AccountRequestManageModal
        open={Boolean(managingRequestId)}
        request={managingRequest}
        onClose={() => setManagingRequestId(null)}
        canManageRoles={canManageRoles}
        canEditDetails={canEditRequestDetails}
        permissionOptions={permissionOptions}
        assignedRole={assignedRole}
        assignedPermissions={assignedPermissions}
        reviewNote={reviewNote}
        confirmOverwriteExistingAccount={confirmOverwriteExistingAccount}
        savingAction={savingAction}
        savingDetails={savingDetails}
        securityAction={securityAction}
        onRoleChange={setAssignedRole}
        onReviewNoteChange={setReviewNote}
        onTogglePermission={togglePermission}
        onConfirmOverwriteChange={() =>
          setConfirmOverwriteExistingAccount((current) => !current)
        }
        onSaveIdentity={saveRequestDetails}
        onRunAction={(action) => {
          if (managingRequest) void runAction(action, managingRequest);
        }}
        onRunSecurityAction={(action, temporaryPassword) => {
          if (managingRequest) void runSecurityAction(action, managingRequest, temporaryPassword);
        }}
        onDelete={() => {
          if (managingRequest) void deleteRequest(managingRequest);
        }}
        onReactivateAccess={() => {
          if (managingRequest) void reactivateRequestAccess(managingRequest);
        }}
        deleting={Boolean(managingRequest && deletingRequestId === managingRequest.id)}
        reactivating={Boolean(managingRequest && reactivatingRequestId === managingRequest.id)}
      />

      <AccountRequestCreateModal
        open={createOpen}
        saving={creating}
        onClose={() => setCreateOpen(false)}
        onCreate={createAccount}
      />
    </main>
  );
}
