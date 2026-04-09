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
      const { error } = await supabase.from("app_improvements").insert([
        {
          module,
          title,
          description,
          priority,
        },
      ]);

      if (error) {
        throw error;
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
        <div className="tagora-app-content" style={{ maxWidth: 980 }}>
          <HeaderTagora
            title="Ameliorations"
            subtitle="Chargement du module interne de recommandations"
          />
          <AccessNotice description="Verification de votre session et preparation du formulaire." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 980 }}>
        <HeaderTagora
          title="Ameliorations"
          subtitle="Centralisez les idees, correctifs et recommandations avant les prochaines mises a jour."
        />

        <div className="tagora-panel" style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 className="section-title" style={{ marginBottom: 10 }}>
            Soumettre une recommandation
          </h2>

          <p className="tagora-note" style={{ marginBottom: 24 }}>
            Le formulaire est pense pour un usage interne rapide. Chaque envoi est enregistre
            avec le statut nouveau afin de preparer un futur suivi plus detaille.
          </p>

          <FeedbackMessage message={message} type={messageType} />

          <form className="tagora-form-grid" onSubmit={handleSubmit}>
            <div className="tagora-form-grid-2">
              <div>
                <label className="tagora-field-label">Module concerne</label>
                <select
                  className="tagora-select"
                  value={module}
                  onChange={(event) => setModule(event.target.value)}
                  required
                >
                  <option value="">Choisir un module</option>
                  {IMPROVEMENT_MODULE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="tagora-field-label">Priorite</label>
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
              </div>
            </div>

            <div>
              <label className="tagora-field-label">Titre</label>
              <input
                className="tagora-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Resume court de l idee ou du correctif"
                required
              />
            </div>

            <div>
              <label className="tagora-field-label">Description</label>
              <textarea
                className="tagora-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Expliquez le contexte, le besoin et le resultat attendu."
                required
              />
            </div>

            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Statut applique automatiquement : <strong>nouveau</strong>.
              </p>
            </div>

            <div className="tagora-actions" style={{ marginTop: 8 }}>
              <button
                type="submit"
                className="tagora-btn tagora-btn-primary"
                disabled={saving}
              >
                {saving ? "Envoi..." : "Envoyer l amelioration"}
              </button>

              <Link
                href={getHomePathForRole(role)}
                className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
              >
                Retour au dashboard
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
