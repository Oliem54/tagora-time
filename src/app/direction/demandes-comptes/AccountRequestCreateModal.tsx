"use client";

import { useState } from "react";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import {
  ACCOUNT_REQUEST_COMPANIES,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";

export type CreateAccountPayload = {
  fullName: string;
  email: string;
  phone: string;
  company: AccountRequestCompany;
  portalSource: "employe" | "direction";
  requestedRole: "employe" | "direction";
  requestedPermissions: string[];
  message: string;
};

export default function AccountRequestCreateModal({
  open,
  saving,
  onClose,
  onCreate,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onCreate: (payload: CreateAccountPayload) => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState<AccountRequestCompany>("oliem_solutions");
  const [portalSource, setPortalSource] = useState<"employe" | "direction">("employe");
  const [requestedRole, setRequestedRole] = useState<"employe" | "direction">("employe");
  const [requestedPermissions, setRequestedPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  if (!open) {
    return null;
  }

  function togglePermission(slug: string) {
    setRequestedPermissions((prev) =>
      prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug]
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onCreate({
      fullName,
      email,
      phone,
      company,
      portalSource,
      requestedRole,
      requestedPermissions,
      message,
    });
  }

  return (
    <ModalOverlay onClose={onClose} busy={saving}>
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
          <div className="tagora-label">Nouveau profil</div>
          <h2 className="section-title" style={{ margin: 0 }}>
            Creer un compte employe
          </h2>
          <p className="tagora-note" style={{ margin: 0 }}>
            La demande est creee en attente. Un administrateur peut ensuite approuver, definir un
            mot de passe temporaire ou envoyer une invitation.
          </p>
        </div>

        <div className="tagora-form-grid">
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Nom complet</span>
            <input
              className="tagora-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              required
            />
          </label>
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Telephone</span>
            <input
              className="tagora-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Compagnie</span>
            <select
              className="tagora-input"
              value={company}
              onChange={(e) => setCompany(e.target.value as AccountRequestCompany)}
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
            <span className="tagora-label">Portail source</span>
            <select
              className="tagora-input"
              value={portalSource}
              onChange={(e) =>
                setPortalSource(e.target.value === "direction" ? "direction" : "employe")
              }
              disabled={saving}
            >
              <option value="employe">Employe</option>
              <option value="direction">Direction</option>
            </select>
          </label>
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Role demande</span>
            <select
              className="tagora-input"
              value={requestedRole}
              onChange={(e) =>
                setRequestedRole(e.target.value === "direction" ? "direction" : "employe")
              }
              disabled={saving}
            >
              <option value="employe">Employe</option>
              <option value="direction">Direction</option>
            </select>
          </label>
          <div className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Permissions</span>
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
              onChange={(e) => setMessage(e.target.value)}
              disabled={saving}
              rows={2}
            />
          </label>
        </div>

        <div className="tagora-actions">
          <button type="submit" className="tagora-dark-action" disabled={saving}>
            {saving ? "Creation..." : "Creer le profil"}
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
    </ModalOverlay>
  );
}

function ModalOverlay({
  children,
  onClose,
  busy,
}: {
  children: React.ReactNode;
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
