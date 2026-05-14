"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import type { EmployeProfile } from "./employee-profile-shared";

type AccountSecuritySnapshot = {
  status: "no_account" | "invited" | "active" | "disabled";
  statusLabel: string;
  email: string | null;
  authUserId: string | null;
  accountExists: boolean;
  accountActivated: boolean;
  accessDisabled: boolean;
  availableActions: {
    resetPassword: boolean;
    sendResetLink: boolean;
    resendInvitation: boolean;
    disableAccount: boolean;
    reactivateAccount: boolean;
  };
};

type PortalRoleChoice = "employe" | "direction" | "manager" | "admin";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("fr-CA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function EmployeePortalAccessSection({
  employeeId,
  accessToken,
  viewerRole,
  profile,
  onRefresh,
}: {
  employeeId: number;
  accessToken: string | null;
  viewerRole: string | null | undefined;
  profile: EmployeProfile | null | undefined;
  onRefresh: () => void | Promise<void>;
}) {
  const canManage = viewerRole === "direction" || viewerRole === "admin";
  const [security, setSecurity] = useState<AccountSecuritySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localMessage, setLocalMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );
  const [portalRole, setPortalRole] = useState<PortalRoleChoice>("employe");
  const [portalPermissions, setPortalPermissions] = useState<string[]>([]);

  const loadSecurity = useCallback(async () => {
    if (!accessToken || !canManage) {
      setLoading(false);
      setSecurity(null);
      return;
    }

    setLoading(true);
    setLocalMessage(null);
    try {
      const res = await fetch(`/api/employees/${employeeId}/account-security`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        security?: AccountSecuritySnapshot;
        error?: string;
      };
      if (!res.ok) {
        setSecurity(null);
        setLocalMessage({
          type: "err",
          text: typeof json.error === "string" ? json.error : "Chargement du statut impossible.",
        });
        return;
      }
      setSecurity(json.security ?? null);
    } catch {
      setSecurity(null);
      setLocalMessage({ type: "err", text: "Erreur reseau lors du chargement du statut." });
    } finally {
      setLoading(false);
    }
  }, [accessToken, canManage, employeeId]);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  const displayStatus = useMemo(() => {
    if (profile?.account_invitation_status === "error" && profile.account_invitation_error) {
      return "Erreur invitation";
    }
    if (!security) {
      return profile?.account_invitation_status === "invited"
        ? "Invitation envoyee"
        : profile?.account_invitation_status === "active"
          ? "Compte actif"
          : profile?.account_invitation_status === "disabled"
            ? "Compte desactive"
            : "Aucun compte";
    }
    if (security.status === "active") return "Compte actif";
    if (security.status === "invited") return "Invitation envoyee";
    if (security.status === "disabled") return "Compte desactive";
    return "Aucun compte";
  }, [profile?.account_invitation_error, profile?.account_invitation_status, security]);

  const linked = Boolean(profile?.auth_user_id);

  async function postInvite(action: "invite" | "link" | "resend" | "disable_access") {
    if (!accessToken) {
      setLocalMessage({ type: "err", text: "Session expiree. Reconnectez-vous." });
      return;
    }

    setBusy(true);
    setLocalMessage(null);
    try {
      const res = await fetch(
        `/api/direction/ressources/employes/${employeeId}/invite-account`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            portalRole: action === "disable_access" ? undefined : portalRole,
            permissions: portalPermissions,
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!res.ok || json.success === false) {
        setLocalMessage({
          type: "err",
          text:
            typeof json.error === "string"
              ? json.error
              : "L operation n a pas pu etre effectuee.",
        });
        return;
      }

      setLocalMessage({
        type: "ok",
        text: typeof json.message === "string" ? json.message : "Operation reussie.",
      });
      await onRefresh();
      await loadSecurity();
    } catch {
      setLocalMessage({ type: "err", text: "Erreur reseau." });
    } finally {
      setBusy(false);
    }
  }

  function togglePermission(slug: string) {
    setPortalPermissions((prev) =>
      prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug]
    );
  }

  if (!canManage) {
    return null;
  }

  const showAdminRoles = viewerRole === "admin";
  const canInvite = Boolean(!linked && security && !security.accountExists);
  const canLink = Boolean(!linked && security?.accountExists);
  const canResend = Boolean(security?.availableActions?.resendInvitation);
  const canDisable = Boolean(security?.availableActions?.disableAccount);

  return (
    <section className="tagora-panel ui-stack-md" style={{ marginTop: 16 }}>
      <div className="ui-stack-xs">
        <h2 className="section-title" style={{ margin: 0 }}>
          Acces utilisateur
        </h2>
        <p className="tagora-note" style={{ margin: 0 }}>
          Rôle et permissions portail (accès au logiciel). Distinct des fonctions opérationnelles
          (Livreur, Technicien, etc.) définies plus bas sur la fiche.
        </p>
      </div>

      {localMessage ? (
        <div
          className="tagora-panel-muted"
          style={{
            padding: 12,
            borderRadius: 12,
            border:
              localMessage.type === "ok"
                ? "1px solid rgba(34,197,94,0.35)"
                : "1px solid rgba(239,68,68,0.35)",
            color: localMessage.type === "ok" ? "#166534" : "#b91c1c",
          }}
        >
          {localMessage.text}
        </div>
      ) : null}

      {loading ? (
        <p className="tagora-note" style={{ margin: 0 }}>
          Chargement du statut d acces...
        </p>
      ) : (
        <div
          className="tagora-panel-muted ui-stack-sm"
          style={{ padding: 16, borderRadius: 14, display: "grid", gap: 12 }}
        >
          <div
            className="tagora-form-grid"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}
          >
            <div>
              <div className="tagora-label">Statut du compte</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>{displayStatus}</div>
            </div>
            <div>
              <div className="tagora-label">Courriel du compte</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>
                {security?.email ?? profile?.courriel ?? "-"}
              </div>
            </div>
            <div>
              <div className="tagora-label">Compte lie</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>{linked ? "Oui" : "Non"}</div>
            </div>
            <div>
              <div className="tagora-label">Derniere invitation</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>
                {formatDateTime(profile?.account_invited_at ?? null)}
              </div>
            </div>
            <div>
              <div className="tagora-label">Invite par</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>
                {profile?.account_invited_by_name ?? "-"}
              </div>
            </div>
          </div>

          {profile?.account_invitation_status === "error" && profile.account_invitation_error ? (
            <div className="tagora-note" style={{ color: "#b91c1c", margin: 0 }}>
              Erreur : {profile.account_invitation_error}
            </div>
          ) : null}

          <div className="tagora-form-grid">
            <label className="tagora-field">
              <span className="tagora-label">Rôle d accès portail</span>
              <select
                className="tagora-input"
                value={portalRole}
                onChange={(e) => setPortalRole(e.target.value as PortalRoleChoice)}
                disabled={busy}
              >
                <option value="employe">Employe</option>
                <option value="direction">Direction</option>
                {showAdminRoles ? (
                  <>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </>
                ) : null}
              </select>
            </label>
          </div>

          <div className="ui-stack-xs">
            <div className="tagora-label">Permissions portail</div>
            <div className="tagora-panel-muted account-requests-permissions">
              {accountRequestPermissionOptions.map((opt) => (
                <label key={opt.value} className="account-requests-permission-option">
                  <input
                    type="checkbox"
                    checked={portalPermissions.includes(opt.value)}
                    onChange={() => togglePermission(opt.value)}
                    disabled={busy}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="tagora-actions" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className="tagora-dark-action"
              disabled={busy || !accessToken || !canInvite}
              onClick={() => void postInvite("invite")}
            >
              Inviter un compte utilisateur
            </button>
            <button
              type="button"
              className="tagora-dark-outline-action"
              disabled={busy || !accessToken || !canLink}
              onClick={() => void postInvite("link")}
            >
              Lier a un compte existant
            </button>
            <button
              type="button"
              className="tagora-dark-outline-action"
              disabled={busy || !accessToken || !canResend}
              onClick={() => void postInvite("resend")}
            >
              Renvoyer l invitation
            </button>
            <button
              type="button"
              className="tagora-dark-outline-action"
              disabled={busy || !accessToken || !canDisable}
              onClick={() => void postInvite("disable_access")}
            >
              Desactiver l acces
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
