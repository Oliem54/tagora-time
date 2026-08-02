"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  LayoutDashboard,
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
  getAccountRequestPortalSummaryLabel,
  isAccessDisabledRequest,
  matchesAccountAccessFilter,
} from "@/app/lib/account-access";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";
import AccountRequestCreateModal, {
  type CreateAccountPayload,
} from "./AccountRequestCreateModal";
import AccountRequestManageModal, {
  type AccountSecurityAction,
  type ManageIdentityPayload,
} from "./AccountRequestManageModal";
import AccountRequestMobileCard from "./AccountRequestMobileCard";
import AccountRequestRowActions from "./AccountRequestRowActions";
import EmployeeLinkCellContent from "./EmployeeLinkCellContent";
import { isReconciliationCandidate } from "@/app/lib/account-reconcile.shared";
import { RECONCILE_EXISTING_ACCOUNT_CONFIRM_MESSAGE } from "@/app/lib/account-reconcile.shared";

type RequestRole = "employe" | "direction" | "admin";

const fallbackPermissions = [...accountRequestPermissionOptions];

function formatRole(role: RequestRole | string | null | undefined) {
  if (role === "admin") return "Admin";
  if (role === "direction") return "Direction";
  if (role === "employe") return "Employé";
  return "Non défini";
}

function getViewerRoleLabel(role: string | null | undefined) {
  if (role === "admin") return "Admin";
  if (role === "direction") return "Direction";
  if (role === "manager") return "Manager";
  if (role === "employe" || role === "employee") return "Employe";
  return null;
}

function buildApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const rawError =
    "error" in payload && typeof payload.error === "string" ? payload.error : null;

  if (
    rawError &&
    (rawError.includes("ecrasement") ||
      rawError.includes("écrasement") ||
      rawError.includes("compte existe deja"))
  ) {
    return "Ce compte portail existe déjà et est lié à cette demande. Utilisez « Gérer » pour consulter l'accès actuel. Pour modifier le rôle ou les permissions, cochez « Autoriser le remplacement des accès existants » en comprenant que cela écrasera les droits actuels du compte.";
  }

  const parts = [
    rawError,
    "details" in payload && typeof payload.details === "string" ? payload.details : null,
    "hint" in payload && typeof payload.hint === "string" ? payload.hint : null,
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(" | ") : fallback;
}

function getStatusLabel(status: AccountAccessStatus, request?: AccountAccessRequestRecord) {
  if (request && isAccessDisabledRequest(request)) return "Inactif (portail)";
  if (status === "active") return "Actif";
  if (status === "invited") return "Invité";
  if (status === "refused") return "Refusé";
  if (status === "error") return "Erreur";
  return "Demande en attente";
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
  if (action === "reactivate_access") return "Acces reactive avec succes.";
  return "Traitement relance avec succes.";
}

const STATUS_FILTER_OPTIONS: Array<{ value: AccountAccessListFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "pending", label: "En attente" },
  { value: "invited", label: "Invités" },
  { value: "active", label: "Actifs" },
  { value: "disabled", label: "Inactifs" },
  { value: "refused", label: "Refusés" },
  { value: "error", label: "Erreurs" },
];

