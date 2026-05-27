"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AccessNotice from "@/app/components/AccessNotice";
import DirectionFinanceRestrictedScreen from "@/app/components/direction/DirectionFinanceRestrictedScreen";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

type OperationalTimeRow = {
  id: string | number;
  employe_nom: string | null;
  date_travail: string | null;
  duree_heures: number;
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

/** Plafond affichage ; requete filtree par periode cote serveur. */
const OPERATIONAL_QUERY_LIMIT = 2000;

export default function DirectionPaieCompagniesOperationalPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [rows, setRows] = useState<OperationalTimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [rowCapReached, setRowCapReached] = useState(false);

  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setRowCapReached(false);

    let query = supabase
      .from("direction_temps_titan_operational")
      .select("id, employe_nom, date_travail, duree_heures, type_travail")
      .order("date_travail", { ascending: false });

    if (dateFrom) {
      query = query.gte("date_travail", dateFrom);
    }
    if (dateTo) {
      query = query.lte("date_travail", dateTo);
    }

    const { data, error } = await query.limit(OPERATIONAL_QUERY_LIMIT);

    if (error) {
      setRows([]);
      setErrorMessage(error.message);
      setRowCapReached(false);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string | number,
      employe_nom: typeof row.employe_nom === "string" ? row.employe_nom : null,
      date_travail: typeof row.date_travail === "string" ? row.date_travail : null,
      duree_heures: toNumber(row.duree_heures),
      type_travail: typeof row.type_travail === "string" ? row.type_travail : null,
    }));

    setRows(mapped);
    setRowCapReached(mapped.length >= OPERATIONAL_QUERY_LIMIT);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (blocked || accessLoading) return;
    void loadRows();
  }, [accessLoading, blocked, loadRows]);

  const totalHours = useMemo(
    () => rows.reduce((sum, row) => sum + row.duree_heures, 0),
    [rows]
  );

  if (accessLoading || (!blocked && loading)) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Repartition Oliem / Titan — vue Direction"
        adminHref="/admin/paie-compagnies"
      >
        <AccessNotice description="Chargement des heures..." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  if (blocked) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Repartition Oliem / Titan — vue Direction"
        adminHref="/admin/paie-compagnies"
      >
        <AccessNotice description="La permission terrain est requise." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  return (
    <DirectionFinanceRestrictedScreen
      title="Repartition Oliem / Titan — vue Direction"
      adminHref="/admin/paie-compagnies"
      operationalTitle="Heures par compagnie (repartition Oliem / Titan, sans montants)"
    >
      {errorMessage ? (
        <AccessNotice title="Chargement limite" description={errorMessage} />
      ) : (
        <>
          <div className="tagora-panel" style={{ marginBottom: 18, padding: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
              <label className="tagora-field">
                <span className="tagora-label">Du</span>
                <input
                  type="date"
                  className="tagora-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="tagora-field">
                <span className="tagora-label">Au</span>
                <input
                  type="date"
                  className="tagora-input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => void loadRows()}
              >
                Actualiser
              </button>
              <div className="tagora-panel-muted" style={{ padding: 14 }}>
                <div className="tagora-label">Total heures</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                  {formatHours(totalHours)}
                </div>
              </div>
            </div>
            {rowCapReached ? (
              <p className="tagora-note" style={{ marginTop: 12, marginBottom: 0 }}>
                Affichage limite a {OPERATIONAL_QUERY_LIMIT} lignes pour cette periode. Les
                totaux peuvent etre incomplets : affinez la periode si necessaire.
              </p>
            ) : null}
          </div>

          <div className="tagora-panel" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px" }}>Date</th>
                  <th style={{ padding: "10px 12px" }}>Employe</th>
                  <th style={{ padding: "10px 12px" }}>Type</th>
                  <th style={{ padding: "10px 12px" }}>Heures</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 16, color: "#64748b" }}>
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
