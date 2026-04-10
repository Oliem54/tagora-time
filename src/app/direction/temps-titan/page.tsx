"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";

type PaymentStatus = "paye" | "non_paye" | "";

type Employe = {
  id: string | number;
  nom: string;
  taux_base_titan: number | null;
  primary_company?: AccountRequestCompany | null;
};

type TempsTitanDbRow = {
  id: string | number;
  employe_id: string | number | null;
  employe_nom: string | null;
  date_travail: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  duree_totale: string | number | null;
  duree_heures: number | null;
  type_travail: string | null;
  livraison: string | null;
  notes: string | null;
  refacturee_a_titan: boolean | null;
  statut_paiement_titan: string | null;
  taux_salaire_h: number | null;
  marge_h: number | null;
  taux_total_h: number | null;
  total_salaire: number | null;
  total_benefice: number | null;
  total_titan: number | null;
  company_context: AccountRequestCompany | null;
};

type SortieTitanRow = {
  id: string | number;
  chauffeur_id: string | number | null;
  livraison_id: string | number | null;
  date_sortie: string | null;
  temps_total: string | null;
  refacturer_a_titan: boolean | null;
  company_context: AccountRequestCompany | null;
};

type UnifiedRow = {
  source: "manuel" | "sortie";
  sourceId: string;
  id: string | number;
  employe_nom: string;
  date_travail: string;
  duree_totale: string;
  duree_heures: number;
  type_travail: string;
  livraison: string;
  refacturee_a_titan: boolean;
  statut_paiement_titan: PaymentStatus;
  total_titan: number;
  total_salaire: number;
  total_benefice: number;
  company_context: AccountRequestCompany | null;
};

