"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";

function DemandeComptePageContent() {
  const searchParams = useSearchParams();
  const portal = searchParams.get("portal") === "direction" ? "direction" : "employe";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [requestedRole, setRequestedRole] = useState<"employe" | "direction">(portal);
  const [message, setMessage] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [permissionOptions, setPermissionOptions] = useState<
    Array<{ value: string; label: string }>
  >([...accountRequestPermissionOptions]);

  const subtitle = useMemo(() => {
    return portal === "direction"
      ? "Soumettez une demande d'acces direction. Aucun acces ne sera ouvert avant validation."
      : "Soumettez une demande d'acces employe. Aucun acces ne sera ouvert avant validation.";
  }, [portal]);

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

  function togglePermission(permission: string) {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMessage("");
    setFeedbackType(null);
    setSaving(true);

    try {
      const requestPayload = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        company: company.trim(),
        portalSource: portal,
        requestedRole,
        requestedPermissions: selectedPermissions,
        message: message.trim(),
      };

      console.log("[demande-compte] donnees envoyees", requestPayload);

      const response = await fetch("/api/account-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      const payload = await response.json();

      console.log("[demande-compte] response.status", response.status);
      console.log("[demande-compte] payload", payload);
      console.log("[demande-compte] payload.debug", payload?.debug ?? null);

      console.log("[demande-compte] reponse api", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        payload,
      });

      console.log("[demande-compte] error.message", payload?.debug?.message ?? null);
      console.log("[demande-compte] error.details", payload?.debug?.details ?? null);
      console.log("[demande-compte] error.hint", payload?.debug?.hint ?? null);
      console.log("[demande-compte] error.code", payload?.debug?.code ?? null);

      if (!response.ok) {
        throw new Error(payload.error || "Erreur lors de la demande.");
      }

      setFeedbackMessage(
        "Votre demande a ete enregistree avec le statut pending. La direction doit maintenant l'examiner."
      );
      setFeedbackType("success");
      setFullName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setMessage("");
      setSelectedPermissions([]);
      setRequestedRole(portal);
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Erreur creation demande."
      );
      setFeedbackType("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 1100 }}>
        <HeaderTagora
          title="Demande de creation de compte"
          subtitle={subtitle}
        />

        <div className="tagora-split">
          <section className="tagora-panel">
            <h2 className="section-title" style={{ marginBottom: 10 }}>
              Soumettre une demande
            </h2>

            <p className="tagora-note" style={{ marginBottom: 20 }}>
              La direction recevra votre demande, choisira le role final et validera les autorisations avant toute activation.
            </p>

            <FeedbackMessage message={feedbackMessage} type={feedbackType} />

            <form className="tagora-form-grid" onSubmit={handleSubmit}>
              <div className="tagora-form-grid-2">
                <div>
                  <label className="tagora-field-label">Nom complet</label>
                  <input
                    className="tagora-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nom et prenom"
                    required
                  />
                </div>

                <div>
                  <label className="tagora-field-label">Courriel</label>
                  <input
                    className="tagora-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@entreprise.com"
                    required
                  />
                </div>
              </div>

              <div className="tagora-form-grid-2">
                <div>
                  <label className="tagora-field-label">Telephone</label>
                  <input
                    className="tagora-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="418-555-0000"
                  />
                </div>

                <div>
                  <label className="tagora-field-label">Compagnie</label>
                  <input
                    className="tagora-input"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="TAGORA"
                  />
                </div>
              </div>

              <div>
                <label className="tagora-field-label">Role souhaite</label>
                <select
                  className="tagora-select"
                  value={requestedRole}
                  onChange={(e) =>
                    setRequestedRole(
                      e.target.value === "direction" ? "direction" : "employe"
                    )
                  }
                >
                  <option value="employe">Employe</option>
                  <option value="direction">Direction</option>
                </select>
              </div>

              <div>
                <label className="tagora-field-label">Autorisations souhaitees</label>
                <div className="tagora-panel-muted" style={{ display: "grid", gap: 10 }}>
                  {permissionOptions.map((option) => (
                    <label
                      key={option.value}
                      style={{ display: "flex", alignItems: "center", gap: 10, color: "#334155" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(option.value)}
                        onChange={() => togglePermission(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="tagora-field-label">Commentaire</label>
                <textarea
                  className="tagora-textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Expliquez le contexte, le poste ou les besoins d'acces."
                />
              </div>

              <div className="tagora-actions">
                <button
                  type="submit"
                  className="tagora-btn tagora-btn-primary"
                  disabled={saving}
                >
                  {saving ? "Envoi..." : "Envoyer la demande"}
                </button>

                <Link
                  href={portal === "direction" ? "/direction/login" : "/employe/login"}
                  className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
                >
                  Retour connexion
                </Link>
              </div>
            </form>
          </section>

          <aside className="tagora-stack">
            <div className="tagora-panel">
              <h2 className="section-title" style={{ marginBottom: 10 }}>
                Processus
              </h2>
              <ol style={{ margin: 0, paddingLeft: 18, color: "#475569", lineHeight: 1.7 }}>
                <li>Vous soumettez une demande.</li>
                <li>La direction la voit dans son espace interne.</li>
                <li>La direction approuve ou refuse.</li>
                <li>Le role final et les autorisations sont definis au moment de l approbation.</li>
                <li>Aucun acces ne devient actif avant cette etape.</li>
              </ol>
            </div>

            <div className="tagora-panel">
              <h2 className="section-title" style={{ marginBottom: 10 }}>
                Bon a savoir
              </h2>
              <p className="tagora-note">
                Si la notification courriel est configuree, la direction recevra un message a chaque nouvelle demande. Sinon, la demande reste visible dans le module direction.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function DemandeComptePage() {
  return (
    <Suspense
      fallback={
        <main className="tagora-app-shell">
          <div className="tagora-app-content" style={{ maxWidth: 1100 }}>
            <HeaderTagora
              title="Demande de creation de compte"
              subtitle="Chargement du formulaire..."
            />
          </div>
        </main>
      }
    >
      <DemandeComptePageContent />
    </Suspense>
  );
}
