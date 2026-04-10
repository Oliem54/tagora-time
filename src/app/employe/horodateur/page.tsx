"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getCompanyLabel, type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  buildHorodateurLoadError,
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

type PunchState = "hors_quart" | "en_quart" | "en_pause" | "en_sortie" | "termine";

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

function diffMinutes(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, Math.floor((b - a) / 60000));
}

function formatMinutes(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function getEventLabel(type: EventType) {
  if (type === "quart_debut") return "Debut du quart";
  if (type === "pause_debut") return "Debut pause";
  if (type === "pause_fin") return "Fin pause";
  if (type === "sortie_depart") return "Depart sortie";
  if (type === "sortie_retour") return "Retour sortie";
  if (type === "quart_fin") return "Fin du quart";
  return "Anomalie";
}

function computeState(events: HorodateurEvent[]) {
  let state: PunchState = "hors_quart";

  for (const event of events) {
    if (event.event_type === "quart_debut") {
      state = "en_quart";
      continue;
    }

    if (event.event_type === "pause_debut" && state === "en_quart") {
      state = "en_pause";
      continue;
    }

    if (event.event_type === "pause_fin" && state === "en_pause") {
      state = "en_quart";
      continue;
    }

    if (event.event_type === "sortie_depart" && state === "en_quart") {
      state = "en_sortie";
      continue;
    }

    if (event.event_type === "sortie_retour" && state === "en_sortie") {
      state = "en_quart";
      continue;
    }

    if (event.event_type === "quart_fin") {
      state = "termine";
    }
  }

  return state;
}

function computeWorkedMinutes(events: HorodateurEvent[]) {
  const nowIso = new Date().toISOString();
  let startedAt: string | null = null;
  let pauseStartedAt: string | null = null;
  let total = 0;

  for (const event of events) {
    if (event.event_type === "quart_debut" && !startedAt) {
      startedAt = event.occurred_at;
      continue;
    }

    if (event.event_type === "pause_debut" && startedAt && !pauseStartedAt) {
      total += diffMinutes(startedAt, event.occurred_at);
      startedAt = null;
      pauseStartedAt = event.occurred_at;
      continue;
    }

    if (event.event_type === "pause_fin" && pauseStartedAt) {
      pauseStartedAt = null;
      startedAt = event.occurred_at;
      continue;
    }

    if (event.event_type === "quart_fin") {
      if (startedAt) {
        total += diffMinutes(startedAt, event.occurred_at);
      }
      startedAt = null;
      pauseStartedAt = null;
    }
  }

  if (startedAt) {
    total += diffMinutes(startedAt, nowIso);
  }

  return total;
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

  const [selectedDossierId, setSelectedDossierId] = useState("");
  const [selectedLivraisonId, setSelectedLivraisonId] = useState("");
  const [sortieNotes, setSortieNotes] = useState("");
  const [companyContext, setCompanyContext] = useState<AccountRequestCompany | "">("");
  const resolvedCompanyContext =
    companyContext || companyAccess.primaryCompany || "";

  const state = useMemo(() => computeState(events), [events]);
  const lastEvent = useMemo(() => (events.length > 0 ? events[events.length - 1] : null), [events]);
  const workedMinutes = useMemo(() => computeWorkedMinutes(events), [events]);
  const anomalies = useMemo(() => {
    const next: string[] = [];

    if (state === "en_quart") {
      next.push("Quart en cours sans fin de quart pour l instant.");
    }

    if (state === "en_pause") {
      next.push("Pause en cours: fin de pause attendue.");
    }

    if (state === "en_sortie") {
      next.push("Sortie en cours: retour sortie attendu.");
    }

    return next;
  }, [state]);

  async function loadEvents(userId: string) {
    const { data, error } = await supabase
      .from("horodateur_events")
      .select("id, user_id, event_type, occurred_at, source_module, livraison_id, dossier_id, sortie_id, notes, company_context, metadata")
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

      await Promise.all([loadEvents(user.id), loadContext()]);
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
          ...(canUseTerrain ? ["sortie_depart"] : []),
          "quart_fin",
        ].includes(action)) ||
      (state === "en_pause" && action === "pause_fin") ||
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
    state === "hors_quart"
      ? "Hors quart"
      : state === "en_quart"
        ? "En quart"
        : state === "en_pause"
          ? "En pause"
          : state === "en_sortie"
            ? "En sortie"
            : "Quart termine";

  if (accessLoading || loading) {
    return (
      <main className="page-container">
        <HeaderTagora title="Horodateur" subtitle="Pointage du quart, pauses et sorties" />
        <AccessNotice description="Chargement de votre etat de pointage et des evenements du jour." />
      </main>
    );
  }

  return (
    <main className="page-container">
      <HeaderTagora title="Horodateur" subtitle="Pointage du quart, pauses et sorties" />

      {feedback ? <AccessNotice title="Attention" description={feedback} /> : null}

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Statut courant</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: "#0f2948" }}>{statusLabel}</div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Derniere action</div>
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700 }}>{lastEvent ? getEventLabel(lastEvent.event_type) : "Aucune"}</div>
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
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Actions rapides</h2>
        <p className="tagora-note" style={{ marginBottom: 16 }}>
          Les actions s adaptent automatiquement a votre etat courant pour eviter les erreurs de sequence.
        </p>

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
            {saving ? "Enregistrement..." : "Debut du quart"}
          </button>
        )}

        {state === "en_quart" && (
          <div className="actions-row">
            <button className="tagora-dark-action" onClick={() => void handleAction("pause_debut")} disabled={saving}>
              Debut pause
            </button>
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

        {state === "en_sortie" && (
          <button className="tagora-dark-action" onClick={() => void handleAction("sortie_retour")} disabled={saving}>
            Retour sortie
          </button>
        )}

        {state === "termine" && (
          <AccessNotice title="Quart termine" description="Le quart est clos pour aujourd hui. Un nouveau quart pourra etre demarre au prochain cycle." />
        )}

        {state === "en_quart" && canUseTerrain ? (
          <div className="tagora-panel-muted" style={{ marginTop: 16 }}>
            <h3 className="section-title" style={{ fontSize: 18, marginBottom: 10 }}>Contexte sortie (optionnel)</h3>
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
                <span className="tagora-label">Notes sortie</span>
                <textarea className="tagora-textarea" value={sortieNotes} onChange={(e) => setSortieNotes(e.target.value)} />
              </label>
            </div>
          </div>
        ) : null}

        {state === "en_quart" && !canUseTerrain ? (
          <p className="tagora-note" style={{ marginTop: 16 }}>
            Les sorties terrain sont masquees sur ce compte. Le pointage quart et pause reste disponible.
          </p>
        ) : null}
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Anomalies V1</h2>
        {anomalies.length === 0 ? (
          <p className="tagora-note">Aucune anomalie detectee pour le moment.</p>
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
          <p className="tagora-note">Aucun evenement aujourd hui.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>Heure</th>
                  <th style={thStyle}>Evenement</th>
                  <th style={thStyle}>Contexte</th>
                  <th style={thStyle}>Note</th>
                </tr>
              </thead>
              <tbody>
                {[...events].reverse().map((event) => (
                  <tr key={event.id}>
                    <td style={tdStyle}>{formatDateTime(event.occurred_at)}</td>
                    <td style={tdStyle}>{getEventLabel(event.event_type)}</td>
                    <td style={tdStyle}>
                      {event.company_context ? `${getCompanyLabel(event.company_context)} / ` : ""}
                      {event.livraison_id ? `Livraison #${event.livraison_id}` : "-"}
                      {event.dossier_id ? ` / Dossier #${event.dossier_id}` : ""}
                      {event.sortie_id ? ` / Sortie #${event.sortie_id}` : ""}
                    </td>
                    <td style={tdStyle}>{event.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="actions-row" style={{ marginTop: 24 }}>
        <button className="tagora-dark-outline-action" onClick={() => router.push("/employe/dashboard")}>Retour au dashboard</button>
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
