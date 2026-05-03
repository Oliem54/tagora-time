"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
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

type ModalMode = "edit" | "preview" | "test" | null;

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

/** Repère les jetons `{{...}}` encore présents dans le rendu (aperçu). */
function extractUnreplacedMustacheTokens(text: string): string[] {
  const matches = text.matchAll(/\{\{[^}]+\}\}/g);
  return [...new Set([...matches].map((x) => x[0]))];
}

const COMM_SCOPED_CSS = `
  .comm-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    z-index: 50;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }
  .comm-modal-panel {
    max-width: 1040px;
    width: 100%;
    margin-top: 16px;
    margin-bottom: 24px;
    border-radius: 16px;
    padding: 24px 28px;
    background: var(--ui-color-surface-elevated, #fff);
    border: 1px solid var(--ui-color-border, #e2e8f0);
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
  }
  @media (max-width: 720px) {
    .comm-modal-overlay {
      padding: 0;
      align-items: stretch;
    }
    .comm-modal-panel {
      margin: 0;
      min-height: 100dvh;
      max-width: none;
      border-radius: 0;
      padding: 16px;
    }
  }
  .comm-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .comm-pill {
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #475569;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 14px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
  }
  .comm-pill:hover {
    border-color: #cbd5e1;
    background: #f8fafc;
  }
  .comm-pill-active {
    border-color: #14b8a6;
    background: #ccfbf1;
    color: #0f766e;
    font-weight: 700;
  }
  .comm-stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }
  .comm-stat-card {
    border-radius: 14px;
    border: 1px solid #e2e8f0;
    background: #fff;
    padding: 14px 16px;
    box-shadow: 0 1px 8px rgba(15, 23, 42, 0.04);
  }
  .comm-template-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 720px) {
    .comm-template-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 1100px) {
    .comm-template-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .comm-modal-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 18px;
    padding: 6px;
    background: #e2e8f0;
    border-radius: 14px;
  }
  .comm-modal-tab {
    flex: 1 1 120px;
    padding: 10px 14px;
    border: none;
    border-radius: 10px;
    background: transparent;
    font-size: 14px;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
  }
  .comm-modal-tab:hover {
    color: #334155;
  }
  .comm-modal-tab-active {
    background: #fff;
    color: #0f766e;
    box-shadow: 0 1px 6px rgba(15, 23, 42, 0.1);
  }
  .comm-section {
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 20px 22px;
    background: #fafbfc;
    margin-bottom: 18px;
  }
  .comm-section-title {
    margin: 0 0 14px;
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .comm-info-row {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 8px 16px;
    font-size: 14px;
    align-items: baseline;
  }
  @media (max-width: 520px) {
    .comm-info-row {
      grid-template-columns: 1fr;
    }
  }
`;

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

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editImplStatus, setEditImplStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
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

  function closeModal() {
    setSelectedTemplate(null);
    setModalMode(null);
    setPreview(null);
    setPreviewLoading(false);
    setTestEmail("");
    setTestPhone("");
  }

  function openModal(t: TemplateRow, mode: Exclude<ModalMode, null>) {
    setSelectedTemplate(t);
    setModalMode(mode);
    setPreview(null);
    setPreviewLoading(false);
    setTestEmail("");
    setTestPhone("");
    if (mode === "edit") {
      setEditSubject(t.subject ?? "");
      setEditBody(t.body);
      setEditActive(t.active);
      setEditImplStatus(t.implementation_status);
    }
    if (mode === "preview") {
      void fetchPreviewByTemplateId(t.id);
    }
  }

  async function saveEdit() {
    if (!selectedTemplate || modalMode !== "edit") return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/direction/alertes/communications/templates/${selectedTemplate.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: selectedTemplate.channel === "email" ? editSubject : null,
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
      closeModal();
      await loadTemplates();
    } finally {
      setSaving(false);
    }
  }

  async function fetchPreviewByTemplateId(templateId: string) {
    setPreviewLoading(true);
    setPreview(null);
    try {
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
    } finally {
      setPreviewLoading(false);
    }
  }

  function switchModalMode(next: Exclude<ModalMode, null>) {
    if (!selectedTemplate) return;
    setModalMode(next);
    if (next === "preview") {
      void fetchPreviewByTemplateId(selectedTemplate.id);
    }
  }

  async function runSendTest() {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/direction/alertes/communications/templates/${selectedTemplate.id}/send-test`,
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
        selectedTemplate.channel === "email"
          ? `Courriel de test envoyé à ${j.recipient ?? ""}.`
          : `SMS de test envoyé à ${j.recipient ?? ""}.`
      );
    } finally {
      setSaving(false);
    }
  }

  async function runReset() {
    if (!selectedTemplate || modalMode !== "edit") return;
    if (!window.confirm("Réinitialiser ce modèle au texte par défaut enregistré ?")) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/direction/alertes/communications/templates/${selectedTemplate.id}/reset-default`,
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
        setSelectedTemplate(t);
        setEditSubject(t.subject ?? "");
        setEditBody(t.body);
        setEditImplStatus(t.implementation_status);
        setEditActive(t.active);
      }
      setToast("Modèle réinitialisé.");
      await loadTemplates();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: TemplateRow, next: boolean, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
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

  const smsLength = selectedTemplate?.channel === "sms" && modalMode === "edit" ? [...editBody].length : 0;
  const smsWarn = selectedTemplate?.channel === "sms" && modalMode === "edit" && smsLength > 320;

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

  const stats = useMemo(() => {
    const total = templates.length;
    const activeN = templates.filter((t) => t.active).length;
    const emails = templates.filter((t) => t.channel === "email").length;
    const smsN = templates.filter((t) => t.channel === "sms").length;
    return { total, activeN, emails, smsN };
  }, [templates]);

  const implStatuses = [
    { value: "", label: "Tous" },
    { value: "connected", label: "Branché" },
    { value: "planned", label: "Prévu phase 2" },
    { value: "inactive", label: "Inactif" },
    { value: "to_configure", label: "À configurer" },
  ] as const;

  const audiences = [
    { value: "", label: "Toutes" },
    { value: "employee", label: "Employé" },
    { value: "direction_admin", label: "Direction / admin" },
    { value: "direction", label: "Direction" },
    { value: "admin", label: "Admin" },
  ] as const;

  if (accessLoading || (Boolean(user) && roleOk && loading)) {
    return <TagoraLoadingScreen isLoading message="Chargement des communications…" fullScreen />;
  }

  if (!user || !roleOk) {
    return null;
  }

  const modalOpen = Boolean(selectedTemplate && modalMode);

  return (
    <main className="tagora-app-shell">
      <style dangerouslySetInnerHTML={{ __html: COMM_SCOPED_CSS }} />
      <div className="tagora-app-content ui-stack-lg" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <AuthenticatedPageHeader
          title="Communications"
          subtitle="Gestion des modèles de courriel et SMS, prévisualisation et tests."
          showNavigation={false}
          actions={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
              padding: "12px 16px",
              background: "var(--ui-color-surface-elevated)",
              border: "1px solid var(--ui-color-border)",
              borderRadius: 12,
            }}
            role="status"
          >
            {toast}
          </div>
        ) : null}

        <section className="comm-stat-grid" aria-label="Résumé des modèles">
          <div className="comm-stat-card">
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Total modèles</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{stats.total}</div>
          </div>
          <div className="comm-stat-card">
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Modèles actifs</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#047857" }}>{stats.activeN}</div>
          </div>
          <div className="comm-stat-card">
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Courriels</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#1d4ed8" }}>{stats.emails}</div>
          </div>
          <div className="comm-stat-card">
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>SMS</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#7c3aed" }}>{stats.smsN}</div>
          </div>
        </section>

        <AppCard style={{ padding: "18px 20px", borderRadius: 14 }}>
          <h2 className="ui-heading-3" style={{ margin: "0 0 14px" }}>
            Filtres
          </h2>
          <div className="ui-stack-md">
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
                Catégorie
              </div>
              <div className="comm-pill-row">
                <button
                  type="button"
                  className={`comm-pill ${filterCategory === "" ? "comm-pill-active" : ""}`}
                  onClick={() => setFilterCategory("")}
                >
                  Toutes
                </button>
                {COMMUNICATION_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`comm-pill ${filterCategory === c ? "comm-pill-active" : ""}`}
                    onClick={() => setFilterCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Canal</div>
              <div className="comm-pill-row">
                {[
                  { value: "", label: "Tous" },
                  { value: "email", label: "Courriel" },
                  { value: "sms", label: "SMS" },
                ].map((o) => (
                  <button
                    key={o.value || "all"}
                    type="button"
                    className={`comm-pill ${filterChannel === o.value ? "comm-pill-active" : ""}`}
                    onClick={() => setFilterChannel(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
                Audience
              </div>
              <div className="comm-pill-row">
                {audiences.map((o) => (
                  <button
                    key={o.value || "all"}
                    type="button"
                    className={`comm-pill ${filterAudience === o.value ? "comm-pill-active" : ""}`}
                    onClick={() => setFilterAudience(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
                Statut d&apos;implémentation
              </div>
              <div className="comm-pill-row">
                {implStatuses.map((o) => (
                  <button
                    key={o.value || "all"}
                    type="button"
                    className={`comm-pill ${filterStatus === o.value ? "comm-pill-active" : ""}`}
                    onClick={() => setFilterStatus(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
                Affichage
              </div>
              <div className="comm-pill-row">
                <button
                  type="button"
                  className={`comm-pill ${!activeOnly ? "comm-pill-active" : ""}`}
                  onClick={() => setActiveOnly(false)}
                >
                  Tous les modèles
                </button>
                <button
                  type="button"
                  className={`comm-pill ${activeOnly ? "comm-pill-active" : ""}`}
                  onClick={() => setActiveOnly(true)}
                >
                  Actifs seulement
                </button>
              </div>
            </div>
          </div>
          <p style={{ margin: "14px 0 0", color: "#64748b", fontSize: 14 }}>
            {filteredCount} modèle{filteredCount !== 1 ? "s" : ""} (filtre actuel)
          </p>
        </AppCard>

        {error ? (
          <AppCard style={{ padding: "var(--ui-space-4)", borderColor: "var(--ui-color-danger)" }}>
            {error}
          </AppCard>
        ) : null}

        <div className="comm-template-grid">
          {templates.map((t) => (
            <AppCard
              key={t.id}
              style={{
                padding: "16px 18px",
                borderRadius: 14,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 10px rgba(15,23,42,0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>{t.name}</div>
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                    {t.category} · {t.channel === "email" ? "Courriel" : "SMS"}
                  </div>
                  <div style={{ color: "#475569", fontSize: 13, marginTop: 2 }}>
                    {audienceLabel[t.audience] ?? t.audience}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: t.active ? "#ecfdf5" : "#f1f5f9",
                      color: t.active ? "#047857" : "#64748b",
                      border: `1px solid ${t.active ? "#a7f3d0" : "#e2e8f0"}`,
                    }}
                  >
                    {t.active ? "Actif" : "Inactif"}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {communicationImplStatusLabelFr(t.implementation_status)}
              </div>
              {t.description ? (
                <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.45 }}>{t.description}</p>
              ) : null}
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Modifié : {formatDate(t.updated_at)}</div>
              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 10,
                  borderTop: "1px solid #f1f5f9",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="ui-button ui-button-primary"
                  style={{ fontSize: 13, padding: "8px 12px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openModal(t, "edit");
                  }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  style={{ fontSize: 13, padding: "8px 12px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openModal(t, "preview");
                  }}
                >
                  Prévisualiser
                </button>
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  style={{ fontSize: 13, padding: "8px 12px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openModal(t, "test");
                  }}
                >
                  Envoyer un test
                </button>
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  style={{ fontSize: 13, padding: "8px 12px" }}
                  onClick={(e) => void toggleActive(t, !t.active, e)}
                >
                  {t.active ? "Désactiver" : "Activer"}
                </button>
              </div>
            </AppCard>
          ))}
        </div>

        {modalOpen && selectedTemplate && modalMode ? (
          <div
            className="comm-modal-overlay"
            role="dialog"
            aria-modal
            aria-labelledby="comm-modal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <AppCard
              className="comm-modal-panel"
              onClick={(e) => e.stopPropagation()}
              style={{ display: "flex", flexDirection: "column", gap: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
                    Modèle
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "1.15rem", color: "#0f172a", marginTop: 4 }}>
                    {selectedTemplate.name}
                  </div>
                </div>
                <button type="button" className="ui-button ui-button-secondary" onClick={closeModal}>
                  Fermer
                </button>
              </div>

              <div className="comm-modal-tabs" role="tablist" aria-label="Mode du modèle">
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalMode === "edit"}
                  className={`comm-modal-tab ${modalMode === "edit" ? "comm-modal-tab-active" : ""}`}
                  onClick={() => switchModalMode("edit")}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalMode === "preview"}
                  className={`comm-modal-tab ${modalMode === "preview" ? "comm-modal-tab-active" : ""}`}
                  onClick={() => switchModalMode("preview")}
                >
                  Prévisualiser
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalMode === "test"}
                  className={`comm-modal-tab ${modalMode === "test" ? "comm-modal-tab-active" : ""}`}
                  onClick={() => switchModalMode("test")}
                >
                  Envoyer un test
                </button>
              </div>

              <h2 id="comm-modal-title" className="ui-heading-3" style={{ margin: "20px 0 0" }}>
                {modalMode === "edit" && "Modifier le modèle"}
                {modalMode === "preview" && "Prévisualisation"}
                {modalMode === "test" && "Envoyer un test"}
              </h2>
              <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 15, lineHeight: 1.5, maxWidth: 720 }}>
                {modalMode === "edit" &&
                  "Modifiez le sujet, le message et l’état du modèle. Utilisez les onglets pour prévisualiser ou envoyer un test sans quitter cette fenêtre."}
                {modalMode === "preview" &&
                  "Voici le rendu du modèle avec les variables disponibles. Les jetons non remplacés restent visibles tels quels."}
                {modalMode === "test" &&
                  "Envoyez ce modèle à une adresse courriel ou à un numéro de téléphone pour valider le rendu. Aucune donnée métier n’est créée."}
              </p>

              {modalMode === "preview" ? (
                <div style={{ marginTop: 20 }} className="ui-stack-md">
                  {previewLoading ? (
                    <p style={{ color: "#64748b" }}>Chargement de l&apos;aperçu…</p>
                  ) : preview ? (
                    <>
                      {selectedTemplate.channel === "email" ? (
                        <section className="comm-section" style={{ background: "#fff" }}>
                          <h3 className="comm-section-title">Sujet rendu</h3>
                          <div
                            style={{
                              padding: 14,
                              background: "#f8fafc",
                              borderRadius: 10,
                              border: "1px solid #e2e8f0",
                              fontSize: 16,
                              fontWeight: 600,
                              color: "#0f172a",
                            }}
                          >
                            {preview.subject || "—"}
                          </div>
                        </section>
                      ) : null}
                      <section className="comm-section" style={{ background: "#fff" }}>
                        <h3 className="comm-section-title">Corps rendu</h3>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            margin: 0,
                            padding: 16,
                            background: "#f8fafc",
                            borderRadius: 10,
                            border: "1px solid #e2e8f0",
                            fontSize: 15,
                            lineHeight: 1.55,
                            maxHeight: "min(52vh, 480px)",
                            overflow: "auto",
                            fontFamily: "system-ui, sans-serif",
                          }}
                        >
                          {preview.textBody}
                        </pre>
                      </section>
                      {(() => {
                        const tokens = extractUnreplacedMustacheTokens(
                          `${preview.subject}\n${preview.textBody}`
                        );
                        if (tokens.length === 0) return null;
                        return (
                          <section className="comm-section" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
                            <h3 className="comm-section-title">Variables non remplacées</h3>
                            <p style={{ margin: "0 0 10px", fontSize: 14, color: "#92400e" }}>
                              Ces jetons sont encore présents dans le rendu :
                            </p>
                            <ul style={{ margin: 0, paddingLeft: 20, color: "#78350f", fontSize: 14 }}>
                              {tokens.map((tok) => (
                                <li key={tok}>
                                  <code>{tok}</code>
                                </li>
                              ))}
                            </ul>
                          </section>
                        );
                      })()}
                    </>
                  ) : (
                    <p style={{ color: "#64748b" }}>Aucun aperçu disponible.</p>
                  )}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      marginTop: 8,
                      paddingTop: 16,
                      borderTop: "1px solid #e2e8f0",
                    }}
                  >
                    <button type="button" className="ui-button ui-button-secondary" onClick={closeModal}>
                      Fermer
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-secondary"
                      onClick={() => switchModalMode("test")}
                    >
                      Envoyer un test
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-primary"
                      onClick={() => switchModalMode("edit")}
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              ) : null}

              {modalMode === "test" ? (
                <div style={{ marginTop: 20 }} className="ui-stack-md">
                  <section className="comm-section" style={{ background: "#fff" }}>
                    <h3 className="comm-section-title">Résumé</h3>
                    <div className="comm-info-row">
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Nom</span>
                      <span>{selectedTemplate.name}</span>
                    </div>
                    <div className="comm-info-row" style={{ marginTop: 10 }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Canal</span>
                      <span>{selectedTemplate.channel === "email" ? "Courriel" : "SMS"}</span>
                    </div>
                    <div className="comm-info-row" style={{ marginTop: 10 }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Audience</span>
                      <span>{audienceLabel[selectedTemplate.audience] ?? selectedTemplate.audience}</span>
                    </div>
                    {selectedTemplate.channel === "email" ? (
                      <div className="comm-info-row" style={{ marginTop: 10 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Sujet (modèle)</span>
                        <span style={{ wordBreak: "break-word" }}>{selectedTemplate.subject ?? "—"}</span>
                      </div>
                    ) : null}
                  </section>
                  {selectedTemplate.channel === "email" ? (
                    <label className="ui-stack-xs">
                      <span className="ui-label">Adresse courriel de test</span>
                      <input
                        className="ui-input"
                        type="email"
                        placeholder="vous@example.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        style={{ fontSize: 16, padding: "12px 14px" }}
                      />
                    </label>
                  ) : (
                    <label className="ui-stack-xs">
                      <span className="ui-label">Numéro de téléphone de test</span>
                      <input
                        className="ui-input"
                        type="tel"
                        placeholder="+14185551234"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        style={{ fontSize: 16, padding: "12px 14px" }}
                      />
                    </label>
                  )}
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                    Courriel vide = envoi vers votre adresse de session, selon la configuration du serveur.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      marginTop: 8,
                      paddingTop: 16,
                      borderTop: "1px solid #e2e8f0",
                    }}
                  >
                    <button
                      type="button"
                      className="ui-button ui-button-primary"
                      disabled={saving}
                      onClick={() => void runSendTest()}
                    >
                      Envoyer le test
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-secondary"
                      onClick={() => switchModalMode("preview")}
                    >
                      Prévisualiser
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-secondary"
                      onClick={() => switchModalMode("edit")}
                    >
                      Modifier
                    </button>
                    <button type="button" className="ui-button ui-button-secondary" onClick={closeModal}>
                      Fermer
                    </button>
                  </div>
                </div>
              ) : null}

              {modalMode === "edit" ? (
                <div style={{ marginTop: 20 }}>
                  <section className="comm-section">
                    <h3 className="comm-section-title">Informations du modèle</h3>
                    <div className="comm-info-row">
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Nom</span>
                      <span>{selectedTemplate.name}</span>
                    </div>
                    <div className="comm-info-row" style={{ marginTop: 10 }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Catégorie</span>
                      <span>{selectedTemplate.category}</span>
                    </div>
                    <div className="comm-info-row" style={{ marginTop: 10 }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Canal</span>
                      <span>{selectedTemplate.channel === "email" ? "Courriel" : "SMS"}</span>
                    </div>
                    <div className="comm-info-row" style={{ marginTop: 10 }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Audience</span>
                      <span>{audienceLabel[selectedTemplate.audience] ?? selectedTemplate.audience}</span>
                    </div>
                    <div style={{ marginTop: 18 }}>
                      <label className="ui-stack-xs">
                        <span className="ui-label">Statut d&apos;implémentation</span>
                        <select
                          className="ui-input"
                          value={editImplStatus}
                          onChange={(e) => setEditImplStatus(e.target.value)}
                          style={{ fontSize: 15, padding: "10px 12px" }}
                        >
                          <option value="connected">Branché</option>
                          <option value="planned">Prévu phase 2</option>
                          <option value="inactive">Inactif</option>
                          <option value="to_configure">À configurer</option>
                        </select>
                      </label>
                      <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
                        <strong>Prévu phase 2</strong> = modèle préparé, mais pas encore branché automatiquement.{" "}
                        <strong>Branché</strong> = modèle utilisé par l&apos;application.
                      </p>
                    </div>
                    <label
                      className="ui-stack-xs"
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 }}
                    >
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                      />
                      <span className="ui-label" style={{ margin: 0, fontSize: 15 }}>
                        Modèle actif
                      </span>
                    </label>
                  </section>

                  <section className="comm-section">
                    <h3 className="comm-section-title">Contenu du message</h3>
                    {selectedTemplate.channel === "email" ? (
                      <label className="ui-stack-xs">
                        <span className="ui-label">Sujet</span>
                        <input
                          className="ui-input"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          style={{ fontSize: 16, padding: "12px 14px" }}
                        />
                      </label>
                    ) : (
                      <p style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b" }}>
                        Le canal SMS n&apos;utilise pas de ligne « sujet » distincte.
                      </p>
                    )}
                    <label className="ui-stack-xs" style={{ marginTop: selectedTemplate.channel === "email" ? 14 : 0 }}>
                      <span className="ui-label">Corps du message</span>
                      <textarea
                        className="ui-input"
                        rows={18}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        style={{
                          fontFamily: "ui-sans-serif, system-ui, sans-serif",
                          fontSize: 16,
                          lineHeight: 1.55,
                          minHeight: 280,
                          padding: "14px 16px",
                          resize: "vertical",
                        }}
                      />
                    </label>
                    {selectedTemplate.channel === "sms" ? (
                      <p style={{ margin: "10px 0 0", fontSize: 14, color: smsWarn ? "#b45309" : "#64748b" }}>
                        Environ {smsLength} caractères
                        {smsWarn ? " — message long pour un SMS segmenté." : ""}
                      </p>
                    ) : null}
                  </section>

                  <section className="comm-section">
                    <h3 className="comm-section-title">Variables disponibles</h3>
                    <p style={{ margin: "0 0 16px", fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
                      Cliquez sur <strong>Copier</strong>, puis collez la variable dans le sujet ou le message.
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                      }}
                    >
                      {COMMUNICATION_TEMPLATE_VARIABLES.map((v) => (
                        <div
                          key={v}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px 14px",
                            background: "#fff",
                            border: "1px solid #e2e8f0",
                            borderRadius: 10,
                          }}
                        >
                          <code style={{ fontSize: 14, wordBreak: "break-all", color: "#0f172a" }}>{`{{${v}}}`}</code>
                          <button
                            type="button"
                            className="ui-button ui-button-secondary"
                            style={{ padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
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
                  </section>

                  <section
                    className="comm-section"
                    style={{ background: "#fff", borderStyle: "solid", marginBottom: 0 }}
                  >
                    <h3 className="comm-section-title">Actions</h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
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
                        onClick={() => switchModalMode("preview")}
                      >
                        Prévisualiser
                      </button>
                      <button
                        type="button"
                        className="ui-button ui-button-secondary"
                        disabled={saving}
                        onClick={() => switchModalMode("test")}
                      >
                        Envoyer un test
                      </button>
                      <button
                        type="button"
                        className="ui-button ui-button-secondary"
                        disabled={saving}
                        onClick={() => void runReset()}
                      >
                        Réinitialiser au défaut
                      </button>
                      <button type="button" className="ui-button ui-button-secondary" onClick={closeModal}>
                        Fermer
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}
            </AppCard>
          </div>
        ) : null}
      </div>
    </main>
  );
}
