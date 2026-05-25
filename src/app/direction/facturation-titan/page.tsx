"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AccessNotice from "@/app/components/AccessNotice";
import DirectionFinanceRestrictedScreen from "@/app/components/direction/DirectionFinanceRestrictedScreen";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

type OperationalBillingRow = {
  id: string | number;
  employe_nom: string | null;
  date_travail: string | null;
  duree_heures: number;
  statut_paiement_titan: string;
  type_travail: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function normalizePaymentStatus(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "paye") return "Paye";
  if (raw === "non_paye") return "Non paye";
  return raw ? raw : "—";
}

export default function DirectionFacturationTitanOperationalPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [rows, setRows] = useState<OperationalBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateDebut, setDateDebut] = useState(firstDayOfMonthIso());
  const [dateFin, setDateFin] = useState(todayIso());

  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: queryError } = await supabase
      .from("temps_titan")
      .select("id, employe_nom, date_travail, duree_heures, type_travail, statut_paiement_titan")
      .gte("date_travail", dateDebut)
      .lte("date_travail", dateFin)
      .order("date_travail", { ascending: false })
      .limit(400);

    if (queryError) {
      setRows([]);
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setRows(
      (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string | number,
        employe_nom: typeof row.employe_nom === "string" ? row.employe_nom : null,
        date_travail: typeof row.date_travail === "string" ? row.date_travail : null,
        duree_heures: toNumber(row.duree_heures),
        type_travail: typeof row.type_travail === "string" ? row.type_travail : null,
        statut_paiement_titan: normalizePaymentStatus(row.statut_paiement_titan),
      }))
    );
    setLoading(false);
  }, [dateDebut, dateFin]);

  useEffect(() => {
    if (blocked || accessLoading) return;
    void loadData();
  }, [accessLoading, blocked, loadData]);

  const totalHours = useMemo(
    () => rows.reduce((sum, row) => sum + row.duree_heures, 0),
    [rows]
  );

  const paidCount = useMemo(
    () => rows.filter((row) => row.statut_paiement_titan === "Paye").length,
    [rows]
  );

  if (accessLoading || (!blocked && loading)) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Facturation Titan — vue Direction"
        adminHref="/admin/facturation-titan"
      >
        <AccessNotice description="Chargement..." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  if (blocked) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Facturation Titan — vue Direction"
        adminHref="/admin/facturation-titan"
      >
        <AccessNotice description="La permission terrain est requise." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  return (
    <DirectionFinanceRestrictedScreen
      title="Facturation Titan — vue Direction"
      adminHref="/admin/facturation-titan"
      operationalTitle="Suivi operationnel (heures et statuts de paiement Titan, sans montants)"
    >
      {error ? (
        <AccessNotice title="Chargement limite" description={error} />
      ) : (
        <>
          <div className="tagora-panel" style={{ marginBottom: 18, padding: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
              <input
                type="date"
                className="tagora-input"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
              <input
                type="date"
                className="tagora-input"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
              />
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => void loadData()}
              >
                Actualiser
              </button>
            </div>
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              <div className="tagora-panel-muted" style={{ padding: 14 }}>
                <div className="tagora-label">Heures</div>
                <div style={{ marginTop: 6, fontWeight: 800 }}>{formatHours(totalHours)}</div>
              </div>
              <div className="tagora-panel-muted" style={{ padding: 14 }}>
                <div className="tagora-label">Lignes payees (statut)</div>
                <div style={{ marginTop: 6, fontWeight: 800 }}>{paidCount}</div>
              </div>
              <div className="tagora-panel-muted" style={{ padding: 14 }}>
                <div className="tagora-label">Lignes affichees</div>
                <div style={{ marginTop: 6, fontWeight: 800 }}>{rows.length}</div>
              </div>
            </div>
          </div>

          <div className="tagora-panel" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px" }}>Date</th>
                  <th style={{ padding: "10px 12px" }}>Employe</th>
                  <th style={{ padding: "10px 12px" }}>Type</th>
                  <th style={{ padding: "10px 12px" }}>Heures</th>
                  <th style={{ padding: "10px 12px" }}>Statut Titan</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, color: "#64748b" }}>
                      Aucune ligne sur la periode.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={String(row.id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 12px" }}>{row.date_travail ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{row.employe_nom ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{row.type_travail ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                        {formatHours(row.duree_heures)}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{row.statut_paiement_titan}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DirectionFinanceRestrictedScreen>
  );
}
