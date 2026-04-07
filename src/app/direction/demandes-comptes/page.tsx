"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import { supabase } from "@/app/lib/supabase/client";

type AccountRequest = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  portal_source: "employe" | "direction";
  requested_role: "employe" | "direction";
  requested_permissions: string[] | null;
  message: string | null;
  status: "pending" | "invited" | "active" | "refused" | "error";
  assigned_role: "employe" | "direction" | null;
  assigned_permissions: string[] | null;
  review_note: string | null;
  reviewed_at: string | null;
  last_error?: string | null;
  existing_account?: {
    exists: boolean;
    userId: string | null;
    role: "employe" | "direction" | null;
    permissions: string[];
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

export default function DirectionAccountRequestsPage() {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignedRole, setAssignedRole] = useState<"employe" | "direction">("employe");
  const [assignedPermissions, setAssignedPermissions] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmOverwriteExistingAccount, setConfirmOverwriteExistingAccount] =
    useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [permissionOptions, setPermissionOptions] = useState<
    Array<{ value: string; label: string }>
  >([...accountRequestPermissionOptions]);

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === "pending").length,
    [requests]
  );

  function getStatusPresentation(status: AccountRequest["status"]) {
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

  async function fetchRequests() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

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
      setLoading(false);
      return;
    }

    setRequests(payload.requests ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchRequests();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    async function loadPermissions() {
      try {
        const response = await fetch("/api/permissions");
        const payload = await response.json();

        if (response.ok && Array.isArray(payload.permissions) && payload.permissions.length > 0) {
          setPermissionOptions(payload.permissions);
        }
      } catch {
        setPermissionOptions([...accountRequestPermissionOptions]);
      }
    }

    void loadPermissions();
  }, []);

  function openReview(request: AccountRequest) {
    setSelectedId(request.id);
    setAssignedRole(request.requested_role || "employe");
    setAssignedPermissions(request.requested_permissions || []);
    setReviewNote("");
    setConfirmOverwriteExistingAccount(false);
  }

  function togglePermission(permission: string) {
    setAssignedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission]
    );
  }

  async function handleReview(action: "approve" | "refuse") {
    if (!selectedId) return;

    setSaving(true);
    setMessage("");
    setMessageType(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    const response = await fetch(`/api/account-requests/${selectedId}`, {
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
        assignedRole,
        assignedPermissions,
        reviewNote,
        confirmOverwriteExistingAccount,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error || "Erreur traitement demande.");
      setMessageType("error");
      setSaving(false);
      return;
    }

    setMessage(
      action === "approve"
        ? "Demande approuvee avec succes."
        : "Demande refusee avec succes."
    );
    setMessageType("success");
    setSelectedId(null);
    setReviewNote("");
    await fetchRequests();
    setSaving(false);
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 1500 }}>
        <HeaderTagora
          title="Demandes de comptes"
          subtitle="Examinez, approuvez ou refusez les demandes avant toute activation d'acces."
        />

        <div className="tagora-stat-grid" style={{ marginBottom: 24 }}>
          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Demandes en attente</div>
            <div className="tagora-stat-value">{pendingCount}</div>
          </div>

          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Total demandes</div>
            <div className="tagora-stat-value">{requests.length}</div>
          </div>

          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Invitations en attente</div>
            <div className="tagora-stat-value">
              {requests.filter((item) => item.status === "invited").length}
            </div>
          </div>

          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Comptes actifs</div>
            <div className="tagora-stat-value">
              {requests.filter((item) => item.status === "active").length}
            </div>
          </div>

          <div className="tagora-stat-card">
            <div className="tagora-stat-label">Erreurs</div>
            <div className="tagora-stat-value">
              {requests.filter((item) => item.status === "error").length}
            </div>
          </div>
        </div>

        <FeedbackMessage message={message} type={messageType} />

        <div className="tagora-split" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(340px, 0.7fr)" }}>
          <section className="tagora-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h2 className="section-title" style={{ marginBottom: 10 }}>Liste des demandes</h2>
                <p className="tagora-note">Chaque demande reste inactive tant que la direction ne la valide pas.</p>
              </div>

              <div className="tagora-actions">
                <button
                  type="button"
                  className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
                  onClick={() => {
                    setLoading(true);
                    setMessage("");
                    setMessageType(null);
                    void fetchRequests();
                  }}
                >
                  Actualiser
                </button>

                <Link
                  href="/direction/dashboard"
                  className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
                >
                  Retour dashboard
                </Link>
              </div>
            </div>

            {loading ? (
              <p className="tagora-note">Chargement des demandes...</p>
            ) : requests.length === 0 ? (
              <p className="tagora-note">Aucune demande de compte pour le moment.</p>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {requests.map((request) => {
                  const status = getStatusPresentation(request.status);

                  return (
                    <div key={request.id} className="tagora-panel-muted">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "start" }}>
                      <div>
                        <h3 style={{ margin: "0 0 8px 0", fontSize: 20, color: "#17376b" }}>
                          {request.full_name}
                        </h3>
                        <div className="tagora-note">{request.email}</div>
                        <div className="tagora-note">{request.phone || "Telephone non fourni"}</div>
                        <div className="tagora-note">{request.company || "Compagnie non fournie"}</div>
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
                      <div className="tagora-note">Portail source : {request.portal_source}</div>
                      <div className="tagora-note">Role souhaite : {request.requested_role}</div>
                      <div className="tagora-note">
                        Permissions souhaitees : {(request.requested_permissions || []).join(", ") || "Aucune"}
                      </div>
                      <div className="tagora-note">Message : {request.message || "Aucun commentaire"}</div>
                      {request.review_lock?.isLocked ? (
                        <div className="tagora-note" style={{ color: "#92400e" }}>
                          Traitement verrouille jusqu au {request.review_lock.expiresAt}.
                        </div>
                      ) : null}
                      {request.existing_account?.exists ? (
                        <div className="tagora-note" style={{ color: "#1d4ed8" }}>
                          Compte existant : role {request.existing_account.role || "non defini"}, permissions {(request.existing_account.permissions || []).join(", ") || "aucune"}, confirme {request.existing_account.emailConfirmed ? "oui" : "non"}.
                        </div>
                      ) : null}
                      {request.last_error ? (
                        <div className="tagora-note" style={{ color: "#b45309" }}>
                          Derniere erreur : {request.last_error}
                        </div>
                      ) : null}
                    </div>

                    {request.status === "pending" ? (
                      <div className="tagora-actions" style={{ marginTop: 16 }}>
                        <button
                          type="button"
                          className="tagora-btn tagora-btn-primary"
                          onClick={() => openReview(request)}
                        >
                          Examiner
                        </button>
                      </div>
                    ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="tagora-panel">
            <h2 className="section-title" style={{ marginBottom: 10 }}>
              Validation direction
            </h2>

            {!selectedId ? (
              <p className="tagora-note">
                Selectionnez une demande en attente pour choisir le role final, les autorisations et la decision.
              </p>
            ) : (
              <div className="tagora-form-grid">
                <div>
                  <label className="tagora-field-label">Role attribue</label>
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
                  <label className="tagora-field-label">Autorisations</label>
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
                  <label className="tagora-field-label">Note de revue</label>
                  <textarea
                    className="tagora-textarea"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Ajoutez une note interne ou une justification."
                  />
                </div>

                {selectedId ? (
                  (() => {
                    const selectedRequest =
                      requests.find((item) => item.id === selectedId) || null;

                    if (!selectedRequest?.existing_account?.exists) {
                      return null;
                    }

                    return (
                      <div className="tagora-panel-muted">
                        <p className="tagora-note" style={{ marginBottom: 10 }}>
                          Un compte existe deja pour ce courriel.
                        </p>
                        <p className="tagora-note" style={{ marginBottom: 10 }}>
                          Role actuel : {selectedRequest.existing_account.role || "non defini"}
                        </p>
                        <p className="tagora-note" style={{ marginBottom: 10 }}>
                          Permissions actuelles : {(selectedRequest.existing_account.permissions || []).join(", ") || "aucune"}
                        </p>
                        <label
                          style={{ display: "flex", alignItems: "center", gap: 10, color: "#334155" }}
                        >
                          <input
                            type="checkbox"
                            checked={confirmOverwriteExistingAccount}
                            onChange={(e) =>
                              setConfirmOverwriteExistingAccount(e.target.checked)
                            }
                          />
                          <span>Je confirme le remplacement du role et des permissions actuels.</span>
                        </label>
                      </div>
                    );
                  })()
                ) : null}

                <div className="tagora-actions">
                  <button
                    type="button"
                    className="tagora-btn tagora-btn-primary"
                    onClick={() => void handleReview("approve")}
                    disabled={saving}
                  >
                    {saving ? "Traitement..." : "Approuver"}
                  </button>

                  <button
                    type="button"
                    className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
                    onClick={() => void handleReview("refuse")}
                    disabled={saving}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
