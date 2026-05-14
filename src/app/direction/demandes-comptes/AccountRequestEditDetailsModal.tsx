"use client";

import { useEffect, useState } from "react";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import {
  ACCOUNT_REQUEST_COMPANIES,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";

type SavePayload = {
  fullName: string;
  email: string;
  phone: string;
  company: AccountRequestCompany;
  requestedRole: "employe" | "direction";
  requestedPermissions: string[];
  message: string;
};

export default function AccountRequestEditDetailsModal({
  request,
  open,
  onClose,
  saving,
  onSave,
}: {
  request: AccountAccessRequestRecord | null;
  open: boolean;
  onClose: () => void;
  saving: boolean;
  onSave: (payload: SavePayload) => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState<AccountRequestCompany>("oliem_solutions");
  const [requestedRole, setRequestedRole] = useState<"employe" | "direction">("employe");
  const [requestedPermissions, setRequestedPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !request) {
      return;
    }
    setFullName(request.full_name ?? "");
    setEmail(request.email ?? "");
    setPhone(request.phone ?? "");
    setCompany((request.company as AccountRequestCompany) ?? "oliem_solutions");
    const rr = request.requested_role === "direction" ? "direction" : "employe";
    setRequestedRole(rr);
    setRequestedPermissions(
      Array.isArray(request.requested_permissions) ? [...request.requested_permissions] : []
    );
    setMessage(request.message ?? "");
  }, [open, request]);

  if (!open || !request) {
    return null;
  }

  function togglePermission(slug: string) {
    setRequestedPermissions((prev) =>
      prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug]
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onSave({
      fullName,
      email,
      phone,
      company,
      requestedRole,
      requestedPermissions,
      message,
    });
  }

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
        disabled={saving}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          background: "transparent",
          cursor: saving ? "default" : "pointer",
        }}
      />

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="tagora-panel ui-stack-md"
        style={{
          position: "relative",
          width: "min(520px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 20,
          borderRadius: 16,
          boxShadow: "0 18px 48px rgba(15,23,42,0.18)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-stack-xs">
          <div className="tagora-label">Modifier la demande</div>
          <h2 className="section-title" style={{ margin: 0 }}>
            Informations du demandeur
          </h2>
          <p className="tagora-note" style={{ margin: 0 }}>
            Les corrections sont enregistrées avant approbation. Le courriel est normalisé en
            minuscules.
          </p>
        </div>

        <div className="tagora-form-grid">
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Nom complet</span>
            <input
              className="tagora-input"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={saving}
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
              onChange={(event) => setEmail(event.target.value)}
              disabled={saving}
              required
            />
          </label>

          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Téléphone</span>
            <input
              className="tagora-input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={saving}
            />
          </label>

          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Entreprise</span>
            <select
              className="tagora-input"
              value={company}
              onChange={(event) =>
                setCompany(event.target.value as AccountRequestCompany)
              }
              disabled={saving}
            >
              {ACCOUNT_REQUEST_COMPANIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Rôle demandé</span>
            <select
              className="tagora-input"
              value={requestedRole}
              onChange={(event) =>
                setRequestedRole(event.target.value === "direction" ? "direction" : "employe")
              }
              disabled={saving}
            >
              <option value="employe">Employé</option>
              <option value="direction">Direction</option>
            </select>
          </label>

          <div className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Permissions demandées</span>
            <div className="tagora-panel-muted account-requests-permissions" style={{ marginTop: 6 }}>
              {accountRequestPermissionOptions.map((option) => (
                <label key={option.value} className="account-requests-permission-option">
                  <input
                    type="checkbox"
                    checked={requestedPermissions.includes(option.value)}
                    onChange={() => togglePermission(option.value)}
                    disabled={saving}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Message (optionnel)</span>
            <textarea
              className="tagora-textarea"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={saving}
              rows={3}
            />
          </label>
        </div>

        <div className="tagora-note" style={{ marginTop: 4 }}>
          Portail source : {request.portal_source} · Entreprise affichée :{" "}
          {ACCOUNT_REQUEST_COMPANIES.find((c) => c.value === company)?.label ?? company}
        </div>

        <div className="tagora-actions" style={{ marginTop: 8 }}>
          <button type="submit" className="tagora-dark-action" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button
            type="button"
            className="tagora-dark-outline-action"
            onClick={onClose}
            disabled={saving}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