function AccountRequestsFilterBar({
  statusFilter,
  counts,
  total,
  onSelect,
}: {
  statusFilter: AccountAccessListFilter;
  counts: {
    pending: number;
    invited: number;
    active: number;
    disabled: number;
    refused: number;
    error: number;
  };
  total: number;
  onSelect: (value: AccountAccessListFilter) => void;
}) {
  return (
    <div className="accounts-premium-filter-bar" role="tablist" aria-label="Filtrer les demandes">
      {STATUS_FILTER_OPTIONS.map((option) => {
        const count = option.value === "all" ? total : counts[option.value];
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={statusFilter === option.value}
            className={`accounts-premium-filter-chip${
              statusFilter === option.value ? " accounts-premium-filter-chip--active" : ""
            }`}
            onClick={() => onSelect(option.value)}
          >
            <span>{option.label}</span>
            <span className="accounts-premium-filter-chip__count">{count}</span>
          </button>
        );
      })}
    </div>
  );
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
  const [reconcilingRequestId, setReconcilingRequestId] = useState<string | null>(null);
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
      pending: sortedRequests.filter(
        (item) => item.status === "pending" && !isAccessDisabledRequest(item)
      ).length,
      invited: sortedRequests.filter(
        (item) => item.status === "invited" && !isAccessDisabledRequest(item)
      ).length,
      active: sortedRequests.filter(
        (item) => item.status === "active" && !isAccessDisabledRequest(item)
      ).length,
      disabled: sortedRequests.filter((item) => isAccessDisabledRequest(item)).length,
      refused: sortedRequests.filter(
        (item) => item.status === "refused" && !isAccessDisabledRequest(item)
      ).length,
      error: sortedRequests.filter(
        (item) => item.status === "error" && !isAccessDisabledRequest(item)
      ).length,
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
    setMessage("");
    setMessageType(null);
  }, [statusFilter]);

  useEffect(() => {
    if (managingRequestId) {
      setMessage("");
      setMessageType(null);
    }
  }, [managingRequestId]);

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
          creationSource: "direction_manual",
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

  async function reconcileExistingAccount(request: AccountAccessRequestRecord) {
    if (!accessToken || !canManageRoles) {
      setMessage("Action réservée aux administrateurs.");
      setMessageType("error");
      return;
    }

    const confirmed = window.confirm(RECONCILE_EXISTING_ACCOUNT_CONFIRM_MESSAGE);
    if (!confirmed) {
      return;
    }

    setReconcilingRequestId(request.id);
    setMessage("");
    setMessageType(null);

    try {
      const response = await window.fetch(
        `/api/account-requests/${request.id}/reconcile-existing-account`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-account-requests-client": "browser-authenticated",
            "x-account-requests-page": "direction-demandes-comptes",
          },
          body: JSON.stringify({
            employeeId: request.employee_link?.id ?? null,
            reviewNote: reviewNote.trim() || null,
          }),
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        setMessage(
          buildApiErrorMessage(payload, "La réconciliation du compte existant a échoué.")
        );
        setMessageType("error");
        return;
      }

      setMessage("Demande réconciliée avec le compte portail existant.");
      setMessageType("success");
      await fetchRequests();
    } catch {
      setMessage("La réconciliation du compte existant a échoué.");
      setMessageType("error");
    } finally {
      setReconcilingRequestId(null);
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

    setReactivatingRequestId(request.id);
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
          action: "reactivate_access",
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
        setMessage(buildApiErrorMessage(payload, "La réactivation de l'accès a échoué."));
        setMessageType("error");
        return;
      }

      setMessage(getSuccessMessage("reactivate_access"));
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
    <main className="tagora-app-shell account-requests-page account-requests-page--2027">
      <div className="tagora-app-content account-requests-premium-layout account-requests-premium-layout--2027">
        <section className="account-requests-premium-hero accounts-premium-hero--lite">
          <div className="account-requests-premium-logo-card accounts-premium-logo-card--lite">
            <Image
              src="/logo.png"
              alt="Logo TAGORA"
              width={140}
              height={70}
              priority
              className="account-requests-premium-logo"
            />
          </div>

          <div className="account-requests-premium-hero-copy">
            <h1 className="account-requests-premium-title">Demandes de comptes</h1>
            <p className="account-requests-premium-description">
              Suivez les demandes d&apos;accès et leur lien avec les fiches employés.
            </p>
          </div>

          <div className="account-requests-premium-hero-actions accounts-premium-hero-actions--compact">
            {user?.email ? <UserIdentityBadge value={user.email} roleLabel={viewerRoleLabel} /> : null}
            <Link
              href="/direction/comptes-employes"
              className="account-requests-hero-button account-requests-hero-button-secondary"
            >
              Registre comptes employés
            </Link>
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

        <AccountRequestsFilterBar
          statusFilter={statusFilter}
          total={sortedRequests.length}
          counts={{
            pending: counts.pending,
            invited: counts.invited,
            active: counts.active,
            disabled: counts.disabled,
            refused: counts.refused,
            error: counts.error,
          }}
          onSelect={setStatusFilter}
        />

        <FeedbackMessage message={message} type={messageType} />

        <section className="account-requests-premium-shell accounts-premium-shell--lite">
          <div className="account-requests-premium-toolbar accounts-premium-toolbar--lite">
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
              <table className="account-requests-premium-table account-requests-premium-table--demandes-lite">
                <colgroup>
                  <col style={{ width: "36%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Demandeur</th>
                    <th>Statut</th>
                    <th>Fiche employé</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <div className="account-requests-requester">
                          <div className="account-requests-requester-name">{request.full_name}</div>
                          <div className="account-requests-requester-meta">{request.email}</div>
                          <div className="account-requests-requester-meta account-requests-requester-meta--sub">
                            {formatRole(request.portal_source)} ·{" "}
                            {formatRole((request.assigned_role ?? request.requested_role) as RequestRole)} ·{" "}
                            {getCompanyLabel(request.company as AccountRequestCompany)}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="account-requests-cell-stack account-requests-cell-stack--compact">
                          <div className="account-requests-cell-badge-row">
                            <StatusBadge
                              label={getStatusLabel(request.status, request)}
                              tone={getStatusTone(request.status, request)}
                            />
                            {isReconciliationCandidate(request) ? (
                              <StatusBadge label="À réconcilier" tone="warning" />
                            ) : null}
                          </div>
                          <span className="account-requests-cell-sub">
                            {getAccountRequestPortalSummaryLabel(request) ??
                              (request.existing_account?.exists
                                ? "Compte détecté"
                                : "Compte à créer")}
                          </span>
                        </div>
                      </td>
                      <td className="account-requests-cell-employee">
                        <EmployeeLinkCellContent request={request} />
                      </td>
                      <td>
                        <AccountRequestRowActions
                          request={request}
                          onManage={() => setManagingRequestId(request.id)}
                          onDelete={() => void deleteRequest(request)}
                          onDisableAccess={() => void disableRequestAccess(request)}
                          onReactivateAccess={() => void reactivateRequestAccess(request)}
                          onReconcile={() => void reconcileExistingAccount(request)}
                          deleting={deletingRequestId === request.id}
                          disabling={disablingRequestId === request.id}
                          reactivating={reactivatingRequestId === request.id}
                          reconciling={reconcilingRequestId === request.id}
                          canDelete={canManageRoles}
                          canManage={canOpenManage}
                          canManageRoles={canManageRoles}
                          variant="compact"
                        />
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
                  onReconcile={() => void reconcileExistingAccount(request)}
                  deleting={deletingRequestId === request.id}
                  disabling={disablingRequestId === request.id}
                  reactivating={reactivatingRequestId === request.id}
                  reconciling={reconcilingRequestId === request.id}
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
        onReconcileExistingAccount={() => {
          if (managingRequest) void reconcileExistingAccount(managingRequest);
        }}
        deleting={Boolean(managingRequest && deletingRequestId === managingRequest.id)}
        reactivating={Boolean(managingRequest && reactivatingRequestId === managingRequest.id)}
        reconciling={Boolean(managingRequest && reconcilingRequestId === managingRequest.id)}
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
