"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Inbox,
  ListFilter,
  Mail,
  RefreshCw,
  Search,
} from "lucide-react";
import AccessNotice from "@/app/components/AccessNotice";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import HeaderTagora from "@/app/components/HeaderTagora";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  IMPROVEMENT_MODULE_OPTIONS,
  IMPROVEMENT_PRIORITY_OPTIONS,
  IMPROVEMENT_STATUS_OPTIONS,
  ImprovementModule,
  ImprovementPriority,
  ImprovementStatus,
} from "@/app/lib/improvements";
import { getHomePathForRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";

/**
 * Résout le JWT pour les appels /api (Bearer + cookie tagora en secours côté navigateur).
 * Enchaîne getSession → getUser (hydratation) → getSession → refreshSession si besoin.
 */
async function resolveAccessTokenForApi(): Promise<string | null> {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    return session.access_token;
  }
  await supabase.auth.getUser();
  ({
    data: { session },
  } = await supabase.auth.getSession());
  if (session?.access_token) {
    return session.access_token;
  }
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    return null;
  }
  return refreshed.session?.access_token ?? null;
}

/**
 * fetch vers les routes /api/ameliorations* avec auth explicite + cookies de session.
 */
async function ameliorationsApiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await resolveAccessTokenForApi();
  if (!token) {
    throw new Error("Session invalide. Reconnectez-vous.");
  }
  const h = new Headers(init.headers);
  h.set("Authorization", `Bearer ${token}`);
  return fetch(input, {
    ...init,
    headers: h,
    credentials: "include",
  });
}

type VisibilityScope = "actives" | "archive" | "tous";

