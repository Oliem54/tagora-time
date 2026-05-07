"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderTagora from "../../components/HeaderTagora";
import AccessNotice from "../../components/AccessNotice";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { supabase } from "../../lib/supabase/client";
import { useCurrentAccess } from "../../hooks/useCurrentAccess";
import { useEmployeeGpsReporting } from "../../hooks/useEmployeeGpsReporting";
import {
  buildBreakEntries,
  computeWorkTimeSummary,
} from "../../lib/work-time";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "../../lib/account-requests.shared";

type SortieTerrain = {
  id: number;
  compagnie: string | null;
  company_context?: AccountRequestCompany | null;
  client: string | null;
  dossier: string | null;
  dossier_id: number | null;
  vehicule: string | null;
  km_depart: number | null;
  km_arrivee: number | null;
  heure_depart: string | null;
  heure_retour: string | null;
  temps_total: string | null;
  morning_break_minutes: number | null;
  morning_break_paid: boolean | null;
  lunch_minutes: number | null;
  lunch_paid: boolean | null;
  afternoon_break_minutes: number | null;
  afternoon_break_paid: boolean | null;
  paid_break_minutes: number | null;
  unpaid_break_minutes: number | null;
  payable_minutes: number | null;
  facturable_minutes: number | null;
  temps_payable: string | null;
  temps_non_payable: string | null;
  temps_facturable: string | null;
  refacturer_a_titan?: boolean | null;
  notes: string | null;
  statut: string | null;
};

type DossierOption = {
  id: number;
  nom: string | null;
  client: string | null;
};

function formatDateTime(dateString: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("fr-CA");
}

function calculerTempsTotal(departIso: string, retourIso: string) {
  const depart = new Date(departIso).getTime();
  const retour = new Date(retourIso).getTime();
  const diffMs = retour - depart;

  if (diffMs <= 0) return "0 min";

  const totalMinutes = Math.floor(diffMs / 1000 / 60);
  const heures = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return heures > 0 ? `${heures}h ${minutes}min` : `${minutes} min`;
}

