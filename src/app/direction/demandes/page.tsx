"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";
import type { AppRole } from "@/app/lib/auth/roles";

type AccountRequestStatus =
  | "pending"
  | "invited"
  | "active"
  | "refused"
  | "error";

type AccountRequest = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: AccountRequestCompany;
  portal_source: AppRole;
  requested_role: AppRole;
  requested_permissions: string[] | null;
  message: string | null;
  status: AccountRequestStatus;
  created_at: string;
};

type ReviewAction = "approve" | "refuse";

const permissionLabelByValue = new Map(
  accountRequestPermissionOptions.map((permission) => [
    permission.value,
    permission.label,
  ])
);
type SupportedPermission = (typeof accountRequestPermissionOptions)[number]["value"];

function formatRole(role: AppRole) {
  return role === "direction" ? "Direction" : "Employe";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPermissions(permissions: string[] | null) {
  if (!permissions || permissions.length === 0) {
    return "Aucune";
  }

  return permissions
    .map((permission) => {
      const supportedPermission = permission as SupportedPermission;

      return permissionLabelByValue.get(supportedPermission) ?? permission;
    })
    .join(", ");
}

function getDisplayStatus(status: AccountRequestStatus) {
  if (status === "active") {
    return {
      label: "actif",
      color: "#166534",
      background: "#dcfce7",
      borderColor: "#86efac",
    };
  }

  if (status === "invited") {
    return {
      label: "invite",
      color: "#1d4ed8",
      background: "#dbeafe",
      borderColor: "#93c5fd",
    };
  }

  if (status === "refused") {
    return {
      label: "refuse",
      color: "#991b1b",
      background: "#fee2e2",
      borderColor: "#fca5a5",
    };
  }

  if (status === "error") {
    return {
      label: "erreur",
      color: "#9a3412",
      background: "#ffedd5",
      borderColor: "#fdba74",
    };
  }

  return {
    label: "en attente",
    color: "#92400e",
    background: "#fef3c7",
    borderColor: "#fcd34d",
  };
}

export default function DirectionDemandesPage() {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(
    null
  );
  const [processingId, setProcessingId] = useState<string | null>(null);

  const sortedRequests = useMemo(() => {
    return [...requests].sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  }, [requests]);

  const pendingCount = useMemo(
    () => sortedRequests.filter((request) => request.status === "pending").length,
    [sortedRequests]
  );

  async function fetchRequests() {
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
        setRequests([]);
        setMessage(payload.error || "Erreur lors du chargement des demandes.");
        setMessageType("error");
        return;
      }

      setRequests(Array.isArray(payload.requests) ? payload.requests : []);
      setMessage("");
      setMessageType(null);
    } catch {
      setRequests([]);
      setMessage("Impossible de charger les demandes pour le moment.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRequests();
  }, []);

  async function handleDecision(request: AccountRequest, action: ReviewAction) {
    setProcessingId(request.id);
    setMessage("");
    setMessageType(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    try {
      const response = await fetch(`/api/account-requests/${request.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          action,
          assignedRole: request.requested_role,
          assignedPermissions: request.requested_permissions ?? [],
          reviewNote: null,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(
          payload.error ||
            "L'action a ete preparee, mais la validation n'a pas pu etre executee."
        );
        setMessageType("error");
        return;
      }

      setMessage(
        action === "approve"
          ? "La demande a ete approuvee."
          : "La demande a ete refusee."
      );
      setMessageType("success");
      await fetchRequests();
    } catch {
      setMessage(
        "La structure d'action est en place, mais la requete n'a pas pu aboutir."
      );
      setMessageType("error");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 1600 }}>
        <HeaderTagora
          title="Demandes de creation de compte"
          subtitle="Demandes et statuts."
        />

        <div className="tagora-stat-grid" style={{ marginBottom: 24 }}>
          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Demandes en attente</div>
            <div className="tagora-stat-value">{pendingCount}</div>
          </div>

          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Total des demandes</div>
            <div className="tagora-stat-value">{sortedRequests.length}</div>
          </div>
        </div>

        <section className="tagora-panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            <div>
              <h2 className="section-title" style={{ marginBottom: 10 }}>
                Liste des demandes
              </h2>
                <p className="tagora-note">Plus recentes d abord.</p>
            </div>

            <button
              type="button"
              className="tagora-dark-outline-action"
              onClick={() => void fetchRequests()}
              disabled={loading}
            >
              {loading ? "Chargement..." : "Actualiser"}
            </button>
          </div>

          <FeedbackMessage message={message} type={messageType} />

          {loading ? (
            <p className="tagora-note" style={{ marginTop: 18 }}>
              Chargement...
            </p>
          ) : sortedRequests.length === 0 ? (
            <p className="tagora-note" style={{ marginTop: 18 }}>
              Aucune demande.
            </p>
          ) : (
            <div
              style={{
                marginTop: 18,
                overflowX: "auto",
                border: "1px solid #e2e8f0",
                borderRadius: 18,
                background: "#ffffff",
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: 1500,
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr style={{ background: "#eff6ff" }}>
                    {[
                      "Nom complet",
                      "Courriel",
                      "Telephone",
                      "Compagnie",
                      "Portail source",
                      "Role demande",
                      "Permissions demandees",
                      "Message",
                      "Statut",
                      "Date de creation",
                      "Actions",
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: "14px 16px",
                          textAlign: "left",
                          fontSize: 13,
                          fontWeight: 800,
                          color: "#17376b",
                          borderBottom: "1px solid #dbeafe",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {sortedRequests.map((request, index) => {
                    const status = getDisplayStatus(request.status);
                    const isPending = request.status === "pending";
                    const isProcessing = processingId === request.id;

                    return (
                      <tr
                        key={request.id}
                        style={{
                          background: index % 2 === 0 ? "#ffffff" : "#f8fafc",
                        }}
                      >
                        <td style={cellStyle}>{request.full_name}</td>
                        <td style={cellStyle}>{request.email}</td>
                        <td style={cellStyle}>{request.phone || "-"}</td>
                        <td style={cellStyle}>
                          {request.company ? getCompanyLabel(request.company) : "-"}
                        </td>
                        <td style={cellStyle}>{formatRole(request.portal_source)}</td>
                        <td style={cellStyle}>{formatRole(request.requested_role)}</td>
                        <td style={{ ...cellStyle, minWidth: 220 }}>
                          {formatPermissions(request.requested_permissions)}
                        </td>
                        <td style={{ ...cellStyle, minWidth: 260 }}>
                          {request.message || "-"}
                        </td>
                        <td style={cellStyle}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              color: status.color,
                              background: status.background,
                              border: `1px solid ${status.borderColor}`,
                            }}
                            title={`Statut API: ${request.status}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td style={cellStyle}>{formatDate(request.created_at)}</td>
                        <td style={{ ...cellStyle, minWidth: 220 }}>
                          <div className="tagora-actions">
                            <button
                              type="button"
                              className="tagora-btn tagora-btn-primary"
                              disabled={!isPending || isProcessing}
                              onClick={() => void handleDecision(request, "approve")}
                            >
                              {isProcessing ? "Traitement..." : "Approuver"}
                            </button>

                            <button
                              type="button"
                              className="tagora-btn-danger"
                              disabled={!isPending || isProcessing}
                              onClick={() => void handleDecision(request, "refuse")}
                            >
                              {isProcessing ? "Traitement..." : "Refuser"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "16px",
  verticalAlign: "top",
  borderBottom: "1px solid #e2e8f0",
  fontSize: 14,
  color: "#334155",
  lineHeight: 1.5,
};