type FormState = {
  employe_id: string;
  date_travail: string;
  heure_debut: string;
  heure_fin: string;
  type_travail: string;
  notes: string;
  company_context: AccountRequestCompany | "";
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function initialForm(): FormState {
  return {
    employe_id: "",
    date_travail: todayIso(),
    heure_debut: "",
    heure_fin: "",
    type_travail: "entrepot",
    notes: "",
    company_context: "",
  };
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function diffHours(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff / 60 : 0;
}

function hoursToText(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function parseHoursFromText(value: string | null | undefined) {
  if (!value) return 0;
  const hourMinuteMatch = value.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hourMinuteMatch) {
    return Number(hourMinuteMatch[1]) + Number(hourMinuteMatch[2]) / 60;
  }
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizePaymentStatus(value: unknown): PaymentStatus {
  if (value === "paye") return "paye";
  if (value === "non_paye") return "non_paye";
  return "";
}

export default function TempsTitanPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [tempsTitan, setTempsTitan] = useState<TempsTitanDbRow[]>([]);
  const [sortiesTitan, setSortiesTitan] = useState<SortieTitanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [linkedDataNotice, setLinkedDataNotice] = useState("");
  const [form, setForm] = useState<FormState>(initialForm());
  const [dateDebut, setDateDebut] = useState(firstDayOfMonthIso());
  const [dateFin, setDateFin] = useState(todayIso());
  const [companyFilter, setCompanyFilter] = useState<AccountRequestCompany | "">("");
  const employeSelection = useMemo(() => employes.find((item) => String(item.id) === form.employe_id), [employes, form.employe_id]);
  const resolvedCompanyContext =
    form.company_context || employeSelection?.primary_company || "";

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const results = await Promise.allSettled([
      supabase.from("chauffeurs").select("id, nom, taux_base_titan, primary_company").order("id", { ascending: true }),
      supabase.from("temps_titan").select("*").order("date_travail", { ascending: false }).order("id", { ascending: false }),
      supabase.from("sorties_terrain").select("id, chauffeur_id, livraison_id, date_sortie, temps_total, refacturer_a_titan, company_context").eq("refacturer_a_titan", true).order("date_sortie", { ascending: false }),
    ]);

    const notices: string[] = [];
    const employesRes = results[0].status === "fulfilled" ? results[0].value : null;
    const tempsRes = results[1].status === "fulfilled" ? results[1].value : null;
    const sortiesRes = results[2].status === "fulfilled" ? results[2].value : null;

    if (!employesRes || employesRes.error) {
      notices.push("chauffeurs");
      setEmployes([]);
    } else {
      setEmployes((employesRes.data ?? []).map((row) => ({
        id: row.id,
        nom: row.nom ?? "",
        taux_base_titan: row.taux_base_titan != null ? Number(row.taux_base_titan) : null,
        primary_company: (row as Record<string, unknown>).primary_company as AccountRequestCompany | null,
      })));
    }

    if (!tempsRes || tempsRes.error) {
      setErrorMessage("Les entrees temps_titan ne sont pas accessibles pour le moment.");
      setTempsTitan([]);
    } else {
      setTempsTitan((tempsRes.data ?? []).map((row: Record<string, unknown>) => ({
        id: typeof row.id === "number" || typeof row.id === "string" ? row.id : 0,
        employe_id: typeof row.employe_id === "number" || typeof row.employe_id === "string" ? row.employe_id : null,
        employe_nom: typeof row.employe_nom === "string" ? row.employe_nom : null,
        date_travail: typeof row.date_travail === "string" ? row.date_travail : null,
        heure_debut: typeof row.heure_debut === "string" ? row.heure_debut : null,
        heure_fin: typeof row.heure_fin === "string" ? row.heure_fin : null,
        duree_totale: typeof row.duree_totale === "string" || typeof row.duree_totale === "number" ? row.duree_totale : null,
        duree_heures: toNumber(row.duree_heures),
        type_travail: typeof row.type_travail === "string" ? row.type_travail : null,
        livraison: typeof row.livraison === "string" ? row.livraison : null,
        notes: typeof row.notes === "string" ? row.notes : null,
        refacturee_a_titan: !!row.refacturee_a_titan,
        statut_paiement_titan: normalizePaymentStatus(row.statut_paiement_titan),
        taux_salaire_h: toNumber(row.taux_salaire_h),
        marge_h: toNumber(row.marge_h),
        taux_total_h: toNumber(row.taux_total_h),
        total_salaire: toNumber(row.total_salaire),
        total_benefice: toNumber(row.total_benefice),
        total_titan: toNumber(row.total_titan),
        company_context: typeof row.company_context === "string" ? (row.company_context as AccountRequestCompany) : null,
      })));
    }

    if (!sortiesRes || sortiesRes.error) {
      notices.push("sorties terrain Titan");
      setSortiesTitan([]);
    } else {
      setSortiesTitan((sortiesRes.data ?? []) as SortieTitanRow[]);
    }

    setLinkedDataNotice(notices.length > 0 ? `Certaines donnees complementaires sont limitees sur ce compte : ${notices.join(", ")}.` : "");
    setLoading(false);
  }, []);

  const blocked = !accessLoading && !!user && !hasPermission("terrain");
  const userId = user?.id ?? null;

  useEffect(() => {
    if (accessLoading || !userId || blocked) return;
    const timeout = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(timeout);
  }, [accessLoading, blocked, loadAll, userId]);

  const dureeCalculee = useMemo(() => diffHours(form.heure_debut, form.heure_fin), [form.heure_debut, form.heure_fin]);
  const tauxBaseTitan = employeSelection?.taux_base_titan ?? 0;
  const margeTitan = tauxBaseTitan * 0.15;
  const tauxTotalTitan = tauxBaseTitan + margeTitan;
  const totalSalaireCalcule = dureeCalculee * tauxBaseTitan;
  const totalBeneficeCalcule = dureeCalculee * margeTitan;
  const totalTitanCalcule = dureeCalculee * tauxTotalTitan;

  const unifiedRows = useMemo<UnifiedRow[]>(() => {
    const employeMap = new Map(employes.map((item) => [String(item.id), item]));

    const manualRows = tempsTitan.map((row) => ({
      source: "manuel" as const,
      sourceId: `manuel-${row.id}`,
      id: row.id,
      employe_nom: row.employe_nom ?? "-",
      date_travail: row.date_travail ?? "",
      duree_totale: typeof row.duree_totale === "string" ? row.duree_totale : hoursToText(toNumber(row.duree_heures)),
      duree_heures: toNumber(row.duree_heures),
      type_travail: row.type_travail ?? "",
      livraison: row.livraison ?? "-",
      refacturee_a_titan: !!row.refacturee_a_titan,
      statut_paiement_titan: normalizePaymentStatus(row.statut_paiement_titan),
      total_titan: toNumber(row.total_titan),
      total_salaire: toNumber(row.total_salaire),
      total_benefice: toNumber(row.total_benefice),
      company_context: row.company_context ?? null,
    }));

    const sortieRows = sortiesTitan.map((row) => {
      const employe = row.chauffeur_id ? employeMap.get(String(row.chauffeur_id)) : undefined;
      const base = toNumber(employe?.taux_base_titan);
      const marge = base * 0.15;
      const dureeHeures = parseHoursFromText(row.temps_total);
      return {
        source: "sortie" as const,
        sourceId: `sortie-${row.id}`,
        id: typeof row.id === "number" || typeof row.id === "string" ? row.id : 0,
        employe_nom: employe?.nom ?? "-",
        date_travail: row.date_sortie ?? "",
        duree_totale: row.temps_total ?? hoursToText(dureeHeures),
        duree_heures: dureeHeures,
        type_travail: "livraison",
        livraison: row.livraison_id ? `Livraison #${row.livraison_id}` : "-",
        refacturee_a_titan: true,
        statut_paiement_titan: "" as PaymentStatus,
        total_titan: dureeHeures * (base + marge),
        total_salaire: dureeHeures * base,
        total_benefice: dureeHeures * marge,
        company_context: row.company_context ?? employe?.primary_company ?? null,
      };
    });

    return [...manualRows, ...sortieRows].sort((a, b) => b.date_travail.localeCompare(a.date_travail));
  }, [employes, sortiesTitan, tempsTitan]);

  const filteredRows = useMemo(() => {
    return unifiedRows.filter(
      (row) =>
        (!dateDebut || row.date_travail >= dateDebut) &&
        (!dateFin || row.date_travail <= dateFin) &&
        (!companyFilter || row.company_context === companyFilter)
    );
  }, [companyFilter, dateDebut, dateFin, unifiedRows]);

  const totals = useMemo(() => {
    return {
      totalHeuresTitan: filteredRows.reduce((sum, row) => sum + row.duree_heures, 0),
      totalSalaire: filteredRows.reduce((sum, row) => sum + row.total_salaire, 0),
      totalBenefice: filteredRows.reduce((sum, row) => sum + row.total_benefice, 0),
      totalTitan: filteredRows.reduce((sum, row) => sum + row.total_titan, 0),
    };
  }, [filteredRows]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!form.employe_id || !form.date_travail || !form.heure_debut || !form.heure_fin) {
      setErrorMessage("Completer employe, date, heure debut et heure fin avant d ajouter l entree Titan.");
      return;
    }

    if (!employeSelection || employeSelection.taux_base_titan == null) {
      setErrorMessage("Le taux de base Titan manque sur la fiche chauffeur selectionnee.");
      return;
    }

    if (dureeCalculee <= 0) {
      setErrorMessage("La duree calculee doit etre superieure a zero.");
      return;
    }

    if (!resolvedCompanyContext) {
      setErrorMessage("Choisir une compagnie avant d ajouter l entree Titan.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("temps_titan").insert({
      employe_id: form.employe_id,
      employe_nom: employeSelection.nom,
      date_travail: form.date_travail,
      heure_debut: form.heure_debut,
      heure_fin: form.heure_fin,
      duree_totale: hoursToText(dureeCalculee),
      duree_heures: dureeCalculee,
      company_context: resolvedCompanyContext || null,
      type_travail: form.type_travail,
      notes: form.notes || null,
      ajoute_manuellement: true,
      cree_par_direction: true,
      refacturee_a_titan: false,
      taux_salaire_h: tauxBaseTitan,
      marge_h: margeTitan,
      taux_total_h: tauxTotalTitan,
      total_salaire: totalSalaireCalcule,
      total_benefice: totalBeneficeCalcule,
      total_titan: totalTitanCalcule,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Entree Titan ajoutee.");
    setForm(initialForm());
    await loadAll();
  }

  if (accessLoading || (!blocked && loading)) {
    return (
      <div className="page-container">
        <HeaderTagora title="Temps Titan" subtitle="Suivi du temps, des couts et de la refacturation Titan" />
        <AccessNotice description="Verification des acces terrain et chargement des donnees Titan en cours." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (blocked) {
    return (
      <div className="page-container">
        <HeaderTagora title="Temps Titan" subtitle="Suivi du temps, des couts et de la refacturation Titan" />
        <AccessNotice description="La permission terrain n est pas active sur ce compte direction. Le module Temps Titan reste masque." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora title="Temps Titan" subtitle="Suivi du temps, des couts et de la refacturation Titan" />

      {errorMessage ? <AccessNotice title="Chargement limite" description={errorMessage} /> : null}
      {successMessage ? <div style={{ marginTop: errorMessage ? 18 : 0 }}><AccessNotice title="Operation validee" description={successMessage} /></div> : null}
      {linkedDataNotice ? <div style={{ marginTop: errorMessage || successMessage ? 18 : 0 }}><AccessNotice title="Acces partiel" description={linkedDataNotice} /></div> : null}

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <StatCard label="Total heures Titan" value={formatHours(totals.totalHeuresTitan)} />
          <StatCard label="Total salaire" value={formatMoney(totals.totalSalaire)} />
          <StatCard label="Total benefice" value={formatMoney(totals.totalBenefice)} />
          <StatCard label="Total Titan" value={formatMoney(totals.totalTitan)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 1fr) minmax(0, 1.7fr)", gap: 24, alignItems: "start", marginTop: 24 }}>
        <section className="tagora-panel">
          <h2 className="section-title" style={{ marginBottom: 18 }}>Ajouter une entree Titan</h2>
          <form onSubmit={handleSubmit} className="tagora-form-grid">
            <label className="tagora-field"><span className="tagora-label">Employe</span><select value={form.employe_id} onChange={(e) => setForm((prev) => ({ ...prev, employe_id: e.target.value }))} className="tagora-input"><option value="">Choisir un employe</option>{employes.map((item) => <option key={String(item.id)} value={String(item.id)}>{item.nom}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Date</span><input type="date" value={form.date_travail} onChange={(e) => setForm((prev) => ({ ...prev, date_travail: e.target.value }))} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Heure debut</span><input type="time" value={form.heure_debut} onChange={(e) => setForm((prev) => ({ ...prev, heure_debut: e.target.value }))} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Heure fin</span><input type="time" value={form.heure_fin} onChange={(e) => setForm((prev) => ({ ...prev, heure_fin: e.target.value }))} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Type de travail</span><select value={form.type_travail} onChange={(e) => setForm((prev) => ({ ...prev, type_travail: e.target.value }))} className="tagora-input"><option value="entrepot">Entrepot</option><option value="manutention">Manutention</option><option value="chargement">Chargement</option><option value="dechargement">Dechargement</option><option value="assemblage">Assemblage</option><option value="autre">Autre</option></select></label>
            <label className="tagora-field"><span className="tagora-label">Compagnie</span><select value={resolvedCompanyContext} onChange={(e) => setForm((prev) => ({ ...prev, company_context: e.target.value as AccountRequestCompany | "" }))} className="tagora-input"><option value="">Choisir la compagnie</option>{ACCOUNT_REQUEST_COMPANIES.map((company) => <option key={company.value} value={company.value}>{company.label}</option>)}</select></label>
            <div className="tagora-panel" style={{ margin: 0 }}><div className="tagora-label">Duree calculee</div><div style={{ marginTop: 8, fontWeight: 700 }}>{hoursToText(dureeCalculee)}</div></div>
            <div className="tagora-panel" style={{ margin: 0 }}><div className="tagora-label">Total Titan calcule</div><div style={{ marginTop: 8, fontWeight: 700 }}>{formatMoney(totalTitanCalcule)}</div></div>
            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}><span className="tagora-label">Notes</span><textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="tagora-textarea" /></label>
            <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" disabled={saving} className="tagora-dark-action">{saving ? "Enregistrement..." : "Ajouter"}</button>
              <button type="button" className="tagora-dark-outline-action" onClick={() => void loadAll()}>Actualiser</button>
            </div>
          </form>
        </section>

        <section className="tagora-panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
            <div>
              <h2 className="section-title" style={{ marginBottom: 8 }}>Liste du temps Titan</h2>
              <p className="tagora-note">Entrees manuelles et lignes issues des sorties terrain refacturables.</p>
            </div>
            <div className="actions-row">
              <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value as AccountRequestCompany | "")} className="tagora-input">
                <option value="">Toutes les compagnies</option>
                {ACCOUNT_REQUEST_COMPANIES.map((company) => <option key={company.value} value={company.value}>{company.label}</option>)}
              </select>
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="tagora-input" />
              <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="tagora-input" />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Compagnie</th>
                  <th style={thStyle}>Employe</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Duree</th>
                  <th style={thStyle}>Livraison</th>
                  <th style={thStyle}>Salaire</th>
                  <th style={thStyle}>Benefice</th>
                  <th style={thStyle}>Total Titan</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td style={tdStyle} colSpan={11}>Aucune donnee sur la periode.</td></tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.sourceId}>
                      <td style={tdStyle}>{row.source === "manuel" ? "Manuel" : "Sortie"}</td>
                      <td style={tdStyle}>{row.sourceId}</td>
                      <td style={tdStyle}>{row.date_travail || "-"}</td>
                      <td style={tdStyle}>{row.company_context ? getCompanyLabel(row.company_context) : "-"}</td>
                      <td style={tdStyle}>{row.employe_nom}</td>
                      <td style={tdStyle}>{row.type_travail || "-"}</td>
                      <td style={tdStyle}>{row.duree_totale}</td>
                      <td style={tdStyle}>{row.livraison || "-"}</td>
                      <td style={tdStyle}>{formatMoney(row.total_salaire)}</td>
                      <td style={tdStyle}>{formatMoney(row.total_benefice)}</td>
                      <td style={tdStyle}>{formatMoney(row.total_titan)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="tagora-panel" style={{ margin: 0 }}>
      <div className="tagora-label">{label}</div>
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#374151",
  background: "#f9fafb",
};

const tdStyle: React.CSSProperties = {
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#111827",
};



