"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AccessNotice from "@/app/components/AccessNotice";
import DirectionFinanceRestrictedScreen from "@/app/components/direction/DirectionFinanceRestrictedScreen";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

type OperationalPayrollRow = {
  employe_id: string | number | null;
  employe_nom: string | null;
  first_work_date: string | null;
  last_work_date: string | null;
  total_hours: number;
};

function firstDayOfMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

export default function DirectionPaieOperationalPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [rows, setRows] = useState<OperationalPayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());

  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("payroll_company_summary")
      .select("employe_id, employe_nom, first_work_date, last_work_date, total_hours");

    if (error) {
      setRows([]);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setRows(
      (data ?? []).map((row: Record<string, unknown>) => ({
        employe_id:
          typeof row.employe_id === "string" || typeof row.employe_id === "number"
            ? row.employe_id
            : null,
        employe_nom: typeof row.employe_nom === "string" ? row.employe_nom : null,
        first_work_date:
          typeof row.first_work_date === "string" ? row.first_work_date : null,
        last_work_date:
          typeof row.last_work_date === "string" ? row.last_work_date : null,
        total_hours: toNumber(row.total_hours),
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
      const from = row.first_work_date ?? "";
      const to = row.last_work_date ?? "";
      if (dateFrom && to && to < dateFrom) return false;
      if (dateTo && from && from > dateTo) return false;
      return true;
    });
  }, [dateFrom, dateTo, rows]);

  const totalHours = useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.total_hours, 0),
    [filteredRows]
  );

  if (accessLoading || (!blocked && loading)) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Paie — vue Direction"
        adminHref="/admin/paie"
        operationalTitle="Chargement des heures"
      >
        <AccessNotice description="Chargement des donnees operationnelles..." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  if (blocked) {
    return (
      <DirectionFinanceRestrictedScreen title="Paie — vue Direction" adminHref="/admin/paie">
        <AccessNotice description="La permission terrain est requise pour consulter les heures." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  return (
    <DirectionFinanceRestrictedScreen
      title="Paie — vue Direction"
      adminHref="/admin/paie"
      operationalTitle="Heures consolidees (sans montants ni ventilation financiere)"
    >
      {errorMessage ? (
        <AccessNotice title="Chargement limite" description={errorMessage} />
      ) : (
        <>
          <div className="tagora-panel" style={{ marginBottom: 18, padding: 16 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                alignItems: "end",
              }}
            >
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
                <div className="tagora-label">Total heures (periode)</div>
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
                  <th style={{ padding: "10px 12px" }}>Employe</th>
                  <th style={{ padding: "10px 12px" }}>Premiere date</th>
                  <th style={{ padding: "10px 12px" }}>Derniere date</th>
                  <th style={{ padding: "10px 12px" }}>Heures</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 16, color: "#64748b" }}>
                      Aucune heure sur la periode selectionnee.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => (
                    <tr key={`${row.employe_id}-${index}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 12px" }}>{row.employe_nom ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{row.first_work_date ?? "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{row.last_work_date ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                        {formatHours(row.total_hours)}
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