type ImprovementItem = {
  id: number;
  created_at: string;
  module: string;
  priority: string;
  status: ImprovementStatus;
  title: string;
  description: string;
  created_by_email: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

function normalizeKey(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const STATUS_BADGE_FALLBACK = {
  label: "Statut",
  bg: "rgba(148, 163, 184, 0.15)",
  color: "#475569",
  border: "rgba(148, 163, 184, 0.35)",
};

function statusToBadge(
  status: string
): { label: string; bg: string; color: string; border: string } {
  const map: Record<ImprovementStatus, { label: string; bg: string; color: string; border: string }> = {
    en_attente: {
      label: "En attente",
      bg: "rgba(234, 179, 8, 0.12)",
      color: "#a16207",
      border: "rgba(234, 179, 8, 0.35)",
    },
    en_traitement: {
      label: "En cours",
      bg: "rgba(59, 130, 246, 0.12)",
      color: "#1d4ed8",
      border: "rgba(59, 130, 246, 0.3)",
    },
    traitee: {
      label: "Terminée",
      bg: "rgba(34, 197, 94, 0.12)",
      color: "#15803d",
      border: "rgba(34, 197, 94, 0.3)",
    },
    supprimee: {
      label: "Refusé",
      bg: "rgba(248, 113, 113, 0.1)",
      color: "#b91c1c",
      border: "rgba(248, 113, 113, 0.35)",
    },
  };
  if (Object.prototype.hasOwnProperty.call(map, status)) {
    return map[status as ImprovementStatus];
  }
  return { ...STATUS_BADGE_FALLBACK, label: String(status) };
}

function priorityToVisual(priority: string): {
  label: string;
  dot: string;
  border: string;
} {
  const n = normalizeKey(priority);
  if (n.includes("critique")) {
    return {
      label: "Critique",
      dot: "#b91c1c",
      border: "rgba(185, 28, 28, 0.35)",
    };
  }
  if (n.includes("eleve") || n.includes("élev")) {
    return { label: "Élevée", dot: "#ea580c", border: "rgba(234, 88, 12, 0.3)" };
  }
  if (n.includes("moyen")) {
    return { label: "Moyenne", dot: "#ca8a04", border: "rgba(202, 138, 4, 0.3)" };
  }
  if (n.includes("faib")) {
    return { label: "Faible", dot: "#64748b", border: "rgba(100, 116, 139, 0.35)" };
  }
  return { label: priority, dot: "#64748b", border: "rgba(100, 116, 139, 0.2)" };
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") {
    return true;
  }
  if (e instanceof Error && e.name === "AbortError") {
    return true;
  }
  return false;
}

export default function ImprovementsModulePage() {
  const router = useRouter();
  const { user, role, loading } = useCurrentAccess();
  const itemsLoadAbortRef = useRef<AbortController | null>(null);
  const kpiLoadAbortRef = useRef<AbortController | null>(null);

  const [module, setModule] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ImprovementPriority>("Moyenne");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ImprovementItem[]>([]);
  const [fullSnapshot, setFullSnapshot] = useState<ImprovementItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<ImprovementStatus | "tous">("tous");
  const [loadingItems, setLoadingItems] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState<"tous" | ImprovementModule>("tous");
  const [visibilityScope, setVisibilityScope] = useState<VisibilityScope>("actives");
  const [refreshingKpis, setRefreshingKpis] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/");
    }
  }, [loading, role, router, user]);

  async function fetchAmeliorationList(
    options: {
      status: ImprovementStatus | "tous";
      scope: VisibilityScope;
    },
    signal?: AbortSignal
  ): Promise<ImprovementItem[]> {
    const params = new URLSearchParams();
    if (options.status !== "tous") {
      params.set("status", options.status);
    }
    params.set("scope", options.scope);
    const response = await ameliorationsApiFetch(`/api/ameliorations?${params.toString()}`, {
      method: "GET",
      signal,
    });
    const payload = (await response.json()) as {
      error?: string;
      items?: ImprovementItem[];
    };
    if (!response.ok) {
      throw new Error(payload.error || "Impossible de charger les ameliorations.");
    }
    return payload.items ?? [];
  }

  async function loadItems(
    filter: ImprovementStatus | "tous" = statusFilter,
    scope: VisibilityScope = visibilityScope,
    options?: { signal?: AbortSignal }
  ) {
    if (!user) {
      return;
    }

    const external = options?.signal;
    if (!external) {
      itemsLoadAbortRef.current?.abort();
      itemsLoadAbortRef.current = new AbortController();
    }
    const signal = external ?? itemsLoadAbortRef.current!.signal;

    setLoadingItems(true);
    try {
      const list = await fetchAmeliorationList({ status: filter, scope }, signal);
      if (signal.aborted) {
        return;
      }
      setItems(list);
      if (filter === "tous" && scope === "actives") {
        setFullSnapshot(list);
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      setMessage(error instanceof Error ? error.message : "Erreur chargement ameliorations.");
      setMessageType("error");
    } finally {
      setLoadingItems(false);
    }
  }

  async function refreshKpiSnapshot() {
    if (!user) {
      return;
    }
    kpiLoadAbortRef.current?.abort();
    kpiLoadAbortRef.current = new AbortController();
    const signal = kpiLoadAbortRef.current.signal;
    setRefreshingKpis(true);
    try {
      const list = await fetchAmeliorationList({ status: "tous", scope: "actives" }, signal);
      if (signal.aborted) {
        return;
      }
      setFullSnapshot(list);
    } catch (e) {
      if (!isAbortError(e)) {
        /* KPIs restent sur le dernier etat connu */
      }
    } finally {
      setRefreshingKpis(false);
    }
  }

  const kpi = useMemo(() => {
    const list = fullSnapshot;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    let nouvelles = 0;
    let enAttente = 0;
    let enCours = 0;
    let terminees = 0;
    for (const row of list) {
      if (row.status === "en_attente") {
        enAttente += 1;
        if (now - new Date(row.created_at).getTime() <= weekMs) {
          nouvelles += 1;
        }
      } else if (row.status === "en_traitement") {
        enCours += 1;
      } else if (row.status === "traitee") {
        terminees += 1;
      }
    }
    return { nouvelles, enAttente, enCours, terminees };
  }, [fullSnapshot]);

  const displayedItems = useMemo(() => {
    let rows = items;
    const q = normalizeKey(searchQuery.trim());
    if (q) {
      rows = rows.filter((row) => {
        const hay = normalizeKey(
          `${row.title} ${row.description} ${row.module} ${row.created_by_email ?? ""}`
        );
        return hay.includes(q);
      });
    }
    if (moduleFilter !== "tous") {
      rows = rows.filter((row) => row.module === moduleFilter);
    }
    return rows;
  }, [items, searchQuery, moduleFilter]);

  useEffect(() => {
    if (loading || !user || !role || role !== "admin") {
      return;
    }
    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems("tous", "actives", { signal: ac.signal });
    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      setMessage("Votre session a expire. Reconnectez-vous pour envoyer une amelioration.");
      setMessageType("error");
      return;
    }

    setMessage("");
    setMessageType(null);
    setSaving(true);

    try {
      const response = await ameliorationsApiFetch("/api/ameliorations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          module,
          priority,
          title,
          description,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        code?: string | null;
        details?: string | null;
        hint?: string | null;
        dbMessage?: string | null;
      };

      if (!response.ok) {
        const diagnosticParts = [
          payload.error,
          payload.code ? `code=${payload.code}` : null,
          payload.dbMessage ? `db=${payload.dbMessage}` : null,
          payload.details ? `details=${payload.details}` : null,
          payload.hint ? `hint=${payload.hint}` : null,
        ].filter((value): value is string => Boolean(value));

        const diagnostic = diagnosticParts.join(" | ");
        console.error("[ameliorations][submit] API error", {
          status: response.status,
          payload,
        });
        throw new Error(
          diagnostic
            ? `Erreur soumission: ${diagnostic}`
            : "Erreur soumission: erreur inconnue lors de l envoi de l amelioration."
        );
      }

      setMessage("Amelioration envoyee avec succes.");
      setMessageType("success");
      setModule("");
      setTitle("");
      setDescription("");
      setPriority("Moyenne");
      setVisibilityScope("actives");
      setStatusFilter("tous");
      await loadItems("tous", "actives");
      await refreshKpiSnapshot();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Erreur lors de l envoi de l amelioration."
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(id: number, status: ImprovementStatus) {
    setUpdatingId(id);
    setMessage("");
    setMessageType(null);
    try {
      const response = await ameliorationsApiFetch("/api/ameliorations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Impossible de mettre a jour le statut.");
      }

      setMessage("Statut mis a jour.");
      setMessageType("success");
      await loadItems(statusFilter, visibilityScope);
      await refreshKpiSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur mise a jour statut.");
      setMessageType("error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleArchive(id: number) {
    if (
      !window.confirm("Archiver cette amélioration ? Elle ne sera plus visible dans la liste active.")
    ) {
      return;
    }
    setActionBusyId(id);
    setMessage("");
    setMessageType(null);
    try {
      const response = await ameliorationsApiFetch(`/api/ameliorations/${id}/archive`, {
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Archivage impossible.");
      }
      setMessage("Suggestion archivée.");
      setMessageType("success");
      await loadItems(statusFilter, visibilityScope);
      await refreshKpiSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur archivage.");
      setMessageType("error");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleRestore(id: number) {
    if (!window.confirm("Remettre cette suggestion dans la liste active ?")) {
      return;
    }
    setActionBusyId(id);
    setMessage("");
    setMessageType(null);
    try {
      const response = await ameliorationsApiFetch(`/api/ameliorations/${id}/restore`, {
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Restauration impossible.");
      }
      setMessage("Suggestion remise en liste active.");
      setMessageType("success");
      await loadItems(statusFilter, visibilityScope);
      await refreshKpiSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur restauration.");
      setMessageType("error");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleSoftDelete(id: number) {
    if (
      !window.confirm(
        "Supprimer définitivement cette amélioration ?\nCette action est irréversible : la suggestion ne sera plus visible (suppression enregistrée en base)."
      )
    ) {
      return;
    }
    setActionBusyId(id);
    setMessage("");
    setMessageType(null);
    try {
      const response = await ameliorationsApiFetch(`/api/ameliorations/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Suppression impossible.");
      }
      setMessage("Suppression enregistrée.");
      setMessageType("success");
      await loadItems(statusFilter, visibilityScope);
      await refreshKpiSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur suppression.");
      setMessageType("error");
    } finally {
      setActionBusyId(null);
    }
  }

  const canManageImprovements = role === "admin";

  if (loading || !user) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content" style={{ maxWidth: 760 }}>
          <HeaderTagora
            title="Ameliorations"
            subtitle="Chargement"
            showNavigation={false}
          />
          <AccessNotice description="Chargement en cours." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div
        className="tagora-app-content"
        style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}
      >
        <HeaderTagora
          title="Ameliorations"
          subtitle="Nouveau point"
        />

        <div className="tagora-panel" style={{ maxWidth: 560, margin: "0 auto" }}>
          <FeedbackMessage message={message} type={messageType} />

          <form className="tagora-form-grid" onSubmit={handleSubmit}>
            <div className="tagora-form-grid-2" style={{ gap: 16 }}>
              <label>
                <span className="tagora-field-label">Module</span>
                <select
                  className="tagora-select"
                  value={module}
                  onChange={(event) => setModule(event.target.value)}
                  required
                >
                  <option value="">Choisir</option>
                  {IMPROVEMENT_MODULE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="tagora-field-label">Priorite</span>
                <select
                  className="tagora-select"
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as ImprovementPriority)
                  }
                >
                  {IMPROVEMENT_PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span className="tagora-field-label">Titre</span>
              <input
                className="tagora-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Titre"
                required
              />
            </label>

            <label>
              <span className="tagora-field-label">Description</span>
              <textarea
                className="tagora-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
                required
              />
            </label>

            <div className="tagora-actions" style={{ marginTop: 8 }}>
              <button
                type="submit"
                className="tagora-btn tagora-btn-primary"
                disabled={saving}
              >
                {saving ? "Envoi..." : "Envoyer"}
              </button>

              <Link
                href={role ? getHomePathForRole(role) : "/"}
                className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
              >
                Retour
              </Link>
            </div>
          </form>
        </div>

        {canManageImprovements ? (
          <section
            style={{
              marginTop: 32,
              padding: 0,
            }}
          >
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 20,
              boxShadow: "0 22px 50px rgba(15, 23, 42, 0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "28px 24px 20px",
                borderBottom: "1px solid rgba(226, 232, 240, 0.9)",
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  fontWeight: 600,
                }}
              >
                Suivi
              </p>
              <h2
                style={{
                  margin: "8px 0 0",
                  fontSize: 26,
                  lineHeight: 1.2,
                  letterSpacing: "-0.03em",
                  color: "#0f172a",
                  fontWeight: 700,
                }}
              >
                Consultation des améliorations
              </h2>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "#64748b",
                  fontSize: 15,
                  lineHeight: 1.55,
                  maxWidth: 720,
                }}
              >
                Tableau de bord de lecture rapide: priorités, statuts et actions sur chaque
                suggestion.
              </p>
            </div>

            <div style={{ padding: 24, background: "#fafbfc" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 14,
                  marginBottom: 22,
                }}
              >
                {[
                  {
                    key: "nouvelles",
                    label: "Nouvelles",
                    sub: "7 j., en attente",
                    value: kpi.nouvelles,
                    icon: Inbox,
                    accent: "linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(255,255,255,0) 100%)",
                  },
                  {
                    key: "att",
                    label: "En attente",
                    sub: "File",
                    value: kpi.enAttente,
                    icon: Clock3,
                    accent: "linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(255,255,255,0) 100%)",
                  },
                  {
                    key: "cours",
                    label: "En cours",
                    sub: "Traitement",
                    value: kpi.enCours,
                    icon: ListFilter,
                    accent: "linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(255,255,255,0) 100%)",
                  },
                  {
                    key: "done",
                    label: "Terminées",
                    sub: "Clôturées",
                    value: kpi.terminees,
                    icon: CheckCircle2,
                    accent: "linear-gradient(135deg, rgba(34,197,94,0.2) 0%, rgba(255,255,255,0) 100%)",
                  },
                ].map((k) => {
                  const Icon = k.icon;
                  return (
                    <div
                      key={k.key}
                      style={{
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 16,
                        padding: "16px 18px",
                        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#475569",
                            }}
                          >
                            {k.label}
                          </p>
                          <p
                            style={{
                              margin: "2px 0 0",
                              fontSize: 11,
                              color: "#94a3b8",
                            }}
                          >
                            {k.sub}
                          </p>
                        </div>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: k.accent,
                            color: "#17376b",
                            border: "1px solid rgba(148, 163, 184, 0.25)",
                          }}
                        >
                          <Icon size={20} strokeWidth={2} />
                        </div>
                      </div>
                      <p
                        style={{
                          margin: "12px 0 0",
                          fontSize: 32,
                          fontWeight: 700,
                          letterSpacing: "-0.04em",
                          color: "#0f172a",
                        }}
                      >
                        {k.value}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "stretch",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    flex: "1 1 220px",
                    minWidth: 200,
                    position: "relative",
                  }}
                >
                  <Search
                    size={16}
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94a3b8",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="search"
                    className="tagora-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher titre, module, e-mail…"
                    aria-label="Rechercher dans les suggestions"
                    style={{
                      paddingLeft: 40,
                      width: "100%",
                      minHeight: 44,
                      borderRadius: 12,
                      border: "1px solid #dbe5f1",
                      background: "#fff",
                    }}
                  />
                </div>
                <select
                  className="tagora-select"
                  value={visibilityScope}
                  onChange={(event) => {
                    const next = event.target.value as VisibilityScope;
                    setVisibilityScope(next);
                    void loadItems(statusFilter, next);
                  }}
                  aria-label="Actives, archivées ou toutes"
                  style={{
                    flex: "1 1 150px",
                    minWidth: 150,
                    minHeight: 44,
                    borderRadius: 12,
                    border: "1px solid #dbe5f1",
                    background: "#fff",
                  }}
                >
                  <option value="actives">Actives</option>
                  <option value="archive">Archivées</option>
                  <option value="tous">Toutes (non supprimées)</option>
                </select>
                <select
                  className="tagora-select"
                  value={statusFilter}
                  onChange={(event) => {
                    const next = event.target.value as ImprovementStatus | "tous";
                    setStatusFilter(next);
                    void loadItems(next, visibilityScope);
                  }}
                  aria-label="Filtrer par statut"
                  style={{
                    flex: "1 1 160px",
                    minWidth: 160,
                    minHeight: 44,
                    borderRadius: 12,
                    border: "1px solid #dbe5f1",
                    background: "#fff",
                  }}
                >
                  <option value="tous">Tous les statuts</option>
                  {IMPROVEMENT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {statusToBadge(s).label} ({s})
                    </option>
                  ))}
                </select>
                <select
                  className="tagora-select"
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value as "tous" | ImprovementModule)}
                  aria-label="Filtrer par module"
                  style={{
                    flex: "1 1 160px",
                    minWidth: 160,
                    minHeight: 44,
                    borderRadius: 12,
                    border: "1px solid #dbe5f1",
                    background: "#fff",
                  }}
                >
                  <option value="tous">Tous les modules</option>
                  {IMPROVEMENT_MODULE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="tagora-dark-action"
                  disabled={loadingItems || refreshingKpis}
                  onClick={() => {
                    void loadItems(statusFilter, visibilityScope);
                    void refreshKpiSnapshot();
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    minHeight: 44,
                    borderRadius: 12,
                    padding: "0 20px",
                  }}
                >
                  <RefreshCw
                    size={16}
                    style={
                      loadingItems || refreshingKpis
                        ? { animation: "tagora-refresh-spin 0.8s linear infinite" }
                        : undefined
                    }
                  />
                  Actualiser
                </button>
              </div>

              {loadingItems && items.length === 0 ? (
                <p
                  className="tagora-note"
                  style={{
                    margin: 0,
                    padding: "32px 8px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: 15,
                  }}
                >
                  Chargement des suggestions…
                </p>
              ) : items.length === 0 ? (
                <p
                  className="tagora-note"
                  style={{
                    margin: 0,
                    padding: "32px 8px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: 15,
                  }}
                >
                  Aucune amélioration pour le filtre serveur (statut).
                </p>
              ) : displayedItems.length === 0 ? (
                <p
                  className="tagora-note"
                  style={{
                    margin: 0,
                    padding: "32px 8px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: 15,
                  }}
                >
                  Aucun résultat pour la recherche ou le module sélectionné.
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
                    gap: 16,
                  }}
                >
                  {displayedItems.map((item) => {
                    const st = statusToBadge(item.status);
                    const pr = priorityToVisual(item.priority);
                    const isRecent =
                      !item.archived_at &&
                      item.status === "en_attente" &&
                      // eslint-disable-next-line react-hooks/purity
                      Date.now() - new Date(item.created_at).getTime() <=
                        7 * 24 * 60 * 60 * 1000;
                    return (
                      <li key={item.id}>
                        <article
                          style={{
                            height: "100%",
                            minHeight: 200,
                            background: "#fff",
                            border: "1px solid #e2e8f0",
                            borderRadius: 16,
                            padding: 20,
                            boxShadow: "0 14px 32px rgba(15, 23, 42, 0.05)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: st.bg,
                                color: st.color,
                                border: `1px solid ${st.border}`,
                              }}
                            >
                              {st.label}
                            </span>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: "rgba(248, 250, 252, 0.9)",
                                color: "#334155",
                                border: `1px solid ${pr.border}`,
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: 999,
                                  background: pr.dot,
                                }}
                              />
                              {pr.label}
                            </span>
                            {isRecent ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "#4f46e5",
                                  background: "rgba(99, 102, 241, 0.1)",
                                  border: "1px solid rgba(99, 102, 241, 0.25)",
                                  borderRadius: 8,
                                  padding: "2px 8px",
                                }}
                              >
                                Nouveau
                              </span>
                            ) : null}
                            {visibilityScope === "tous" && item.archived_at ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "#64748b",
                                  background: "rgba(241, 245, 249, 0.95)",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 8,
                                  padding: "2px 8px",
                                }}
                              >
                                Archivée
                              </span>
                            ) : null}
                          </div>

                          <h3
                            style={{
                              margin: 0,
                              fontSize: 18,
                              lineHeight: 1.3,
                              fontWeight: 700,
                              color: "#0f172a",
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {item.title}
                          </h3>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 14,
                              lineHeight: 1.55,
                              color: "#475569",
                              flex: 1,
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {item.description}
                          </p>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 12,
                              fontSize: 12,
                              color: "#64748b",
                            }}
                          >
                            <span style={{ fontWeight: 600, color: "#1e3a5f" }}>
                              {item.module}
                            </span>
                            <span>
                              {new Date(item.created_at).toLocaleString("fr-CA", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </span>
                            {item.created_by_email ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <Mail size={13} />
                                {item.created_by_email}
                              </span>
                            ) : null}
                          </div>
                          {role === "admin" ? (
                            <div
                              style={{
                                marginTop: "auto",
                                paddingTop: 8,
                                borderTop: "1px solid #f1f5f9",
                              }}
                            >
                              <label
                                style={{
                                  display: "block",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  color: "#94a3b8",
                                  marginBottom: 6,
                                }}
                              >
                                Statut
                              </label>
                              <select
                                className="tagora-select"
                                value={item.status}
                                disabled={
                                  updatingId === item.id ||
                                  actionBusyId === item.id
                                }
                                onChange={(event) =>
                                  void handleUpdateStatus(
                                    item.id,
                                    event.target.value as ImprovementStatus
                                  )
                                }
                                style={{
                                  width: "100%",
                                  minHeight: 42,
                                  fontSize: 14,
                                  borderRadius: 12,
                                  border: "1px solid #dbe5f1",
                                  background: "#f8fafc",
                                }}
                              >
                                {IMPROVEMENT_STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {statusToBadge(s).label}
                                  </option>
                                ))}
                              </select>
                              {updatingId === item.id ? (
                                <p
                                  style={{
                                    margin: "6px 0 0",
                                    fontSize: 12,
                                    color: "#64748b",
                                  }}
                                >
                                  Mise à jour…
                                </p>
                              ) : null}

                              <div
                                style={{
                                  marginTop: 12,
                                  paddingTop: 10,
                                  borderTop: "1px solid #f1f5f9",
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    width: "100%",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    color: "#94a3b8",
                                    marginBottom: 2,
                                  }}
                                >
                                  Archivage & suppression
                                </span>
                                {item.archived_at ? (
                                  <button
                                    type="button"
                                    disabled={actionBusyId === item.id || updatingId === item.id}
                                    onClick={() => void handleRestore(item.id)}
                                    className="tagora-dark-outline-action"
                                    style={{
                                      fontSize: 13,
                                      padding: "6px 12px",
                                      borderRadius: 10,
                                      minHeight: 36,
                                    }}
                                  >
                                    {actionBusyId === item.id ? "…" : "Restaurer"}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={actionBusyId === item.id || updatingId === item.id}
                                    onClick={() => void handleArchive(item.id)}
                                    className="tagora-dark-outline-action"
                                    style={{
                                      fontSize: 13,
                                      padding: "6px 12px",
                                      borderRadius: 10,
                                      minHeight: 36,
                                    }}
                                  >
                                    {actionBusyId === item.id ? "…" : "Archiver"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={actionBusyId === item.id || updatingId === item.id}
                                  onClick={() => void handleSoftDelete(item.id)}
                                  style={{
                                    fontSize: 13,
                                    padding: "6px 12px",
                                    borderRadius: 10,
                                    minHeight: 36,
                                    border: "1px solid rgba(185, 28, 28, 0.25)",
                                    background: "rgba(254, 242, 242, 0.6)",
                                    color: "#b91c1c",
                                    cursor: "pointer",
                                  }}
                                >
                                  {actionBusyId === item.id ? "…" : "Supprimer"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
