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
  type EffectifsScheduleRequestType,
} from "@/app/lib/effectifs-schedule-request.shared";
import type { DirectionEffectifsPayload } from "@/app/lib/effectifs-payload.shared";
import { supabase } from "@/app/lib/supabase/client";

type DemandesFormState = {
  request_type: EffectifsScheduleRequestType;
  requested_date: string;
  requested_start_date: string;
  requested_end_date: string;
  is_full_day: boolean;
  start_time: string;
  end_time: string;
  reason: string;
};

function trimTime(value: string): string {
  return value.trim().slice(0, 5);
}

function timeToMinutes(hhmm: string): number | null {
  const t = trimTime(hhmm);
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Payload normalisé selon le type (contrainte DB : deux heures null ou fin > début). */
function normalizeScheduleRequestPayload(form: DemandesFormState): {
  error: string | null;
  body: Record<string, unknown> | null;
} {
  const request_type = form.request_type;
  const justification = form.reason.trim();
  const rd = form.requested_date.trim().slice(0, 10);
  const rs = form.requested_start_date.trim().slice(0, 10);
  const re = form.requested_end_date.trim().slice(0, 10);
  const stRaw = trimTime(form.start_time);
  const enRaw = trimTime(form.end_time);

  if (request_type === "vacation") {
    if (!rs || !re) {
      return {
        error:
          "Une demande de vacances doit contenir une date de début et une date de fin.",
        body: null,
      };
    }
    if (re < rs) {
      return { error: "La date de fin ne peut pas être avant la date de début.", body: null };
    }
    return {
      error: null,
      body: {
        request_type,
        requested_date: null,
        requested_start_date: rs,
        requested_end_date: re,
        is_full_day: true,
        start_time: null,
        end_time: null,
        reason: justification,
      },
    };
  }

  if (request_type === "day_off") {
    if (!rd || !/^\d{4}-\d{2}-\d{2}$/.test(rd)) {
      return { error: "Indiquez la date du congé.", body: null };
    }
    return {
      error: null,
      body: {
        request_type,
        requested_date: rd,
        requested_start_date: null,
        requested_end_date: null,
        is_full_day: true,
        start_time: null,
        end_time: null,
        reason: justification,
      },
    };
  }

  if (request_type === "late_arrival" || request_type === "start_later") {
    if (!rd || !/^\d{4}-\d{2}-\d{2}$/.test(rd)) {
      return { error: "Indiquez la date concernée.", body: null };
    }
    if (!stRaw || !/^\d{2}:\d{2}$/.test(stRaw)) {
      return { error: "Indiquez la nouvelle heure d’arrivée.", body: null };
    }
    return {
      error: null,
      body: {
        request_type,
        requested_date: rd,
        requested_start_date: null,
        requested_end_date: null,
        is_full_day: false,
        start_time: stRaw,
        end_time: null,
        reason: justification,
      },
    };
  }

  if (request_type === "leave_early") {
    if (!rd || !/^\d{4}-\d{2}-\d{2}$/.test(rd)) {
      return { error: "Indiquez la date concernée.", body: null };
    }
    if (!enRaw || !/^\d{2}:\d{2}$/.test(enRaw)) {
      return { error: "Indiquez l’heure de fin souhaitée.", body: null };
    }
    return {
      error: null,
      body: {
        request_type,
        requested_date: rd,
        requested_start_date: null,
        requested_end_date: null,
        is_full_day: false,
        start_time: null,
        end_time: enRaw,
        reason: justification,
      },
    };
  }

  if (request_type === "partial_absence" || request_type === "change_shift") {
    if (!rd || !/^\d{4}-\d{2}-\d{2}$/.test(rd)) {
      return { error: "Indiquez la date concernée.", body: null };
    }
    if (!stRaw || !enRaw || !/^\d{2}:\d{2}$/.test(stRaw) || !/^\d{2}:\d{2}$/.test(enRaw)) {
      return { error: "Indiquez l’heure de début et l’heure de fin.", body: null };
    }
    const sm = timeToMinutes(stRaw);
    const em = timeToMinutes(enRaw);
    if (sm == null || em == null) {
      return { error: "Heures invalides.", body: null };
    }
    if (em <= sm) {
      return {
        error: "L’heure de fin doit être après l’heure de début.",
        body: null,
      };
    }
    return {
      error: null,
      body: {
        request_type,
        requested_date: rd,
        requested_start_date: null,
        requested_end_date: null,
        is_full_day: false,
        start_time: stRaw,
        end_time: enRaw,
        reason: justification,
      },
    };
  }

  if (!rd || !/^\d{4}-\d{2}-\d{2}$/.test(rd)) {
    return { error: "Indiquez la date concernée.", body: null };
  }

  let start_time: string | null = null;
  let end_time: string | null = null;
  if (stRaw || enRaw) {
    if (!stRaw || !enRaw || !/^\d{2}:\d{2}$/.test(stRaw) || !/^\d{2}:\d{2}$/.test(enRaw)) {
      return {
        error: "Renseignez les deux heures ou laissez les deux champs vides.",
        body: null,
      };
    }
    const sm = timeToMinutes(stRaw);
    const em = timeToMinutes(enRaw);
    if (sm == null || em == null) {
      return { error: "Heures invalides.", body: null };
    }
    if (em <= sm) {
      return {
        error: "L’heure de fin doit être après l’heure de début.",
        body: null,
      };
    }
    start_time = stRaw;
    end_time = enRaw;
  }

  return {
    error: null,
    body: {
      request_type,
      requested_date: rd,
      requested_start_date: null,
      requested_end_date: null,
      is_full_day: form.is_full_day === true,
      start_time,
      end_time,
      reason: justification,
    },
  };
}

export default function EmployeEffectifsDemandesPage() {
  const router = useRouter();
  const { user, loading: accessLoading } = useCurrentAccess();
  const [payload, setPayload] = useState<DirectionEffectifsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DemandesFormState>({
    request_type: "day_off",
    requested_date: "",
    requested_start_date: "",
    requested_end_date: "",
    is_full_day: true,
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
      const { error: normError, body: requestBody } = normalizeScheduleRequestPayload({
        ...form,
        reason: justification,
      });
      if (normError || !requestBody) {
        setMessage(normError ?? "Demande invalide.");
        setMessageType("error");
        return;
      }

      const res = await fetch("/api/employe/effectifs/schedule-requests", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify(requestBody),
      });
      const resBody = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(resBody?.error ?? "Erreur envoi.");
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
        requested_date: "",
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

  const rt = form.request_type;
  const showSingleDate = rt !== "vacation";
  const showVacationRange = rt === "vacation";
  const showStartTime =
    rt === "partial_absence" ||
    rt === "change_shift" ||
    rt === "late_arrival" ||
    rt === "start_later" ||
    rt === "swap_shift" ||
    rt === "unavailable" ||
    rt === "available_extra" ||
    rt === "remote_work" ||
    rt === "other";
  const showEndTime =
    rt === "partial_absence" ||
    rt === "change_shift" ||
    rt === "leave_early" ||
    rt === "swap_shift" ||
    rt === "unavailable" ||
    rt === "available_extra" ||
    rt === "remote_work" ||
    rt === "other";

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
                  onChange={(e) => {
                    const next = e.target.value as EffectifsScheduleRequestType;
                    setForm((f) => ({
                      ...f,
                      request_type: next,
                      start_time: "",
                      end_time: "",
                      is_full_day: next === "day_off" || next === "vacation",
                      ...(next === "vacation"
                        ? { requested_date: "" }
                        : { requested_start_date: "", requested_end_date: "" }),
                    }));
                  }}
                >
                  {EFFECTIFS_SCHEDULE_REQUEST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {scheduleRequestTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              {showSingleDate ? (
                <label className="ui-stack-xs">
                  <span className="ui-eyebrow">{rt === "day_off" ? "Date" : "Date concernée"}</span>
                  <input
                    className="tagora-input"
                    type="date"
                    required
                    value={form.requested_date}
                    onChange={(e) => setForm((f) => ({ ...f, requested_date: e.target.value }))}
                  />
                </label>
              ) : null}
              {showVacationRange ? (
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
              {showStartTime || showEndTime ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      showStartTime && showEndTime ? "1fr 1fr" : "1fr",
                    gap: 12,
                  }}
                >
                  {showStartTime ? (
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">
                        {rt === "late_arrival" || rt === "start_later"
                          ? "Nouvelle heure d’arrivée"
                          : "Heure début"}
                      </span>
                      <input
                        className="tagora-input"
                        type="time"
                        required={
                          rt === "late_arrival" ||
                          rt === "start_later" ||
                          rt === "partial_absence" ||
                          rt === "change_shift"
                        }
                        value={form.start_time}
                        onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                      />
                    </label>
                  ) : null}
                  {showEndTime ? (
                    <label className="ui-stack-xs">
                      <span className="ui-eyebrow">
                        {rt === "leave_early" ? "Heure de fin souhaitée" : "Heure fin"}
                      </span>
                      <input
                        className="tagora-input"
                        type="time"
                        required={
                          rt === "leave_early" ||
                          rt === "partial_absence" ||
                          rt === "change_shift"
                        }
                        value={form.end_time}
                        onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
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
