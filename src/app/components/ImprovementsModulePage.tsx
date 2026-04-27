"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccessNotice from "@/app/components/AccessNotice";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import HeaderTagora from "@/app/components/HeaderTagora";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  IMPROVEMENT_MODULE_OPTIONS,
  IMPROVEMENT_PRIORITY_OPTIONS,
  IMPROVEMENT_STATUS_OPTIONS,
  ImprovementPriority,
  ImprovementStatus,
} from "@/app/lib/improvements";
import { getHomePathForRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";

export default function ImprovementsModulePage() {
  const router = useRouter();
  const { user, role, loading } = useCurrentAccess();

  const [module, setModule] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ImprovementPriority>("Moyenne");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<
    Array<{
      id: number;
      created_at: string;
      module: string;
      priority: string;
      status: ImprovementStatus;
      title: string;
      description: string;
      created_by_email: string | null;
    }>
  >([]);
  const [statusFilter, setStatusFilter] = useState<ImprovementStatus | "tous">("tous");
  const [loadingItems, setLoadingItems] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && (!user || !role)) {
      router.replace("/");
    }
  }, [loading, role, router, user]);

  async function getSessionToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function loadItems(filter: ImprovementStatus | "tous" = statusFilter) {
    if (!user) return;

    setLoadingItems(true);
    try {
      const token = await getSessionToken();
      if (!token) {
        throw new Error("Session invalide.");
      }

      const query = filter === "tous" ? "" : `?status=${encodeURIComponent(filter)}`;
      const response = await fetch(`/api/ameliorations${query}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json()) as {
        error?: string;
        items?: Array<{
          id: number;
          created_at: string;
          module: string;
          priority: string;
          status: ImprovementStatus;
          title: string;
          description: string;
          created_by_email: string | null;
        }>;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Impossible de charger les ameliorations.");
      }

      setItems(payload.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur chargement ameliorations.");
      setMessageType("error");
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    if (loading || !user || !role) return;
    void loadItems("tous");
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
      const accessToken = await getSessionToken();
      if (!accessToken) {
        throw new Error("Votre session a expire. Reconnectez-vous pour envoyer une amelioration.");
      }

      const response = await fetch("/api/ameliorations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      await loadItems("tous");
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
      const accessToken = await getSessionToken();
      if (!accessToken) {
        throw new Error("Session invalide.");
      }

      const response = await fetch("/api/ameliorations", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      await loadItems(statusFilter);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur mise a jour statut.");
      setMessageType("error");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading || !user || !role) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content" style={{ maxWidth: 760 }}>
          <HeaderTagora
            title="Ameliorations"
            subtitle="Chargement"
          />
          <AccessNotice description="Chargement en cours." />
        </div>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content" style={{ maxWidth: 760 }}>
          <HeaderTagora title="Ameliorations" subtitle="Acces reserve" />
          <AccessNotice description="Ce module est reserve aux comptes admin." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 760 }}>
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
                href={getHomePathForRole(role)}
                className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
              >
                Retour
              </Link>
            </div>
          </form>
        </div>

        <div className="tagora-panel" style={{ marginTop: 20 }}>
          <div className="tagora-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="section-title" style={{ margin: 0 }}>Consultation ameliorations</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="tagora-select"
                value={statusFilter}
                onChange={(event) => {
                  const next = event.target.value as ImprovementStatus | "tous";
                  setStatusFilter(next);
                  void loadItems(next);
                }}
              >
                <option value="tous">Tous les statuts</option>
                {IMPROVEMENT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => void loadItems(statusFilter)}
              >
                Actualiser
              </button>
            </div>
          </div>

          {loadingItems ? (
            <p className="tagora-note" style={{ marginTop: 12 }}>Chargement...</p>
          ) : items.length === 0 ? (
            <p className="tagora-note" style={{ marginTop: 12 }}>Aucune amelioration pour ce filtre.</p>
          ) : (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8 }}>Date</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Module</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Priorite</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Statut</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Titre</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Description</th>
                    {role === "admin" ? <th style={{ textAlign: "left", padding: 8 }}>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: 8 }}>{new Date(item.created_at).toLocaleString("fr-CA")}</td>
                      <td style={{ padding: 8 }}>{item.module}</td>
                      <td style={{ padding: 8 }}>{item.priority}</td>
                      <td style={{ padding: 8 }}>{item.status}</td>
                      <td style={{ padding: 8 }}>{item.title}</td>
                      <td style={{ padding: 8 }}>{item.description}</td>
                      {role === "admin" ? (
                        <td style={{ padding: 8 }}>
                          <select
                            className="tagora-select"
                            value={item.status}
                            disabled={updatingId === item.id}
                            onChange={(event) =>
                              void handleUpdateStatus(
                                item.id,
                                event.target.value as ImprovementStatus
                              )
                            }
                          >
                            {IMPROVEMENT_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
