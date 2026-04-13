"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getCompanyLabel, type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  buildHorodateurLoadError,
  computeHorodateurState,
  computeWorkedMinutes,
  getHorodateurActorLabel,
  getHorodateurEventLabel,
  getHorodateurStateLabel,
  HorodateurEventType,
} from "@/app/lib/horodateur";
import { supabase } from "@/app/lib/supabase/client";

type EventType = HorodateurEventType;

type HorodateurEvent = {
  id: string;
  user_id: string;
  event_type: EventType;
  occurred_at: string;
  source_module: string;
  livraison_id: number | null;
  dossier_id: number | null;
  sortie_id: number | null;
  notes: string | null;
  company_context: AccountRequestCompany | null;
  metadata: Record<string, unknown>;
  entered_by_admin: boolean;
  entered_by_user_id: string | null;
  admin_note: string | null;
  created_at: string;
};

type DossierOption = {
  id: number;
  nom: string | null;
  client: string | null;
};

type LivraisonOption = {
  id: number;
  date_livraison: string | null;
  heure_prevue: string | null;
  client: string | null;
  dossier_id: number | null;
};

type PunchState = "hors_quart" | "en_quart" | "en_pause" | "en_diner" | "en_sortie" | "termine";
type BreakConfig = {
  expected_breaks_count: number | null;
  break_1_label: string | null;
  break_1_minutes: number | null;
  break_1_paid: boolean | null;
  break_2_label: string | null;
  break_2_minutes: number | null;
  break_2_paid: boolean | null;
  break_3_label: string | null;
  break_3_minutes: number | null;
  break_3_paid: boolean | null;
  lunch_enabled: boolean | null;
  lunch_time: string | null;
  lunch_minutes: number | null;
  lunch_paid: boolean | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-CA");
}

function startOfTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T00:00:00`;
}

function formatMinutes(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function EmployeHorodateurPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission, companyAccess } =
    useCurrentAccess();
  const canUseTerrain = hasPermission("terrain");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<HorodateurEvent[]>([]);
  const [feedback, setFeedback] = useState("");
  const [dossiers, setDossiers] = useState<DossierOption[]>([]);
  const [livraisons, setLivraisons] = useState<LivraisonOption[]>([]);
  const [breakConfig, setBreakConfig] = useState<BreakConfig | null>(null);

  const [selectedDossierId, setSelectedDossierId] = useState("");
  const [selectedLivraisonId, setSelectedLivraisonId] = useState("");
  const [sortieNotes, setSortieNotes] = useState("");
  const [companyContext, setCompanyContext] = useState<AccountRequestCompany | "">("");
  const resolvedCompanyContext =
    companyContext || companyAccess.primaryCompany || "";

  const state = useMemo(() => computeHorodateurState(events) as PunchState, [events]);
  const lastEvent = useMemo(() => (events.length > 0 ? events[events.length - 1] : null), [events]);
  const workedMinutes = useMemo(() => computeWorkedMinutes(events), [events]);
  const lunchConfig = useMemo(
    () => ({
      enabled:
        breakConfig?.lunch_enabled ??
        Boolean((breakConfig?.break_2_minutes ?? 0) > 0),
      minutes:
        breakConfig?.lunch_minutes ?? breakConfig?.break_2_minutes ?? 0,
      paid:
        breakConfig?.lunch_paid ?? breakConfig?.break_2_paid ?? false,
    }),
    [breakConfig]
  );
  const configuredBreaks = useMemo(
    () =>
      breakConfig
        ? [
            {
              label: breakConfig.break_1_label || "Pause 1",
              minutes: breakConfig.break_1_minutes ?? 0,
              paid: breakConfig.break_1_paid ?? true,
            },
            {
              label: breakConfig.break_3_label || "Pause 3",
              minutes: breakConfig.break_3_minutes ?? 0,
              paid: breakConfig.break_3_paid ?? true,
            },
          ].filter((item) => item.minutes > 0)
        : [],
    [breakConfig]
  );
  const totalConfiguredBreakMinutes = useMemo(
    () => configuredBreaks.reduce((sum, item) => sum + item.minutes, 0) + lunchConfig.minutes,
    [configuredBreaks, lunchConfig.minutes]
  );
  const totalConfiguredUnpaidBreakMinutes = useMemo(
    () =>
      configuredBreaks.reduce(
        (sum, item) => sum + (!item.paid ? item.minutes : 0),
        0
      ) + (!lunchConfig.paid ? lunchConfig.minutes : 0),
    [configuredBreaks, lunchConfig.minutes, lunchConfig.paid]
  );
  const pauseCountToday = useMemo(
    () => events.filter((event) => event.event_type === "pause_debut").length,
    [events]
  );
  const anomalies = useMemo(() => {
    const next: string[] = [];

    if (state === "en_quart") {
      next.push("Quart en cours sans fin de quart pour l instant.");
    }

    if (state === "en_pause") {
      next.push("Pause en cours: fin de pause attendue.");
    }

    if (state === "en_diner") {
      next.push("Diner en cours: fin de diner attendue.");
    }

    if (state === "en_sortie") {
      next.push("Sortie en cours: retour sortie attendu.");
    }

    if (
      breakConfig?.expected_breaks_count != null &&
      breakConfig.expected_breaks_count > 0 &&
      pauseCountToday > breakConfig.expected_breaks_count
    ) {
      next.push("Nombre de pauses autorise depasse.");
    }

    return next;
  }, [breakConfig, pauseCountToday, state]);

  async function loadEvents(userId: string) {
    const { data, error } = await supabase
      .from("horodateur_events")
      .select("id, user_id, event_type, occurred_at, source_module, livraison_id, dossier_id, sortie_id, notes, company_context, metadata, entered_by_admin, entered_by_user_id, admin_note, created_at")
      .eq("user_id", userId)
      .gte("occurred_at", startOfTodayIso())
      .order("occurred_at", { ascending: true });

    if (error) {
      setEvents([]);
      setFeedback(buildHorodateurLoadError(error, "employe"));
      return;
    }

    setEvents((data ?? []) as HorodateurEvent[]);
  }

  useEffect(() => {
    async function init() {
      if (accessLoading) return;
      if (!user) {
        router.push("/employe/login");
        return;
      }

      setLoading(true);
      setFeedback("");

      const loadContext = async () => {
        if (!canUseTerrain) {
          setDossiers([]);
          setLivraisons([]);
          return;
        }

        const [{ data: dossiersData }, { data: livraisonsData }] = await Promise.all([
          supabase.from("dossiers").select("id, nom, client").eq("user_id", user.id).order("id", { ascending: false }).limit(50),
          supabase
            .from("livraisons_planifiees")
            .select("id, date_livraison, heure_prevue, client, dossier_id")
            .gte("date_livraison", new Date().toISOString().slice(0, 10))
            .order("date_livraison", { ascending: true })
            .limit(30),
        ]);

        setDossiers((dossiersData ?? []) as DossierOption[]);
        setLivraisons((livraisonsData ?? []) as LivraisonOption[]);
      };
      const loadBreakConfig = async () => {
        const chauffeurId = Number(
          user.app_metadata?.chauffeur_id ?? user.user_metadata?.chauffeur_id ?? NaN
        );

        if (!Number.isFinite(chauffeurId)) {
          setBreakConfig(null);
          return;
        }

        const { data } = await supabase
          .from("chauffeurs")
          .select(
            "expected_breaks_count, break_1_label, break_1_minutes, break_1_paid, break_2_label, break_2_minutes, break_2_paid, break_3_label, break_3_minutes, break_3_paid, lunch_enabled, lunch_time, lunch_minutes, lunch_paid"
          )
          .eq("id", chauffeurId)
          .maybeSingle<BreakConfig>();

        setBreakConfig(data ?? null);
      };

      await Promise.all([loadEvents(user.id), loadContext(), loadBreakConfig()]);
      setLoading(false);
    }

    void init();
  }, [accessLoading, canUseTerrain, router, user]);

  async function insertHorodateurEvent(
    userId: string,
    eventType: EventType,
    options?: {
      notes?: string;
      dossierId?: number | null;
      livraisonId?: number | null;
      sortieId?: number | null;
      metadata?: Record<string, unknown>;
      sourceModule?: string;
      companyContext?: AccountRequestCompany | null;
    }
  ) {
    const { error } = await supabase.from("horodateur_events").insert([
      {
        user_id: userId,
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        source_module: options?.sourceModule ?? "horodateur",
        dossier_id: options?.dossierId ?? null,
        livraison_id: options?.livraisonId ?? null,
        sortie_id: options?.sortieId ?? null,
        notes: options?.notes ?? null,
        company_context:
          options?.companyContext ??
          (resolvedCompanyContext ? resolvedCompanyContext : null),
        metadata: options?.metadata ?? {},
        entered_by_admin: false,
        entered_by_user_id: null,
        admin_note: null,
      },
    ]);

    return error;
  }

  async function logAnomaly(userId: string, message: string) {
    await insertHorodateurEvent(userId, "anomalie", {
      notes: message,
      metadata: { level: "warning" },
    });
  }

  async function handleAction(action: EventType) {
    if (!user) {
      router.push("/employe/login");
      return;
    }

    if (!resolvedCompanyContext) {
      setFeedback("Choisissez une compagnie avant d enregistrer un pointage.");
      return;
    }

    const allowed =
      (state === "hors_quart" && action === "quart_debut") ||
      (state === "en_quart" &&
        [
          "pause_debut",
          "dinner_debut",
          ...(canUseTerrain ? ["sortie_depart"] : []),
          "quart_fin",
        ].includes(action)) ||
      (state === "en_pause" && action === "pause_fin") ||
      (state === "en_diner" && action === "dinner_fin") ||
      (state === "en_sortie" && action === "sortie_retour");

    if (!allowed) {
      const msg = "Action impossible selon votre etat courant.";
      setFeedback(msg);
      await logAnomaly(user.id, msg);
      await loadEvents(user.id);
      return;
    }

    setSaving(true);
    setFeedback("");

    if (
      action === "pause_debut" &&
      breakConfig?.expected_breaks_count != null &&
      breakConfig.expected_breaks_count > 0 &&
      pauseCountToday >= breakConfig.expected_breaks_count
    ) {
      await logAnomaly(user.id, "Nombre de pauses autorise depasse.");
    }

    if (action === "sortie_depart") {
      const dossierId = selectedDossierId ? Number(selectedDossierId) : null;
      const livraisonId = selectedLivraisonId ? Number(selectedLivraisonId) : null;
      const dossier = dossierId ? dossiers.find((d) => d.id === dossierId) : null;

      const { data: sortieData, error: sortieInsertError } = await supabase
        .from("sorties_terrain")
        .insert([
          {
            user_id: user.id,
            dossier_id: dossierId,
            dossier: dossier?.nom || null,
            livraison_id: livraisonId,
            company_context: resolvedCompanyContext || null,
            date_sortie: new Date().toISOString().slice(0, 10),
            heure_depart: new Date().toISOString(),
            statut: "en_cours",
            notes: sortieNotes.trim() || null,
          },
        ])
        .select("id")
        .single();

      if (sortieInsertError) {
        setFeedback("Impossible de demarrer la sortie terrain.");
        setSaving(false);
        return;
      }

      const insertError = await insertHorodateurEvent(user.id, "sortie_depart", {
        dossierId,
        livraisonId,
        sortieId: Number(sortieData.id),
        notes: sortieNotes.trim() || undefined,
        metadata: { user_email: user.email ?? null },
        companyContext: resolvedCompanyContext || null,
      });

      if (insertError) {
        setFeedback("Sortie demarree mais evenement horodateur non enregistre.");
      }

      setSelectedDossierId("");
      setSelectedLivraisonId("");
      setSortieNotes("");
      await loadEvents(user.id);
      setSaving(false);
      return;
    }

    if (action === "sortie_retour") {
      const { data: activeSortie, error: activeSortieError } = await supabase
        .from("sorties_terrain")
        .select("id, heure_depart, livraison_id, dossier_id")
        .eq("user_id", user.id)
        .eq("statut", "en_cours")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSortieError || !activeSortie) {
        const msg = "Aucune sortie en cours a cloturer.";
        setFeedback(msg);
        await logAnomaly(user.id, msg);
        await loadEvents(user.id);
        setSaving(false);
        return;
      }

      const nowIso = new Date().toISOString();
      const startMs = activeSortie.heure_depart ? new Date(activeSortie.heure_depart).getTime() : Date.now();
      const diffMin = Math.max(0, Math.floor((Date.now() - startMs) / 60000));
      const totalText = `${Math.floor(diffMin / 60)}h ${String(diffMin % 60).padStart(2, "0")}m`;

      const { error: sortieUpdateError } = await supabase
        .from("sorties_terrain")
        .update({
          heure_retour: nowIso,
          temps_total: totalText,
          statut: "terminee",
        })
        .eq("id", activeSortie.id)
        .eq("user_id", user.id);

      if (sortieUpdateError) {
        setFeedback("Impossible de terminer la sortie terrain.");
        setSaving(false);
        return;
      }

      const insertError = await insertHorodateurEvent(user.id, "sortie_retour", {
        dossierId: activeSortie.dossier_id,
        livraisonId: activeSortie.livraison_id,
        sortieId: Number(activeSortie.id),
        metadata: { user_email: user.email ?? null },
        companyContext: resolvedCompanyContext || null,
      });

      if (insertError) {
        setFeedback("Sortie terminee mais evenement horodateur non enregistre.");
      }

      await loadEvents(user.id);
      setSaving(false);
      return;
    }

    const insertError = await insertHorodateurEvent(user.id, action, {
      metadata: { user_email: user.email ?? null },
      companyContext: resolvedCompanyContext || null,
    });

    if (insertError) {
      setFeedback("Impossible d enregistrer cette action horodateur.");
      setSaving(false);
      return;
    }

    await loadEvents(user.id);
    setSaving(false);
  }

  const statusLabel =
    getHorodateurStateLabel(state);

  if (accessLoading || loading) {
    return (
      <main className="page-container">
        <HeaderTagora title="Horodateur" subtitle="Pointage" />
        <AccessNotice description="Chargement en cours." />
      </main>
    );
  }

  return (
    <main className="page-container">
      <HeaderTagora title="Horodateur" subtitle="Pointage" />

      {feedback ? <AccessNotice title="Attention" description={feedback} /> : null}

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Statut courant</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: "#0f2948" }}>{statusLabel}</div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Derniere action</div>
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700 }}>{lastEvent ? getHorodateurEventLabel(lastEvent.event_type) : "Aucune"}</div>
            <div className="tagora-note" style={{ marginTop: 4 }}>{formatDateTime(lastEvent?.occurred_at)}</div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Temps travaille aujourd hui</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: "#0f2948" }}>{formatMinutes(workedMinutes)}</div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Compagnie active</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: "#0f2948" }}>
              {resolvedCompanyContext
                ? getCompanyLabel(resolvedCompanyContext)
                : "Choisir une compagnie"}
            </div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Pauses autorisees</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: "#0f2948" }}>
              {breakConfig?.expected_breaks_count ?? 0}
            </div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Pauses non payees prevues</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: "#0f2948" }}>
              {totalConfiguredUnpaidBreakMinutes} min
            </div>
          </div>
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Pauses autorisees</h2>
        {configuredBreaks.length === 0 ? (
          <p className="tagora-note">Aucune pause configuree.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {configuredBreaks.map((item) => (
              <div key={`${item.label}-${item.minutes}-${item.paid ? "paid" : "unpaid"}`} className="tagora-panel-muted">
                <div className="tagora-label">{item.label}</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: "#0f2948" }}>
                  {item.minutes} min
                </div>
                <div className="tagora-note" style={{ marginTop: 6 }}>
                  {item.paid ? "Payee" : "Non payee"}
                </div>
              </div>
            ))}
            {lunchConfig.enabled ? (
              <div className="tagora-panel-muted">
                <div className="tagora-label">Diner</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: "#0f2948" }}>
                  {lunchConfig.minutes} min
                </div>
                <div className="tagora-note" style={{ marginTop: 6 }}>
                  {lunchConfig.paid ? "Paye" : "Non paye"}
                </div>
              </div>
            ) : null}
            <div className="tagora-panel-muted">
              <div className="tagora-label">Total theorique</div>
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: "#0f2948" }}>
                {totalConfiguredBreakMinutes} min
              </div>
              <div className="tagora-note" style={{ marginTop: 6 }}>
                Non paye: {totalConfiguredUnpaidBreakMinutes} min
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Actions</h2>

        <div className="tagora-panel-muted" style={{ marginBottom: 16 }}>
          <label className="tagora-field" style={{ marginBottom: 0 }}>
            <span className="tagora-label">Contexte compagnie</span>
            <select
              className="tagora-input"
              value={resolvedCompanyContext}
              onChange={(e) =>
                setCompanyContext(e.target.value as AccountRequestCompany | "")
              }
            >
              <option value="">Choisir une compagnie</option>
              {companyAccess.allowedCompanies.map((company) => (
                <option key={company} value={company}>
                  {getCompanyLabel(company)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {state === "hors_quart" && (
          <button className="tagora-dark-action" onClick={() => void handleAction("quart_debut")} disabled={saving}>
            {saving ? "Debut du quart..." : "Debut du quart"}
          </button>
        )}

        {state === "en_quart" && (
          <div className="actions-row">
            <button className="tagora-dark-action" onClick={() => void handleAction("pause_debut")} disabled={saving}>
              Debut pause
            </button>
            {lunchConfig.enabled ? (
              <button className="tagora-dark-outline-action" onClick={() => void handleAction("dinner_debut")} disabled={saving}>
                Debut diner
              </button>
            ) : null}
            {canUseTerrain ? (
              <button className="tagora-navy-action" onClick={() => void handleAction("sortie_depart")} disabled={saving}>
                Depart sortie
              </button>
            ) : null}
            <button className="tagora-dark-outline-action" onClick={() => void handleAction("quart_fin")} disabled={saving}>
              Fin du quart
            </button>
          </div>
        )}

        {state === "en_pause" && (
          <button className="tagora-dark-action" onClick={() => void handleAction("pause_fin")} disabled={saving}>
            Fin pause
          </button>
        )}

        {state === "en_diner" && (
          <button className="tagora-dark-action" onClick={() => void handleAction("dinner_fin")} disabled={saving}>
            Fin diner
          </button>
        )}

        {state === "en_sortie" && (
          <button className="tagora-dark-action" onClick={() => void handleAction("sortie_retour")} disabled={saving}>
            Retour sortie
          </button>
        )}

        {state === "termine" && (
          <AccessNotice title="Quart termine" description="Aucun pointage possible." />
        )}

        {state === "en_quart" && canUseTerrain ? (
          <div className="tagora-panel-muted" style={{ marginTop: 16 }}>
            <h3 className="section-title" style={{ fontSize: 18, marginBottom: 10 }}>Contexte sortie</h3>
            <div className="tagora-form-grid">
              <label className="tagora-field">
                <span className="tagora-label">Livraison liee</span>
                <select className="tagora-input" value={selectedLivraisonId} onChange={(e) => setSelectedLivraisonId(e.target.value)}>
                  <option value="">Aucune livraison</option>
                  {livraisons.map((item) => (
                    <option key={item.id} value={item.id}>
                      #{item.id} - {item.client || "Sans client"} - {item.date_livraison || "-"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tagora-field">
                <span className="tagora-label">Dossier lie</span>
                <select className="tagora-input" value={selectedDossierId} onChange={(e) => setSelectedDossierId(e.target.value)}>
                  <option value="">Aucun dossier</option>
                  {dossiers.map((item) => (
                    <option key={item.id} value={item.id}>
                      #{item.id} - {item.nom || "Sans nom"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Notes</span>
                <textarea className="tagora-textarea" value={sortieNotes} onChange={(e) => setSortieNotes(e.target.value)} />
              </label>
            </div>
          </div>
        ) : null}

        {state === "en_quart" && !canUseTerrain ? (
          <p className="tagora-note" style={{ marginTop: 16 }}>
            Sorties masquees.
          </p>
        ) : null}
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Anomalies V1</h2>
        {anomalies.length === 0 ? (
          <p className="tagora-note">Aucune anomalie.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {anomalies.map((item) => (
              <li key={item} className="tagora-note" style={{ marginBottom: 6 }}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Historique du jour</h2>
        {events.length === 0 ? (
          <p className="tagora-note">Aucun evenement.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>Heure</th>
                  <th style={thStyle}>Saisie</th>
                  <th style={thStyle}>Evenement</th>
                  <th style={thStyle}>Contexte</th>
                  <th style={thStyle}>Note</th>
                </tr>
              </thead>
              <tbody>
                {[...events].reverse().map((event) => (
                  <tr key={event.id}>
                    <td style={tdStyle}>{formatDateTime(event.occurred_at)}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          background: event.entered_by_admin ? "#e0f2fe" : "#eef2ff",
                          color: event.entered_by_admin ? "#0c4a6e" : "#3730a3",
                        }}
                      >
                        {getHorodateurActorLabel(event.entered_by_admin)}
                      </span>
                    </td>
                    <td style={tdStyle}>{getHorodateurEventLabel(event.event_type)}</td>
                    <td style={tdStyle}>
                      {event.company_context ? `${getCompanyLabel(event.company_context)} / ` : ""}
                      {event.livraison_id ? `Livraison #${event.livraison_id}` : "-"}
                      {event.dossier_id ? ` / Dossier #${event.dossier_id}` : ""}
                      {event.sortie_id ? ` / Sortie #${event.sortie_id}` : ""}
                    </td>
                    <td style={tdStyle}>{event.admin_note || event.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="actions-row" style={{ marginTop: 24 }}>
        <button className="tagora-dark-outline-action" onClick={() => router.push("/employe/dashboard")}>Retour</button>
      </div>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#64748b",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#0f172a",
};
