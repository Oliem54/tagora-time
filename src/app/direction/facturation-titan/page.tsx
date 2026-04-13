"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  buildTitanBillingRows,
  type TitanBillingChauffeur,
  type TitanBillingRow,
  type TitanSortieRow,
  type TitanTempsRow,
} from "@/app/lib/titan-billing";

type PaymentStatus = "paye" | "non_paye" | "";

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePaymentStatus(value: unknown): PaymentStatus {
  if (value === "paye") return "paye";
  if (value === "non_paye") return "non_paye";
  return "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

export default function FacturationTitanPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<TitanBillingRow[]>([]);
  const [dateDebut, setDateDebut] = useState(firstDayOfMonthIso());
  const [dateFin, setDateFin] = useState(todayIso());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [chauffeursRes, tempsRes, sortiesRes] = await Promise.all([
        supabase
          .from("chauffeurs")
          .select(
            "id, nom, titan_enabled, titan_mode_timeclock, titan_mode_sorties, titan_hourly_rate, taux_base_titan, social_benefits_percent, primary_company"
          ),
        supabase
          .from("temps_titan")
          .select(
            "id, employe_id, employe_nom, date_travail, duree_heures, payable_minutes, facturable_minutes, temps_presence, temps_payable, temps_non_payable, type_travail, livraison, statut_paiement_titan, company_context"
          )
          .eq("company_context", "titan_produits_industriels"),
        supabase
          .from("sorties_terrain")
          .select(
            "id, chauffeur_id, livraison_id, date_sortie, temps_total, payable_minutes, facturable_minutes, temps_payable, temps_non_payable, company_context"
          )
          .eq("company_context", "titan_produits_industriels"),
      ]);

      if (chauffeursRes.error) throw chauffeursRes.error;
      if (tempsRes.error) throw tempsRes.error;
      if (sortiesRes.error) throw sortiesRes.error;

      setRows(
        buildTitanBillingRows({
          employes: (chauffeursRes.data ?? []) as TitanBillingChauffeur[],
          tempsTitan: (tempsRes.data ?? []) as TitanTempsRow[],
          sortiesTitan: (sortiesRes.data ?? []) as TitanSortieRow[],
        }).map((row) => ({
          ...row,
          statut_paiement_titan: normalizePaymentStatus(row.statut_paiement_titan),
        }))
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  const hasTerrainPerm = hasPermission("terrain");

  useEffect(() => {
    if (accessLoading) return;
    if (!user) return;
    if (!hasTerrainPerm) {
      setLoading(false);
      return;
    }
    void loadData();
  }, [accessLoading, hasTerrainPerm, loadData, user]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return (!dateDebut || (row.date_travail && row.date_travail >= dateDebut)) && (!dateFin || (row.date_travail && row.date_travail <= dateFin));
    });
  }, [dateDebut, dateFin, rows]);

  const totals = useMemo(() => {
    const totalHeuresTitan = filteredRows.reduce(
      (sum, row) => sum + row.titan_hours,
      0
    );
    const totalSalaire = filteredRows.reduce((sum, row) => sum + toNumber(row.total_salaire), 0);
    const totalBenefice = filteredRows.reduce((sum, row) => sum + toNumber(row.total_benefice), 0);
    const totalTitan = filteredRows.reduce((sum, row) => sum + toNumber(row.total_titan), 0);
    const totalPaye = filteredRows.filter((row) => row.statut_paiement_titan === "paye").reduce((sum, row) => sum + toNumber(row.total_titan), 0);
    const totalNonPaye = filteredRows.filter((row) => row.statut_paiement_titan !== "paye").reduce((sum, row) => sum + toNumber(row.total_titan), 0);

    return { totalHeuresTitan, totalSalaire, totalBenefice, totalTitan, totalPaye, totalNonPaye };
  }, [filteredRows]);

  if (accessLoading || loading) {
    return (
      <div className="page-container">
        <HeaderTagora title="Facturation Titan" subtitle="Synthese basee uniquement sur les heures Titan calculees." />
        <AccessNotice description="Verification des acces terrain et chargement des donnees Titan en cours." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!hasTerrainPerm) {
    return (
      <div className="page-container">
        <HeaderTagora title="Facturation Titan" subtitle="Synthese basee uniquement sur les heures Titan calculees." />
        <AccessNotice description="La permission terrain n est pas active sur ce compte direction. La synthese Titan reste donc masquee." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora title="Facturation Titan" subtitle="Synthese basee uniquement sur les heures Titan calculees." />

      {error ? (
        <div style={{ marginTop: 24 }}>
          <AccessNotice title="Chargement limite" description={error} />
        </div>
      ) : null}

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 8 }}>Synthese facturation Titan</h2>
            <p className="tagora-note">Vue consolidee des heures Titan issues du temps Titan et des sorties terrain Titan.</p>
          </div>
          <div className="actions-row">
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="tagora-input" />
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="tagora-input" />
            <button type="button" onClick={() => void loadData()} className="tagora-dark-outline-action">Actualiser</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 18 }}>
          <StatCard label="Heures Titan calculees" value={formatHours(totals.totalHeuresTitan)} />
          <StatCard label="Total salaire" value={formatMoney(totals.totalSalaire)} />
          <StatCard label="Total benefice" value={formatMoney(totals.totalBenefice)} />
          <StatCard label="Total Titan a facturer" value={formatMoney(totals.totalTitan)} />
          <StatCard label="Total paye" value={formatMoney(totals.totalPaye)} />
          <StatCard label="Total non paye" value={formatMoney(totals.totalNonPaye)} />
        </div>
      </div>

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 18 }}>Detail des entrees Titan</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Employe</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Presence</th>
                <th style={thStyle}>Non paye</th>
                <th style={thStyle}>Heures Titan</th>
                <th style={thStyle}>Taux/h</th>
                <th style={thStyle}>Avantages %</th>
                <th style={thStyle}>Total salaire</th>
                <th style={thStyle}>Total benefice</th>
                <th style={thStyle}>Total Titan</th>
                <th style={thStyle}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr><td style={tdStyle} colSpan={14}>Aucune donnee sur la periode.</td></tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.source_id}>
                    <td style={tdStyle}>{row.source === "timeclock" ? "Horodateur" : "Sortie"}</td>
                    <td style={tdStyle}>{row.id}</td>
                    <td style={tdStyle}>{row.date_travail || "-"}</td>
                    <td style={tdStyle}>{row.employe_nom || "-"}</td>
                    <td style={tdStyle}>{row.type_travail || "-"}</td>
                    <td style={tdStyle}>{row.presence_text || "-"}</td>
                    <td style={tdStyle}>{row.non_payable_text || "0 min"}</td>
                    <td style={tdStyle}>{formatHours(row.titan_hours)}</td>
                    <td style={tdStyle}>{formatMoney(toNumber(row.taux_horaire))}</td>
                    <td style={tdStyle}>{`${toNumber(row.social_benefits_percent).toFixed(2)} %`}</td>
                    <td style={tdStyle}>{formatMoney(toNumber(row.total_salaire))}</td>
                    <td style={tdStyle}>{formatMoney(toNumber(row.total_benefice))}</td>
                    <td style={tdStyle}>{formatMoney(toNumber(row.total_titan))}</td>
                    <td style={tdStyle}>{row.statut_paiement_titan || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
