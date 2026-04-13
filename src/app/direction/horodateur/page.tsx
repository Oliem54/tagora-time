"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import FilterBar from "@/app/components/ui/FilterBar";
import FormField from "@/app/components/ui/FormField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import StatCard from "@/app/components/ui/StatCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getCompanyLabel, type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  buildHorodateurLoadError,
  computeHorodateurState,
  getHorodateurActorLabel,
  getHorodateurEventLabel,
  getHorodateurStateLabel,
  type HorodateurEventType,
} from "@/app/lib/horodateur";
import { getSafeSupabaseSession } from "@/app/lib/supabase/session";
import { supabase } from "@/app/lib/supabase/client";

type HorodateurEvent = {
  id: string;
  user_id: string;
  event_type: HorodateurEventType;
  occurred_at: string;
  livraison_id: number | null;
  dossier_id: number | null;
  sortie_id: number | null;
  notes: string | null;
  admin_note: string | null;
  entered_by_admin: boolean;
  entered_by_user_id: string | null;
  company_context: AccountRequestCompany | null;
  source_module: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

type EmployeeOption = {
  user_id: string;
  chauffeur_id: number | null;
  label: string;
  company_context: AccountRequestCompany | null;
};

const ADMIN_PUNCH_EVENT_TYPES: HorodateurEventType[] = [
  "quart_debut",
  "pause_debut",
  "pause_fin",
  "dinner_debut",
  "dinner_fin",
  "quart_fin",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfDayIso(day: string) {
  return `${day}T00:00:00`;
}

function endOfDayIso(day: string) {
  return `${day}T23:59:59.999`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-CA");
}

function normalizeCompany(value: unknown) {
  return value === "oliem_solutions" || value === "titan_produits_industriels"
    ? value
    : null;
}

function getStateTone(state: ReturnType<typeof computeHorodateurState>) {
  if (state === "en_quart") return "info" as const;
  if (state === "en_pause" || state === "en_diner") return "warning" as const;
  if (state === "termine") return "success" as const;
  return "default" as const;
}

export default function DirectionHorodateurPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseTerrain = hasPermission("terrain");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<HorodateurEvent[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [errorText, setErrorText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | null>(null);
  const [dateFilter, setDateFilter] = useState(todayIso());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [eventType, setEventType] = useState<HorodateurEventType>("quart_debut");
  const [punchDate, setPunchDate] = useState(todayIso());
  const [punchTime, setPunchTime] = useState(new Date().toISOString().slice(11, 16));
  const [adminNote, setAdminNote] = useState("");
  const [savingPunch, setSavingPunch] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!canUseTerrain) {
      setLoading(false);
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorText("");

    const [eventsRes, employeesRes] = await Promise.allSettled([
      supabase
        .from("horodateur_events")
        .select("id, user_id, event_type, occurred_at, livraison_id, dossier_id, sortie_id, notes, admin_note, entered_by_admin, entered_by_user_id, company_context, source_module, created_at, metadata")
        .gte("occurred_at", startOfDayIso(dateFilter))
        .lte("occurred_at", endOfDayIso(dateFilter))
        .order("occurred_at", { ascending: false }),
      supabase
        .from("chauffeurs")
        .select("id, auth_user_id, nom, courriel, primary_company")
        .not("auth_user_id", "is", null)
        .order("nom", { ascending: true }),
    ]);

    if (eventsRes.status !== "fulfilled" || eventsRes.value.error) {
      setEvents([]);
      setErrorText(
        buildHorodateurLoadError(
          eventsRes.status === "fulfilled" ? eventsRes.value.error : null,
          "direction"
        )
      );
    } else {
      setEvents((eventsRes.value.data ?? []) as HorodateurEvent[]);
    }

    if (employeesRes.status !== "fulfilled" || employeesRes.value.error) {
      setEmployees([]);
    } else {
      setEmployees(
        ((employeesRes.value.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          user_id: String(row.auth_user_id ?? ""),
          chauffeur_id: typeof row.id === "number" ? row.id : null,
          label:
            String(row.nom ?? "").trim() ||
            String(row.courriel ?? "").trim() ||
            `Employe ${String(row.auth_user_id ?? "").slice(0, 8)}`,
          company_context: normalizeCompany(row.primary_company),
        }))
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, [canUseTerrain, dateFilter]);

  useEffect(() => {
    if (accessLoading || !user) return;
    const timeout = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [accessLoading, loadData, user]);

  const groupedByUser = useMemo(() => {
    const grouped = new Map<string, HorodateurEvent[]>();

    [...events]
      .reverse()
      .forEach((event) => {
        grouped.set(event.user_id, [...(grouped.get(event.user_id) ?? []), event]);
      });

    return grouped;
  }, [events]);

  const summaries = useMemo(() => {
    return [...groupedByUser.entries()].map(([userId, userEvents]) => {
      const employee = employees.find((item) => item.user_id === userId) ?? null;
      const state = computeHorodateurState(userEvents);
      const anomalies: string[] = [];
      const lastEvent = userEvents[userEvents.length - 1] ?? null;

      if (state === "en_pause") anomalies.push("Pause non terminee");
      if (state === "en_diner") anomalies.push("Diner non termine");
      if (state === "en_sortie") anomalies.push("Sortie non terminee");
      if (state === "en_quart") anomalies.push("Quart encore ouvert");

      return {
        userId,
        label:
          employee?.label ||
          String(lastEvent?.metadata?.user_email ?? `Employe ${userId.slice(0, 8)}`),
        state,
        lastEventAt: lastEvent?.occurred_at ?? null,
        anomalies,
      };
    });
  }, [employees, groupedByUser]);

  const selectedEmployee = employees.find((item) => item.user_id === selectedEmployeeId) ?? null;
  const filteredEvents = useMemo(() => {
    return selectedEmployeeId
      ? events.filter((event) => event.user_id === selectedEmployeeId)
      : events;
  }, [events, selectedEmployeeId]);

  const stats = {
    tracked: summaries.length,
    openShifts: summaries.filter((item) => item.state === "en_quart").length,
    breaks: summaries.filter((item) => item.state === "en_pause" || item.state === "en_diner").length,
    adminEntries: events.filter((event) => event.entered_by_admin).length,
  };

  async function handleAdminPunch() {
    if (!selectedEmployee) {
      setFeedback("Selectionnez un employe.");
      setFeedbackType("error");
      return;
    }

    if (!adminNote.trim()) {
      setFeedback("Une note de justification est requise.");
      setFeedbackType("error");
      return;
    }

    const { data: session } = await getSafeSupabaseSession();

    if (!session?.access_token) {
      setFeedback("Session invalide. Rechargez la connexion.");
      setFeedbackType("error");
      return;
    }

    setSavingPunch(true);
    setFeedback("");
    setFeedbackType(null);

    const occurredAt = new Date(`${punchDate}T${punchTime}:00`).toISOString();
    const response = await fetch("/api/timeclock/admin-punch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        user_id: selectedEmployee.user_id,
        chauffeur_id: selectedEmployee.chauffeur_id,
        event_type: eventType,
        occurred_at: occurredAt,
        company_context: selectedEmployee.company_context,
        note: adminNote.trim(),
      }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setFeedback(result.error || "Impossible d enregistrer le punch admin.");
      setFeedbackType("error");
      setSavingPunch(false);
      return;
    }

    setFeedback("Punch admin enregistre.");
    setFeedbackType("success");
    setAdminNote("");
    setSavingPunch(false);
    await loadData(true);
  }

  if (accessLoading || loading) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Horodateur direction" subtitle="Chargement." />
          <SectionCard title="Chargement" subtitle="Preparation de la supervision et des corrections." />
        </div>
      </main>
    );
  }

  if (!canUseTerrain) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Horodateur direction" subtitle="Pointages et corrections." />
          <SectionCard title="Acces bloque" subtitle="La permission terrain est requise pour superviser les pointages." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Horodateur direction"
          subtitle="Supervision des pointages et punch proxy admin."
          actions={
            <PrimaryButton onClick={() => void loadData(true)} disabled={refreshing}>
              {refreshing ? "Actualisation..." : "Actualiser"}
            </PrimaryButton>
          }
        />

        {errorText ? <SectionCard title="Chargement limite" subtitle={errorText} tone="muted" /> : null}
        {feedback ? <SectionCard title={feedbackType === "error" ? "Attention" : "Confirmation"} subtitle={feedback} tone="muted" /> : null}

        <div className="ui-grid-auto">
          <StatCard label="Employes suivis" value={stats.tracked} />
          <StatCard label="Quarts ouverts" value={stats.openShifts} tone="info" />
          <StatCard label="Pauses / diners" value={stats.breaks} tone="warning" />
          <StatCard label="Punchs admin" value={stats.adminEntries} tone="success" />
        </div>

        <div className="ui-section-split">
          <SectionCard title="Punch admin" subtitle="Saisir un pointage au nom d un employe.">
            <div className="ui-stack-md">
              <div className="ui-grid-2">
                <FormField label="Employe" required>
                  <select
                    className="tagora-input"
                    value={selectedEmployeeId}
                    onChange={(event) => setSelectedEmployeeId(event.target.value)}
                  >
                    <option value="">Selectionner</option>
                    {employees.map((employee) => (
                      <option key={employee.user_id} value={employee.user_id}>
                        {employee.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Type de punch" required>
                  <select
                    className="tagora-input"
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value as HorodateurEventType)}
                  >
                    {ADMIN_PUNCH_EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {getHorodateurEventLabel(type)}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="ui-grid-2">
                <FormField label="Date" required>
                  <input type="date" className="tagora-input" value={punchDate} onChange={(event) => setPunchDate(event.target.value)} />
                </FormField>

                <FormField label="Heure" required>
                  <input type="time" className="tagora-input" value={punchTime} onChange={(event) => setPunchTime(event.target.value)} />
                </FormField>
              </div>

              <FormField label="Note / justification" required>
                <textarea
                  className="tagora-textarea"
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                  placeholder="Expliquer le contexte: oubli de punch, correction manuelle, probleme technique..."
                />
              </FormField>

              <AppCard tone="muted" className="ui-stack-xs">
                <div className="ui-text-muted">Traçabilite automatique</div>
                <div>Le punch sera marque comme `saisi par admin`, `correction manuelle` et `punch proxy`.</div>
              </AppCard>

              <PrimaryButton onClick={() => void handleAdminPunch()} disabled={savingPunch}>
                {savingPunch ? "Enregistrement..." : "Enregistrer le punch"}
              </PrimaryButton>
            </div>
          </SectionCard>

          <SectionCard title="Etat courant" subtitle="Lecture rapide par employe.">
            {summaries.length === 0 ? (
              <AppCard tone="muted">
                <p className="ui-text-muted" style={{ margin: 0 }}>Aucun pointage sur la date selectionnee.</p>
              </AppCard>
            ) : (
              <div className="ui-stack-sm">
                {summaries.map((summary) => (
                  <AppCard key={summary.userId} className="ui-stack-xs" tone="muted">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong style={{ color: "var(--ui-color-primary)" }}>{summary.label}</strong>
                      <StatusBadge label={getHorodateurStateLabel(summary.state)} tone={getStateTone(summary.state)} />
                    </div>
                    <div className="ui-text-muted">Dernier punch: {formatDateTime(summary.lastEventAt)}</div>
                    <div className="ui-text-muted">
                      {summary.anomalies.length === 0 ? "Aucune anomalie." : summary.anomalies.join(" | ")}
                    </div>
                  </AppCard>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <FilterBar subtitle="Historique complet du jour.">
          <FormField label="Date">
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="tagora-input" />
          </FormField>
          <FormField label="Employe">
            <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} className="tagora-input">
              <option value="">Tous les employes</option>
              {employees.map((employee) => (
                <option key={employee.user_id} value={employee.user_id}>
                  {employee.label}
                </option>
              ))}
            </select>
          </FormField>
        </FilterBar>

        <SectionCard title="Historique du jour" subtitle="Audit complet, employe et admin distingues.">
          {filteredEvents.length === 0 ? (
            <AppCard tone="muted">
              <p className="ui-text-muted" style={{ margin: 0 }}>Aucun evenement horodateur pour cette selection.</p>
            </AppCard>
          ) : (
            <div className="ui-stack-sm">
              {filteredEvents.map((event) => {
                const employeeLabel =
                  employees.find((item) => item.user_id === event.user_id)?.label ||
                  String(event.metadata?.user_email ?? `Employe ${event.user_id.slice(0, 8)}`);

                return (
                  <AppCard key={event.id} className="ui-stack-xs" tone="muted">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong style={{ color: "var(--ui-color-primary)" }}>
                        {getHorodateurEventLabel(event.event_type)}
                      </strong>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <StatusBadge
                          label={getHorodateurActorLabel(event.entered_by_admin)}
                          tone={event.entered_by_admin ? "success" : "default"}
                        />
                        <span className="ui-text-muted">{formatDateTime(event.occurred_at)}</span>
                      </div>
                    </div>
                    <div className="ui-text-muted">Employe: {employeeLabel}</div>
                    <div className="ui-text-muted">
                      Compagnie: {event.company_context ? getCompanyLabel(event.company_context) : "-"} | Source: {event.source_module}
                    </div>
                    <div className="ui-text-muted">
                      Note: {event.admin_note || event.notes || "-"}
                    </div>
                    <div className="ui-text-muted">
                      Cree le {formatDateTime(event.created_at)}{event.entered_by_user_id ? ` par admin ${event.entered_by_user_id.slice(0, 8)}...` : ""}
                    </div>
                  </AppCard>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
