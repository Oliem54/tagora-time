"use client";

import { type CSSProperties, FormEvent, useCallback, useEffect, useState } from "react";

type NotifState = {
  improvements_email_notifications_enabled: boolean;
  improvements_sms_notifications_enabled: boolean;
  improvements_notification_email: string;
  improvements_notification_phone: string;
  accountEmail: string;
};

const switchStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  color: "#0f2948",
};

export default function AdminImprovementNotificationsAccountSection({
  accessToken,
  invitedUserId,
  viewerIsAdmin,
}: {
  accessToken: string | null;
  invitedUserId: string | null;
  viewerIsAdmin: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState<NotifState>({
    improvements_email_notifications_enabled: true,
    improvements_sms_notifications_enabled: false,
    improvements_notification_email: "",
    improvements_notification_phone: "",
    accountEmail: "",
  });

  const canLoad = Boolean(accessToken && invitedUserId && viewerIsAdmin);

  const load = useCallback(async () => {
    if (!canLoad || !invitedUserId || !accessToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/accounts/${encodeURIComponent(invitedUserId)}/improvement-notifications`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const payload = (await response.json()) as NotifState & { error?: string };
      if (!response.ok) {
        setMessage({ type: "err", text: payload.error || "Chargement impossible." });
        setLoading(false);
        return;
      }
      setForm({
        improvements_email_notifications_enabled: Boolean(
          payload.improvements_email_notifications_enabled
        ),
        improvements_sms_notifications_enabled: Boolean(
          payload.improvements_sms_notifications_enabled
        ),
        improvements_notification_email: payload.improvements_notification_email ?? "",
        improvements_notification_phone: payload.improvements_notification_phone ?? "",
        accountEmail: payload.accountEmail ?? "",
      });
    } catch {
      setMessage({ type: "err", text: "Erreur reseau." });
    } finally {
      setLoading(false);
    }
  }, [accessToken, invitedUserId, canLoad]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canLoad || !invitedUserId || !accessToken) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/accounts/${encodeURIComponent(invitedUserId)}/improvement-notifications`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            improvements_email_notifications_enabled: form.improvements_email_notifications_enabled,
            improvements_sms_notifications_enabled: form.improvements_sms_notifications_enabled,
            improvements_notification_email: form.improvements_notification_email.trim() || null,
            improvements_notification_phone: form.improvements_notification_phone.trim() || null,
          }),
        }
      );
      const payload = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok) {
        setMessage({ type: "err", text: payload.error || "Enregistrement impossible." });
        setSaving(false);
        return;
      }
      setMessage({ type: "ok", text: "Preferences enregistrees." });
      await load();
    } catch {
      setMessage({ type: "err", text: "Erreur reseau." });
    } finally {
      setSaving(false);
    }
  }

  if (!viewerIsAdmin) {
    return null;
  }

  if (!invitedUserId) {
    return (
      <div className="tagora-panel-muted ui-stack-sm" style={{ padding: 16, borderRadius: 14 }}>
        <div className="tagora-label">Notifications des ameliorations</div>
        <p className="tagora-note" style={{ margin: 0 }}>
          Préférences disponibles après activation complète du compte admin.
        </p>
      </div>
    );
  }

  return (
    <div className="tagora-panel-muted ui-stack-md" style={{ padding: 16, borderRadius: 14 }}>
      <div className="ui-stack-xs">
        <div className="tagora-label">Notifications des ameliorations</div>
        <p className="tagora-note" style={{ margin: 0 }}>
          Lorsqu&apos;une suggestion est ajoutee dans le module Ameliorations, ce compte peut recevoir
          une alerte par courriel ou SMS selon les choix ci-dessous.
        </p>
      </div>

      {loading ? (
        <p className="tagora-note" style={{ margin: 0 }}>
          Chargement des preferences...
        </p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="ui-stack-md" style={{ margin: 0 }}>
          <label style={switchStyle}>
            <input
              type="checkbox"
              checked={form.improvements_email_notifications_enabled}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  improvements_email_notifications_enabled: e.target.checked,
                }))
              }
              style={{ width: 18, height: 18, accentColor: "#0f2948" }}
            />
            Recevoir les nouvelles ameliorations par courriel
          </label>

          <label className="tagora-field" style={{ margin: 0 }}>
            <span className="tagora-label">Courriel de notification</span>
            <input
              type="email"
              className="tagora-input"
              value={form.improvements_notification_email}
              onChange={(e) =>
                setForm((f) => ({ ...f, improvements_notification_email: e.target.value }))
              }
              placeholder={form.accountEmail || "adresse@exemple.com"}
              disabled={!form.improvements_email_notifications_enabled}
            />
            <span className="ui-text-muted" style={{ fontSize: 12 }}>
              Par defaut : {form.accountEmail || "courriel du compte"}
            </span>
          </label>

          <label style={switchStyle}>
            <input
              type="checkbox"
              checked={form.improvements_sms_notifications_enabled}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  improvements_sms_notifications_enabled: e.target.checked,
                }))
              }
              style={{ width: 18, height: 18, accentColor: "#0f2948" }}
            />
            Recevoir les nouvelles ameliorations par texto (SMS)
          </label>

          <label className="tagora-field" style={{ margin: 0 }}>
            <span className="tagora-label">Numero SMS</span>
            <input
              type="tel"
              className="tagora-input"
              value={form.improvements_notification_phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, improvements_notification_phone: e.target.value }))
              }
              placeholder="+1 418 555 0100"
              disabled={!form.improvements_sms_notifications_enabled}
            />
            <span className="ui-text-muted" style={{ fontSize: 12 }}>
              Utilise seulement si le texto est active.
            </span>
          </label>

          {message ? (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: message.type === "ok" ? "#15803d" : "#b91c1c",
              }}
            >
              {message.text}
            </p>
          ) : null}

          <button
            type="submit"
            className="tagora-dark-action"
            disabled={saving}
            style={{ height: 36, padding: "0 16px", borderRadius: 10, fontSize: 13 }}
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      )}
    </div>
  );
}
