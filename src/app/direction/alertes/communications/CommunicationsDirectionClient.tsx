"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import {
  COMMUNICATION_CATEGORIES,
  COMMUNICATION_TEMPLATE_VARIABLES,
  communicationImplStatusLabelFr,
} from "@/app/lib/communication-templates.shared";

type TemplateRow = {
  id: string;
  template_key: string;
  category: string;
  channel: "email" | "sms";
  audience: string;
  name: string;
  description: string | null;
  subject: string | null;
  body: string;
  active: boolean;
  implementation_status: string;
  default_subject: string | null;
  default_body: string | null;
  updated_at: string;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-CA", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function CommunicationsDirectionClient() {
  const router = useRouter();
  const { user, loading: accessLoading, role } = useCurrentAccess();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterChannel, setFilterChannel] = useState<string>("");
  const [filterAudience, setFilterAudience] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [activeOnly, setActiveOnly] = useState(false);

  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editImplStatus, setEditImplStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; textBody: string; htmlBody: string } | null>(
    null
  );
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const roleOk = role === "admin" || role === "direction";

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setTemplates([]);
        return;
      }
      const params = new URLSearchParams();
      if (filterCategory) params.set("category", filterCategory);
      if (filterChannel) params.set("channel", filterChannel);
      if (filterAudience) params.set("audience", filterAudience);
      if (filterStatus) params.set("implementation_status", filterStatus);
      if (activeOnly) params.set("active_only", "true");

      const res = await fetch(`/api/direction/alertes/communications/templates?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Erreur de chargement.");
        setTemplates([]);
        return;
      }
      const j = (await res.json()) as { templates?: TemplateRow[] };
      setTemplates(Array.isArray(j.templates) ? j.templates : []);
    } catch {
      setError("Erreur réseau.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterChannel, filterAudience, filterStatus, activeOnly]);

  useEffect(() => {
    if (accessLoading || !user || !roleOk) return;
    void loadTemplates();
  }, [accessLoading, user, roleOk, loadTemplates]);

  useEffect(() => {
    if (accessLoading || user) return;
    router.replace("/direction/login");
  }, [accessLoading, user, router]);

  useEffect(() => {
    if (accessLoading || !user || roleOk) return;
    router.replace("/direction/dashboard");
  }, [accessLoading, user, roleOk, router]);

  function openEdit(t: TemplateRow) {
    setEditing(t);
    setEditSubject(t.subject ?? "");
    setEditBody(t.body);
    setEditActive(t.active);
    setEditImplStatus(t.implementation_status);
    setPreview(null);
    setTestEmail("");
    setTestPhone("");
  }

  function openEditAndPreview(t: TemplateRow) {
    openEdit(t);
    void fetchPreviewByTemplateId(t.id);
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/direction/alertes/communications/templates/${editing.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: editing.channel === "email" ? editSubject : null,
          body: editBody,
          active: editActive,
          implementation_status: editImplStatus,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(typeof j.error === "string" ? j.error : "Enregistrement impossible.");
        return;
      }
      setToast("Modèle enregistré.");
      setEditing(null);
      await loadTemplates();
    } finally {
      setSaving(false);
    }
  }

  async function fetchPreviewByTemplateId(templateId: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(
      `/api/direction/alertes/communications/templates/${templateId}/preview`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast(typeof j.error === "string" ? j.error : "Prévisualisation impossible.");
      return;
    }
    setPreview({
      subject: j.subject ?? "",
      textBody: j.textBody ?? "",
      htmlBody: j.htmlBody ?? "",
    });
  }

  async function runPreview() {
    if (!editing) return;
    await fetchPreviewByTemplateId(editing.id);
  }

  async function runSendTest() {
    if (!editing) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/direction/alertes/communications/templates/${editing.id}/send-test`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: testEmail.trim() || undefined,
            phone: testPhone.trim() || undefined,
          }),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(typeof j.error === "string" ? j.error : "Envoi de test impossible.");
        return;
      }
      setToast(
        editing.channel === "email"
          ? `Courriel de test envoyé à ${j.recipient ?? ""}.`
          : `SMS de test envoyé à ${j.recipient ?? ""}.`
      );
    } finally {
      setSaving(false);
    }
  }

  async function runReset() {
    if (!editing) return;
    if (!window.confirm("Réinitialiser ce modèle au texte par défaut enregistré ?")) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/direction/alertes/communications/templates/${editing.id}/reset-default`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(typeof j.error === "string" ? j.error : "Réinitialisation impossible.");
        return;
      }
      const t = j.template as TemplateRow | undefined;
      if (t) {
        setEditing(t);
        setEditSubject(t.subject ?? "");
        setEditBody(t.body);
      }
      setToast("Modèle réinitialisé.");
      await loadTemplates();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: TemplateRow, next: boolean) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/direction/alertes/communications/templates/${t.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ active: next }),
    });
    if (res.ok) {
      setToast(next ? "Modèle activé." : "Modèle désactivé.");
      await loadTemplates();
    }
  }

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const smsLength = editing?.channel === "sms" ? [...editBody].length : 0;
  const smsWarn = editing?.channel === "sms" && smsLength > 320;

  const filteredCount = templates.length;

  const audienceLabel = useMemo(
    () =>
      ({
        employee: "Employé",
        direction_admin: "Direction / admin",
        direction: "Direction",
        admin: "Admin",
      }) as Record<string, string>,
    []
  );

  if (accessLoading || (Boolean(user) && roleOk && loading)) {
    return <TagoraLoadingScreen isLoading message="Chargement des communications…" fullScreen />;
  }

  if (!user || !roleOk) {
    return null;
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Communications"
          subtitle="Modèles de courriel et SMS — textes éditables, prévisualisation et tests."
          showNavigation={false}
          actions={
            <div style={{ display: "flex", gap: "var(--ui-space-3)", flexWrap: "wrap" }}>
              <Link className="ui-button ui-button-secondary" href="/direction/alertes">
                Centre d&apos;alertes
              </Link>
              <Link className="ui-button ui-button-secondary" href="/direction/dashboard">
                Tableau de bord
              </Link>
            </div>
          }
        />

        {toast ? (
          <div
            className="ui-card"
            style={{
              padding: "var(--ui-space-3)",
              background: "var(--ui-color-surface-elevated)",
              border: "1px solid var(--ui-color-border)",
            }}
            role="status"
          >
            {toast}
          </div>
        ) : null}

        <AppCard className="ui-stack-sm" style={{ padding: "var(--ui-space-4)" }}>
          <h2 className="ui-heading-3" style={{ margin: 0 }}>
            Filtres
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "var(--ui-space-3)",
              alignItems: "end",
            }}
          >
            <label className="ui-stack-xs">
              <span className="ui-label">Catégorie</span>
              <select
                className="ui-input"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">Toutes</option>
                {COMMUNICATION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-stack-xs">
              <span className="ui-label">Canal</span>
              <select
                className="ui-input"
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
              >
                <option value="">Tous</option>
                <option value="email">Courriel</option>
                <option value="sms">SMS</option>
              </select>
            </label>
            <label className="ui-stack-xs">
              <span className="ui-label">Audience</span>
              <select
                className="ui-input"
                value={filterAudience}
                onChange={(e) => setFilterAudience(e.target.value)}
              >
                <option value="">Toutes</option>
                <option value="employee">Employé</option>
                <option value="direction_admin">Direction / admin</option>
                <option value="direction">Direction</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="ui-stack-xs">
              <span className="ui-label">Statut</span>
              <select
                className="ui-input"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Tous</option>
                <option value="connected">Branché</option>
                <option value="planned">Prévu phase 2</option>
                <option value="inactive">Inactif</option>
                <option value="to_configure">À configurer</option>
              </select>
            </label>
            <label className="ui-stack-xs" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              <span className="ui-label" style={{ margin: 0 }}>
                Actifs seulement
              </span>
            </label>
          </div>
          <p style={{ margin: 0, color: "var(--ui-color-muted)" }}>
            {filteredCount} modèle{filteredCount !== 1 ? "s" : ""}
          </p>
        </AppCard>

        {error ? (
          <AppCard style={{ padding: "var(--ui-space-4)", borderColor: "var(--ui-color-danger)" }}>
            {error}
          </AppCard>
        ) : null}

        <div className="ui-stack-md">
          {templates.map((t) => (
            <AppCard
              key={t.id}
              style={{
                padding: "var(--ui-space-4)",
                display: "grid",
                gap: "var(--ui-space-2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: "var(--ui-space-3)",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{t.name}</div>
                  <div style={{ color: "var(--ui-color-muted)", fontSize: "0.9rem" }}>
                    {t.category} · {t.channel === "email" ? "Courriel" : "SMS"} ·{" "}
                    {audienceLabel[t.audience] ?? t.audience}
                  </div>
                  {t.description ? (
                    <p style={{ margin: "var(--ui-space-2) 0 0", maxWidth: 720 }}>{t.description}</p>
                  ) : null}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.85rem", color: "var(--ui-color-muted)" }}>
                    {communicationImplStatusLabelFr(t.implementation_status)}
                  </div>
                  <div style={{ fontSize: "0.85rem" }}>
                    {t.active ? (
                      <span style={{ color: "var(--ui-color-success)" }}>Actif</span>
                    ) : (
                      <span style={{ color: "var(--ui-color-muted)" }}>Inactif</span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ui-color-muted)" }}>
                    Modifié : {formatDate(t.updated_at)}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ui-space-2)" }}>
                <button type="button" className="ui-button ui-button-primary" onClick={() => openEdit(t)}>
                  Modifier
                </button>
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => openEditAndPreview(t)}
                >
                  Prévisualiser
                </button>
                <button type="button" className="ui-button ui-button-secondary" onClick={() => openEdit(t)}>
                  Envoyer un test
                </button>
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => void toggleActive(t, !t.active)}
                >
                  {t.active ? "Désactiver" : "Activer"}
                </button>
              </div>
            </AppCard>
          ))}
        </div>

        {editing ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
              zIndex: 50,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "var(--ui-space-6)",
              overflow: "auto",
            }}
            role="dialog"
            aria-modal
            aria-labelledby="comm-edit-title"
          >
            <AppCard
              style={{
                maxWidth: 960,
                width: "100%",
                padding: "var(--ui-space-5)",
                marginTop: "var(--ui-space-4)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <h2 id="comm-edit-title" className="ui-heading-3" style={{ margin: 0 }}>
                  {editing.name}
                </h2>
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => setEditing(null)}
                >
                  Fermer
                </button>
              </div>
              <p style={{ color: "var(--ui-color-muted)", marginTop: 8 }}>
                {editing.category} · {editing.channel === "email" ? "Courriel" : "SMS"} ·{" "}
                {audienceLabel[editing.audience] ?? editing.audience} ·{" "}
                {communicationImplStatusLabelFr(editImplStatus)}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(200px, 240px)",
                  gap: "var(--ui-space-4)",
                  marginTop: "var(--ui-space-4)",
                }}
              >
                <div className="ui-stack-md">
                  <label className="ui-stack-xs">
                    <span className="ui-label">Statut d&apos;implémentation</span>
                    <select
                      className="ui-input"
                      value={editImplStatus}
                      onChange={(e) => setEditImplStatus(e.target.value)}
                    >
                      <option value="connected">Branché</option>
                      <option value="planned">Prévu phase 2</option>
                      <option value="inactive">Inactif</option>
                      <option value="to_configure">À configurer</option>
                    </select>
                  </label>
                  {editing.channel === "email" ? (
                    <label className="ui-stack-xs">
                      <span className="ui-label">Sujet</span>
                      <input
                        className="ui-input"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <label className="ui-stack-xs">
                    <span className="ui-label">Corps</span>
                    <textarea
                      className="ui-input"
                      rows={12}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      style={{ fontFamily: "monospace", fontSize: "0.9rem" }}
                    />
                  </label>
                  {editing.channel === "sms" ? (
                    <p style={{ margin: 0, fontSize: "0.9rem", color: smsWarn ? "#b45309" : undefined }}>
                      Environ {smsLength} caractères
                      {smsWarn ? " — message long pour un SMS segmenté." : ""}
                    </p>
                  ) : null}
                  <label className="ui-stack-xs" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    <span>Modèle actif</span>
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      className="ui-button ui-button-primary"
                      disabled={saving}
                      onClick={() => void saveEdit()}
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-secondary"
                      disabled={saving}
                      onClick={() => void runPreview()}
                    >
                      Prévisualiser
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-secondary"
                      disabled={saving}
                      onClick={() => void runReset()}
                    >
                      Réinitialiser au défaut
                    </button>
                  </div>
                  <hr style={{ border: 0, borderTop: "1px solid var(--ui-color-border)" }} />
                  <p className="ui-label">Envoi de test (ne crée aucune donnée métier)</p>
                  {editing.channel === "email" ? (
                    <label className="ui-stack-xs">
                      <span className="ui-label">Courriel (vide = le vôtre)</span>
                      <input
                        className="ui-input"
                        type="email"
                        placeholder="vous@exemple.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                      />
                    </label>
                  ) : (
                    <label className="ui-stack-xs">
                      <span className="ui-label">Téléphone (E.164 recommandé)</span>
                      <input
                        className="ui-input"
                        type="tel"
                        placeholder="+15145550100"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="ui-button ui-button-secondary"
                    disabled={saving}
                    onClick={() => void runSendTest()}
                  >
                    Envoyer un test
                  </button>
                </div>
                <div className="ui-stack-sm" style={{ position: "sticky", top: 0 }}>
                  <div className="ui-label">Variables</div>
                  <div
                    style={{
                      maxHeight: 360,
                      overflow: "auto",
                      border: "1px solid var(--ui-color-border)",
                      borderRadius: 8,
                      padding: 8,
                      fontSize: "0.85rem",
                    }}
                  >
                    {COMMUNICATION_TEMPLATE_VARIABLES.map((v) => (
                      <div key={v} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                        <code style={{ flex: 1, wordBreak: "break-all" }}>{`{{${v}}}`}</code>
                        <button
                          type="button"
                          className="ui-button ui-button-secondary"
                          style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                          onClick={() => {
                            void navigator.clipboard.writeText(`{{${v}}}`);
                            setToast(`Copié : {{${v}}}`);
                          }}
                        >
                          Copier
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {preview ? (
                <div style={{ marginTop: "var(--ui-space-4)" }} className="ui-stack-sm">
                  <div className="ui-label">Prévisualisation</div>
                  {editing.channel === "email" ? (
                    <div>
                      <strong>Sujet :</strong> {preview.subject}
                    </div>
                  ) : null}
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      padding: 12,
                      background: "var(--ui-color-surface-muted)",
                      borderRadius: 8,
                      fontSize: "0.9rem",
                    }}
                  >
                    {preview.textBody}
                  </pre>
                </div>
              ) : null}
            </AppCard>
          </div>
        ) : null}
      </div>
    </main>
  );
}
