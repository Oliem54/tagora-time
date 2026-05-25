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

export default function DirectionPaieCompagniesOperationalPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [rows, setRows] = useState<OperationalTimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());

  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("temps_titan")
      .select("id, employe_nom, date_travail, duree_heures, type_travail")
      .order("date_travail", { ascending: false })
      .limit(500);

    if (error) {
      setRows([]);
      setErrorMessage(error.message);
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
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (blocked || accessLoading) return;
    void loadRows();
  }, [accessLoading, blocked, loadRows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const date = row.date_travail ?? "";
      if (dateFrom && date && date < dateFrom) return false;
      if (dateTo && date && date > dateTo) return false;
      return true;
    });
  }, [dateFrom, dateTo, rows]);

  const totalHours = useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.duree_heures, 0),
    [filteredRows]
  );

  if (accessLoading || (!blocked && loading)) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Paie par compagnie — vue Direction"
        adminHref="/admin/paie-compagnies"
      >
        <AccessNotice description="Chargement des heures..." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  if (blocked) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Paie par compagnie — vue Direction"
        adminHref="/admin/paie-compagnies"
      >
        <AccessNotice description="La permission terrain est requise." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  return (
    <DirectionFinanceRestrictedScreen
      title="Paie par compagnie — vue Direction"
      adminHref="/admin/paie-compagnies"
      operationalTitle="Journal des heures (sans montants ni ventilation Oliem / Titan)"
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
              <div className="tagora-panel-muted" style={{ padding: 14 }}>
                <div className="tagora-label">Total heures</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                  {formatHours(totalHours)}
                </div>
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
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 16, color: "#64748b" }}>
                      Aucune ligne sur la periode.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
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
