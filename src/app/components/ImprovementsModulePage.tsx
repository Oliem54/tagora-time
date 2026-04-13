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
  ImprovementPriority,
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

  useEffect(() => {
    if (!loading && (!user || !role)) {
      router.replace("/");
    }
  }, [loading, role, router, user]);

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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Votre session a expire. Reconnectez-vous pour envoyer une amelioration.");
      }

      const response = await fetch("/api/ameliorations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          module,
          priority,
          title,
          description,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Erreur lors de l envoi de l amelioration.");
      }

      setMessage("Amelioration envoyee avec succes.");
      setMessageType("success");
      setModule("");
      setTitle("");
      setDescription("");
      setPriority("Moyenne");
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
      </div>
    </main>
  );
}
