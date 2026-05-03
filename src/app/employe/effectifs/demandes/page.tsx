"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  EFFECTIFS_SCHEDULE_REQUEST_TYPES,
  scheduleRequestStatusLabel,
  scheduleRequestTypeLabel,
} from "@/app/lib/effectifs-schedule-request.shared";
import type { DirectionEffectifsPayload } from "@/app/lib/effectifs-payload.shared";
import { supabase } from "@/app/lib/supabase/client";

export default function EmployeEffectifsDemandesPage() {
  const router = useRouter();
  const { user, loading: accessLoading } = useCurrentAccess();
  const [payload, setPayload] = useState<DirectionEffectifsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    request_type: "day_off",
    requested_date: "",
    requested_start_date: "",
    requested_end_date: "",
    is_full_day: false,
    start_time: "",
    end_time: "",
    reason: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setPayload(null);
      setLoading(false);
      return;
    }
    const res = await fetch("/api/direction/effectifs", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      setPayload(null);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as DirectionEffectifsPayload;
    setPayload(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !user) return;
    void load();
  }, [accessLoading, user, load]);

  useEffect(() => {
    if (!accessLoading && !user) {
      router.replace("/employe/login");
    }
  }, [accessLoading, user, router]);

  async function authJsonHeaders(): Promise<HeadersInit> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payload?.meta.linkedChauffeurId) {
      setMessage("Profil non lié. Contactez la direction.");
      setMessageType("error");
      return;
    }
    const justification = form.reason.trim();
    if (!justification) {
      setMessage("Veuillez inscrire une justification pour cette demande.");
      setMessageType("error");
      return;
    }
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch("/api/employe/effectifs/schedule-requests", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          request_type: form.request_type,
          requested_date: form.requested_date,
          requested_start_date: form.requested_start_date || null,
          requested_end_date: form.requested_end_date || null,
          is_full_day: form.is_full_day,
          start_time: form.start_time.trim() || null,
          end_time: form.end_time.trim() || null,
          reason: justification,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Erreur envoi.");
        setMessageType("error");
        return;
      }
      setMessage("Votre demande a été transmise à la direction pour approbation.");
      setMessageType("success");
      setForm((f) => ({
        ...f,
        reason: "",
        start_time: "",
        end_time: "",
        requested_start_date: "",
        requested_end_date: "",
      }));
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (accessLoading || loading) {
    return <TagoraLoadingScreen isLoading message="Chargement…" fullScreen />;
  }

  if (!user || !payload) {
    return null;
  }

  const mine = payload.scheduleRequests;

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg mx-auto w-full max-w-[720px] px-4 py-6">
        <AuthenticatedPageHeader
          title="Demandes d’horaire et exceptions"
          subtitle=""
          showNavigation={false}
          actions={
            <div
              style={{
                display: "flex",
                gap: "var(--ui-space-3)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <SecondaryButton type="button" onClick={() => router.push("/employe/dashboard")}>
                Retour dashboard employé
              </SecondaryButton>
            </div>
          }
        />

        {message ? <FeedbackMessage message={message} type={messageType ?? "error"} /> : null}

        <AppCard className="rounded-2xl ui-stack-sm" tone="muted">
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#334155", lineHeight: 1.55 }}>
            <strong>Rappel :</strong> {payload.meta.plannedTimeReferenceNote}
          </p>
        </AppCard>

        {!payload.meta.linkedChauffeurId ? (
          <SectionCard title="Lien employé" subtitle="Votre compte n’est pas relié à une fiche chauffeur.">
            <p style={{ margin: 0, color: "#64748b" }}>
              Contactez la direction pour activer les demandes d’horaire.
            </p>
          </SectionCard>
        ) : (
          <SectionCard
            title="Nouvelle demande"
            subtitle="Congé, vacances, retard, départ plus tôt, absence partielle, changement d’horaire, télétravail ou autre exception."
          >
            <form className="ui-stack-md" onSubmit={(e) => void handleSubmit(e)}>
              <label className="ui-stack-xs">
                <span className="ui-eyebrow">Type de demande</span>
                <select
                  className="tagora-input"
                  value={form.request_type}
                  onChange={(e) => setForm((f) => ({ ...f, request_type: e.target.value }))}
                >
                  {EFFECTIFS_SCHEDULE_REQUEST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {scheduleRequestTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ui-stack-xs">
                <span className="ui-eyebrow">Date ou période</span>
                <input
                  className="tagora-input"
                  type="date"
                  required={form.request_type !== "vacation"}
                  value={form.requested_date}
                  onChange={(e) => setForm((f) => ({ ...f, requested_date: e.target.value }))}
                />
              </label>
              {form.request_type === "vacation" ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <label className="ui-stack-xs">
                    <span className="ui-eyebrow">Début vacances</span>
                    <input
                      className="tagora-input"
                      type="date"
                      required
                      value={form.requested_start_date}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, requested_start_date: e.target.value }))
                      }
                    />
                  </label>
                  <label className="ui-stack-xs">
                    <span className="ui-eyebrow">Fin vacances</span>
                    <input
                      className="tagora-input"
                      type="date"
                      required
                      value={form.requested_end_date}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, requested_end_date: e.target.value }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <label className="ui-stack-xs">
                  <span className="ui-eyebrow">Heure début (si applicable)</span>
                  <input
                    className="tagora-input"
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  />
                </label>
                <label className="ui-stack-xs">
                  <span className="ui-eyebrow">Heure fin (si applicable)</span>
                  <input
                    className="tagora-input"
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  />
                </label>
              </div>
              <label className="ui-stack-xs">
                <span className="ui-eyebrow">Justification (obligatoire)</span>
                <textarea
                  className="tagora-input"
                  rows={3}
                  required
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </label>
              <PrimaryButton type="submit" disabled={saving}>
                Soumettre
              </PrimaryButton>
            </form>
          </SectionCard>
        )}

        <SectionCard title="Mes demandes" subtitle="Statut et historique récent.">
          {mine.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>Aucune demande.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.9rem" }}>
              {mine.map((r) => (
                <li key={r.id} style={{ marginBottom: 8 }}>
                  <strong>
                    {r.requestedDate ??
                      (r.requestedStartDate && r.requestedEndDate
                        ? `${r.requestedStartDate} → ${r.requestedEndDate}`
                        : "—")}
                  </strong>{" "}
                  — {scheduleRequestTypeLabel(r.requestType)} —{" "}
                  {scheduleRequestStatusLabel(r.status)}
                  {r.reviewNote ? ` — Note : ${r.reviewNote}` : ""}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