export default function TerrainPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission, companyAccess } =
    useCurrentAccess();
  const userId = user?.id ?? null;
  const canUseTerrain = hasPermission("terrain");

  const [companyContext, setCompanyContext] = useState<AccountRequestCompany | "">("");
  const [client, setClient] = useState("");
  const [dossierId, setDossierId] = useState("");
  const [vehicule, setVehicule] = useState("");
  const [kmDepart, setKmDepart] = useState("");
  const [kmArrivee, setKmArrivee] = useState("");
  const [pauseMatinMinutes, setPauseMatinMinutes] = useState("0");
  const [pauseMatinPaid, setPauseMatinPaid] = useState(true);
  const [dinerMinutes, setDinerMinutes] = useState("0");
  const [dinerPaid, setDinerPaid] = useState(false);
  const [pauseApresMidiMinutes, setPauseApresMidiMinutes] = useState("0");
  const [pauseApresMidiPaid, setPauseApresMidiPaid] = useState(true);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortieActive, setSortieActive] = useState<SortieTerrain | null>(null);
  const [historique, setHistorique] = useState<SortieTerrain[]>([]);
  const [dossiers, setDossiers] = useState<DossierOption[]>([]);
  const [feedback, setFeedback] = useState("");
  const [secondaryNotice, setSecondaryNotice] = useState("");
  const resolvedCompanyContext =
    companyContext || companyAccess.primaryCompany || "";
  const gpsCompanyContext: AccountRequestCompany | null =
    resolvedCompanyContext === "oliem_solutions" ||
    resolvedCompanyContext === "titan_produits_industriels"
      ? resolvedCompanyContext
      : null;
  const gpsReport = useEmployeeGpsReporting({
    enabled: Boolean(userId && canUseTerrain && !accessLoading),
    companyContext: gpsCompanyContext,
    pageSource: "employe_terrain",
  });
  const activeBreaks = useMemo(
    () =>
      buildBreakEntries({
        morningMinutes: pauseMatinMinutes,
        morningPaid: pauseMatinPaid,
        lunchMinutes: dinerMinutes,
        lunchPaid: dinerPaid,
        afternoonMinutes: pauseApresMidiMinutes,
        afternoonPaid: pauseApresMidiPaid,
      }),
    [
      dinerMinutes,
      dinerPaid,
      pauseApresMidiMinutes,
      pauseApresMidiPaid,
      pauseMatinMinutes,
      pauseMatinPaid,
    ]
  );
  const activeSummaryPreview = useMemo(
    () =>
      sortieActive
        ? computeWorkTimeSummary({
            start: sortieActive.heure_depart,
            end: new Date().toISOString(),
            breaks: activeBreaks,
            billable: sortieActive.refacturer_a_titan ?? false,
          })
        : null,
    [activeBreaks, sortieActive]
  );

  function resetBreakFields() {
    setPauseMatinMinutes("0");
    setPauseMatinPaid(true);
    setDinerMinutes("0");
    setDinerPaid(false);
    setPauseApresMidiMinutes("0");
    setPauseApresMidiPaid(true);
  }

  const getNomDossier = (id: number | null) => {
    if (!id) return "-";
    const dossier = dossiers.find((item) => item.id === id);
    return dossier?.nom || `Dossier #${id}`;
  };

  async function chargerSorties(userId: string) {
    const { data, error } = await supabase
      .from("sorties_terrain")
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (error) {
      setFeedback(
        "Sorties indisponibles."
      );
      setSortieActive(null);
      setHistorique([]);
      return;
    }

    const sorties = (data || []) as SortieTerrain[];
    setSortieActive(sorties.find((item) => item.statut === "en_cours") || null);
    setHistorique(sorties.filter((item) => item.statut !== "en_cours").slice(0, 10));
  }

  async function chargerDossiers(userId: string) {
    const { data, error } = await supabase
      .from("dossiers")
      .select("id, nom, client")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (error) {
      setDossiers([]);
      setSecondaryNotice(
        "Dossiers indisponibles."
      );
      return;
    }

    const dossiersFiltres = (data || []).filter(
      (item) => item.nom?.trim() || item.client?.trim()
    ) as DossierOption[];

    setDossiers(dossiersFiltres);
    setSecondaryNotice("");
  }

  useEffect(() => {
    async function init() {
      if (accessLoading) return;

      if (!userId) {
        router.push("/employe/login");
        return;
      }

      if (!canUseTerrain) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setFeedback("");
      await Promise.all([chargerSorties(userId), chargerDossiers(userId)]);
      setLoading(false);
    }

    void init();
  }, [accessLoading, canUseTerrain, router, userId]);

  useEffect(() => {
    if (!sortieActive) {
      return;
    }

    startTransition(() => {
      setPauseMatinMinutes(String(sortieActive.morning_break_minutes ?? 0));
      setPauseMatinPaid(sortieActive.morning_break_paid ?? true);
      setDinerMinutes(String(sortieActive.lunch_minutes ?? 0));
      setDinerPaid(sortieActive.lunch_paid ?? false);
      setPauseApresMidiMinutes(String(sortieActive.afternoon_break_minutes ?? 0));
      setPauseApresMidiPaid(sortieActive.afternoon_break_paid ?? true);
      setNotes(sortieActive.notes ?? "");
    });
  }, [sortieActive]);

  const handleChoixDossier = (value: string) => {
    setDossierId(value);

    const id = Number(value);
    if (!id) return;

    const dossierChoisi = dossiers.find((item) => item.id === id);
    if (!dossierChoisi) return;

    if (!client && dossierChoisi.client) {
      setClient(dossierChoisi.client);
    }
  };

  const handleDemarrer = async () => {
    if (!user) {
      router.push("/employe/login");
      return;
    }

    if (!resolvedCompanyContext) {
      setFeedback("Compagnie requise.");
      return;
    }

    if (!client.trim()) {
      setFeedback("Client requis.");
      return;
    }

    if (!vehicule.trim()) {
      setFeedback("Vehicule requis.");
      return;
    }

    if (!kmDepart.trim()) {
      setFeedback("KM depart requis.");
      return;
    }

    const kmDepartNumber = Number(kmDepart);
    if (Number.isNaN(kmDepartNumber)) {
      setFeedback("KM depart invalide.");
      return;
    }

    const dossierIdNumber = dossierId ? Number(dossierId) : null;
    const dossierNom = dossierIdNumber ? getNomDossier(dossierIdNumber) : null;

    setSaving(true);
    setFeedback("");

    const { error } = await supabase.from("sorties_terrain").insert([
      {
        compagnie: getCompanyLabel(resolvedCompanyContext),
        company_context: resolvedCompanyContext,
        client,
        dossier: dossierNom,
        dossier_id: dossierIdNumber,
        vehicule,
        km_depart: kmDepartNumber,
        morning_break_minutes: Number(pauseMatinMinutes || 0),
        morning_break_paid: pauseMatinPaid,
        lunch_minutes: Number(dinerMinutes || 0),
        lunch_paid: dinerPaid,
        afternoon_break_minutes: Number(pauseApresMidiMinutes || 0),
        afternoon_break_paid: pauseApresMidiPaid,
        paid_break_minutes: 0,
        unpaid_break_minutes: 0,
        payable_minutes: 0,
        facturable_minutes: 0,
        temps_payable: null,
        temps_non_payable: null,
        temps_facturable: null,
        notes: notes.trim() || null,
        heure_depart: new Date().toISOString(),
        statut: "en_cours",
        user_id: user.id,
      },
    ]);

    setSaving(false);

    if (error) {
      setFeedback(
        "Demarrage impossible."
      );
      return;
    }

    setCompanyContext("");
    setClient("");
    setDossierId("");
    setVehicule("");
    setKmDepart("");
    setKmArrivee("");
    resetBreakFields();
    setNotes("");
    await chargerSorties(user.id);
  };

  const handleTerminer = async () => {
    if (!user) {
      router.push("/employe/login");
      return;
    }

    if (!sortieActive) {
      setFeedback("Aucune sortie active.");
      return;
    }

    if (!kmArrivee.trim()) {
      setFeedback("KM retour requis.");
      return;
    }

    const kmArriveeNumber = Number(kmArrivee);
    if (Number.isNaN(kmArriveeNumber)) {
      setFeedback("KM retour invalide.");
      return;
    }

    const heureRetour = new Date().toISOString();
    const tempsTotal = calculerTempsTotal(
      sortieActive.heure_depart || heureRetour,
      heureRetour
    );
    const summary = computeWorkTimeSummary({
      start: sortieActive.heure_depart,
      end: heureRetour,
      breaks: activeBreaks,
      billable: sortieActive.refacturer_a_titan ?? false,
    });

    setSaving(true);
    setFeedback("");

    const { error } = await supabase
      .from("sorties_terrain")
      .update({
        km_arrivee: kmArriveeNumber,
        heure_retour: heureRetour,
        temps_total: tempsTotal,
        morning_break_minutes: Number(pauseMatinMinutes || 0),
        morning_break_paid: pauseMatinPaid,
        lunch_minutes: Number(dinerMinutes || 0),
        lunch_paid: dinerPaid,
        afternoon_break_minutes: Number(pauseApresMidiMinutes || 0),
        afternoon_break_paid: pauseApresMidiPaid,
        presence_minutes: summary.presenceMinutes,
        paid_break_minutes: summary.paidBreakMinutes,
        unpaid_break_minutes: summary.unpaidBreakMinutes,
        payable_minutes: summary.payableMinutes,
        facturable_minutes: summary.facturableMinutes,
        temps_payable: summary.payableText,
        temps_non_payable: summary.nonPayableText,
        temps_facturable: summary.facturableText,
        statut: "terminee",
        notes: notes.trim() ? notes : sortieActive.notes,
        company_context: sortieActive.company_context ?? (resolvedCompanyContext || null),
      })
      .eq("id", sortieActive.id);

    setSaving(false);

    if (error) {
      setFeedback(
        "Cloture impossible."
      );
      return;
    }

    setKmArrivee("");
    resetBreakFields();
    setNotes("");
    await chargerSorties(user.id);
  };

  if (accessLoading || loading) {
    return <TagoraLoadingScreen isLoading message="Chargement de votre espace..." fullScreen />;
  }

  if (!canUseTerrain) {
    return (
      <div className="page-container">
        <HeaderTagora
          title="Terrain employe"
          subtitle="Sorties et interventions"
        />
        <AccessNotice description="Acces requis." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora
        title="Terrain employe"
        subtitle="Sorties et interventions"
      />

      {feedback ? <AccessNotice title="Action bloquee" description={feedback} /> : null}
      {secondaryNotice ? (
        <div style={{ marginTop: feedback ? 18 : 0 }}>
          <AccessNotice title="Acces partiel" description={secondaryNotice} />
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <AccessNotice
          title="Localisation"
          description={
            gpsReport.status === "active"
              ? "GPS actif : la position est envoyee au tableau direction tant que cette page reste ouverte."
              : gpsReport.status === "denied"
                ? "GPS bloque : autorisez la localisation pour ce site dans les reglages du navigateur."
                : gpsReport.status === "unsupported"
                  ? "La geolocalisation n est pas disponible sur cet appareil."
                  : gpsReport.status === "error"
                    ? `GPS : ${gpsReport.lastError ?? "erreur d envoi ou de position."}`
                    : gpsReport.status === "requesting"
                      ? "Demande d acces a la localisation en cours..."
                      : "En attente de la localisation..."
          }
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
          alignItems: "start",
          marginTop: 24,
          marginBottom: 24,
        }}
      >
        <div className="tagora-panel" style={{ minHeight: 540 }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>
            Demarrer une sortie
          </h2>

          <div className="tagora-form-grid">
            <label className="tagora-field">
              <span className="tagora-label">Compagnie</span>
              <select
                value={resolvedCompanyContext}
                onChange={(event) =>
                  setCompanyContext(event.target.value as AccountRequestCompany | "")
                }
                className="tagora-input"
              >
                <option value="">Choisir une compagnie</option>
                {companyAccess.allowedCompanies.map((company) => (
                  <option key={company} value={company}>
                    {getCompanyLabel(company)}
                  </option>
                ))}
              </select>
            </label>

            <label className="tagora-field">
              <span className="tagora-label">Client</span>
              <input
                value={client}
                onChange={(event) => setClient(event.target.value)}
                className="tagora-input"
              />
            </label>

            <label className="tagora-field">
              <span className="tagora-label">Dossier lie</span>
              <select
                value={dossierId}
                onChange={(event) => handleChoixDossier(event.target.value)}
                className="tagora-input"
              >
                <option value="">Choisir un dossier</option>
                {dossiers.map((dossier) => (
                  <option key={dossier.id} value={dossier.id}>
                    {dossier.nom || `Dossier #${dossier.id}`}
                    {dossier.client ? ` - ${dossier.client}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="tagora-field">
              <span className="tagora-label">Vehicule</span>
              <input
                value={vehicule}
                onChange={(event) => setVehicule(event.target.value)}
                placeholder="Camion 1, personnel, remorque"
                className="tagora-input"
              />
            </label>

            <label className="tagora-field">
              <span className="tagora-label">KM depart</span>
              <input
                value={kmDepart}
                onChange={(event) => setKmDepart(event.target.value)}
                type="number"
                className="tagora-input"
              />
            </label>

            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
              <span className="tagora-label">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes"
                className="tagora-textarea"
              />
            </label>

            <div className="tagora-panel-muted" style={{ gridColumn: "1 / -1" }}>
              <div className="tagora-label" style={{ marginBottom: 12 }}>
                Pauses et diner
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <label className="tagora-field">
                  <span className="tagora-label">Pause matin</span>
                  <input
                    value={pauseMatinMinutes}
                    onChange={(event) => setPauseMatinMinutes(event.target.value)}
                    type="number"
                    min="0"
                    className="tagora-input"
                  />
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Pause matin</span>
                  <select
                    value={pauseMatinPaid ? "paid" : "unpaid"}
                    onChange={(event) => setPauseMatinPaid(event.target.value === "paid")}
                    className="tagora-input"
                  >
                    <option value="paid">Payee</option>
                    <option value="unpaid">Non payee</option>
                  </select>
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Diner</span>
                  <input
                    value={dinerMinutes}
                    onChange={(event) => setDinerMinutes(event.target.value)}
                    type="number"
                    min="0"
                    className="tagora-input"
                  />
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Diner</span>
                  <select
                    value={dinerPaid ? "paid" : "unpaid"}
                    onChange={(event) => setDinerPaid(event.target.value === "paid")}
                    className="tagora-input"
                  >
                    <option value="paid">Paye</option>
                    <option value="unpaid">Non paye</option>
                  </select>
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Pause apres-midi</span>
                  <input
                    value={pauseApresMidiMinutes}
                    onChange={(event) => setPauseApresMidiMinutes(event.target.value)}
                    type="number"
                    min="0"
                    className="tagora-input"
                  />
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Pause apres-midi</span>
                  <select
                    value={pauseApresMidiPaid ? "paid" : "unpaid"}
                    onChange={(event) =>
                      setPauseApresMidiPaid(event.target.value === "paid")
                    }
                    className="tagora-input"
                  >
                    <option value="paid">Payee</option>
                    <option value="unpaid">Non payee</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <button
            onClick={handleDemarrer}
            disabled={saving || !!sortieActive}
            className="tagora-dark-action"
            style={{ marginTop: 18 }}
          >
            {saving ? "Demarrage..." : "Demarrer"}
          </button>
        </div>

        <div className="tagora-panel" style={{ minHeight: 540 }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>
            Sortie active
          </h2>

          {!sortieActive ? (
            <p className="tagora-note">
              Aucune sortie active.
            </p>
          ) : (
            <>
              <div className="tagora-note" style={{ display: "grid", gap: 8 }}>
                <div>
                  <strong>Compagnie :</strong>{" "}
                  {sortieActive.company_context
                    ? getCompanyLabel(sortieActive.company_context)
                    : sortieActive.compagnie || "-"}
                </div>
                <div>
                  <strong>Client :</strong> {sortieActive.client || "-"}
                </div>
                <div>
                  <strong>Dossier :</strong>{" "}
                  {sortieActive.dossier_id
                    ? getNomDossier(sortieActive.dossier_id)
                    : sortieActive.dossier || "-"}
                </div>
                <div>
                  <strong>Vehicule :</strong> {sortieActive.vehicule || "-"}
                </div>
                <div>
                  <strong>KM depart :</strong> {sortieActive.km_depart ?? "-"}
                </div>
                <div>
                  <strong>Heure depart :</strong>{" "}
                  {formatDateTime(sortieActive.heure_depart)}
                </div>
              </div>

              <div className="tagora-form-grid" style={{ marginTop: 18 }}>
                <label className="tagora-field">
                  <span className="tagora-label">KM retour</span>
                  <input
                    value={kmArrivee}
                    onChange={(event) => setKmArrivee(event.target.value)}
                    type="number"
                    className="tagora-input"
                  />
                </label>

                <div className="tagora-panel-muted" style={{ gridColumn: "1 / -1" }}>
                  <div className="tagora-label" style={{ marginBottom: 12 }}>
                    Pauses et diner
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <label className="tagora-field">
                      <span className="tagora-label">Pause matin</span>
                      <input
                        value={pauseMatinMinutes}
                        onChange={(event) => setPauseMatinMinutes(event.target.value)}
                        type="number"
                        min="0"
                        className="tagora-input"
                      />
                    </label>
                    <label className="tagora-field">
                      <span className="tagora-label">Pause matin</span>
                      <select
                        value={pauseMatinPaid ? "paid" : "unpaid"}
                        onChange={(event) =>
                          setPauseMatinPaid(event.target.value === "paid")
                        }
                        className="tagora-input"
                      >
                        <option value="paid">Payee</option>
                        <option value="unpaid">Non payee</option>
                      </select>
                    </label>
                    <label className="tagora-field">
                      <span className="tagora-label">Diner</span>
                      <input
                        value={dinerMinutes}
                        onChange={(event) => setDinerMinutes(event.target.value)}
                        type="number"
                        min="0"
                        className="tagora-input"
                      />
                    </label>
                    <label className="tagora-field">
                      <span className="tagora-label">Diner</span>
                      <select
                        value={dinerPaid ? "paid" : "unpaid"}
                        onChange={(event) => setDinerPaid(event.target.value === "paid")}
                        className="tagora-input"
                      >
                        <option value="paid">Paye</option>
                        <option value="unpaid">Non paye</option>
                      </select>
                    </label>
                    <label className="tagora-field">
                      <span className="tagora-label">Pause apres-midi</span>
                      <input
                        value={pauseApresMidiMinutes}
                        onChange={(event) => setPauseApresMidiMinutes(event.target.value)}
                        type="number"
                        min="0"
                        className="tagora-input"
                      />
                    </label>
                    <label className="tagora-field">
                      <span className="tagora-label">Pause apres-midi</span>
                      <select
                        value={pauseApresMidiPaid ? "paid" : "unpaid"}
                        onChange={(event) =>
                          setPauseApresMidiPaid(event.target.value === "paid")
                        }
                        className="tagora-input"
                      >
                        <option value="paid">Payee</option>
                        <option value="unpaid">Non payee</option>
                      </select>
                    </label>
                  </div>
                </div>

                <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Notes"
                    className="tagora-textarea"
                  />
                </label>
              </div>

              {activeSummaryPreview ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginTop: 18,
                  }}
                >
                  <SummaryTile label="Presence totale" value={activeSummaryPreview.presenceText} />
                  <SummaryTile label="Pauses payees" value={activeSummaryPreview.paidBreakText} />
                  <SummaryTile
                    label="Pauses non payees"
                    value={activeSummaryPreview.unpaidBreakText}
                  />
                  <SummaryTile label="Temps payable" value={activeSummaryPreview.payableText} />
                </div>
              ) : null}

              <button
                onClick={handleTerminer}
                disabled={saving}
                className="tagora-dark-action"
                style={{ marginTop: 18 }}
              >
                {saving ? "Cloture..." : "Terminer"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tagora-panel">
        <h2 className="section-title" style={{ marginBottom: 18 }}>
          Historique recent
        </h2>

        {historique.length === 0 ? (
          <p className="tagora-note">
            Aucun historique.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {historique.map((sortie) => {
              const distance =
                sortie.km_depart != null && sortie.km_arrivee != null
                  ? sortie.km_arrivee - sortie.km_depart
                  : null;

              return (
                <div
                  key={sortie.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    padding: 16,
                    background: "#fafafa",
                  }}
                >
                  <div className="tagora-note" style={{ display: "grid", gap: 6 }}>
                    <div>
                      <strong>Client :</strong> {sortie.client || "-"}
                    </div>
                    <div>
                      <strong>Compagnie :</strong>{" "}
                      {sortie.company_context
                        ? getCompanyLabel(sortie.company_context)
                        : sortie.compagnie || "-"}
                    </div>
                    <div>
                      <strong>Dossier :</strong>{" "}
                      {sortie.dossier_id
                        ? getNomDossier(sortie.dossier_id)
                        : sortie.dossier || "-"}
                    </div>
                    <div>
                      <strong>Vehicule :</strong> {sortie.vehicule || "-"}
                    </div>
                    <div>
                      <strong>Depart :</strong> {formatDateTime(sortie.heure_depart)}
                    </div>
                    <div>
                      <strong>Retour :</strong> {formatDateTime(sortie.heure_retour)}
                    </div>
                    <div>
                      <strong>Temps total :</strong> {sortie.temps_total || "-"}
                    </div>
                    <div>
                      <strong>Pauses payees :</strong>{" "}
                      {sortie.paid_break_minutes != null
                        ? `${sortie.paid_break_minutes} min`
                        : "-"}
                    </div>
                    <div>
                      <strong>Pauses non payees :</strong>{" "}
                      {sortie.temps_non_payable ||
                        (sortie.unpaid_break_minutes != null
                          ? `${sortie.unpaid_break_minutes} min`
                          : "-")}
                    </div>
                    <div>
                      <strong>Temps payable :</strong> {sortie.temps_payable || "-"}
                    </div>
                    <div>
                      <strong>Temps facturable :</strong>{" "}
                      {sortie.temps_facturable || "-"}
                    </div>
                    <div>
                      <strong>KM depart :</strong> {sortie.km_depart ?? "-"}
                    </div>
                    <div>
                      <strong>KM retour :</strong> {sortie.km_arrivee ?? "-"}
                    </div>
                    <div>
                      <strong>Distance :</strong>{" "}
                      {distance != null ? `${distance} km` : "-"}
                    </div>
                    <div>
                      <strong>Notes :</strong> {sortie.notes || "-"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="actions-row" style={{ marginTop: 24 }}>
        <button
          onClick={() => router.push("/employe/dashboard")}
          className="tagora-dark-outline-action"
        >
          Retour
        </button>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tagora-panel-muted" style={{ margin: 0 }}>
      <div className="tagora-label">{label}</div>
      <div style={{ marginTop: 8, fontWeight: 700, color: "#0f2948" }}>{value}</div>
    </div>
  );
}
