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

type PayrollRow = {
  id: string | number;
  employe_id: string | number | null;
  employe_nom: string | null;
  date_travail: string | null;
  duree_heures: number | null;
  payable_minutes: number | null;
  total_salaire: number | null;
  total_benefice: number | null;
  total_titan: number | null;
  company_context: AccountRequestCompany | null;
};

type EmployeeAggregate = {
  key: string;
  employeId: string;
  employeNom: string;
  companyContext: AccountRequestCompany;
  totalHours: number;
  totalSalary: number;
  totalMargin: number;
  totalBillable: number;
  firstWorkDate: string | null;
  lastWorkDate: string | null;
};

type CompanyAggregate = {
  companyContext: AccountRequestCompany;
  employeeCount: number;
  totalHours: number;
  totalSalary: number;
  totalMargin: number;
  totalBillable: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toCsvLine(values: Array<string | number>) {
  return values
    .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
    .join(",");
}

export default function DirectionPayrollByCompanyPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [companyFilter, setCompanyFilter] = useState<AccountRequestCompany | "">("");

  const blocked = !accessLoading && !!user && !hasPermission("terrain");
  const userId = user?.id ?? null;

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("temps_titan")
      .select(
        "id, employe_id, employe_nom, date_travail, duree_heures, payable_minutes, total_salaire, total_benefice, total_titan, company_context"
      )
      .order("date_travail", { ascending: false })
      .order("employe_nom", { ascending: true });

    if (error) {
      setRows([]);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setRows(
      (data ?? []).map((row: Record<string, unknown>) => ({
        id: typeof row.id === "number" || typeof row.id === "string" ? row.id : "",
        employe_id:
          typeof row.employe_id === "number" || typeof row.employe_id === "string"
            ? row.employe_id
            : null,
        employe_nom: typeof row.employe_nom === "string" ? row.employe_nom : null,
        date_travail: typeof row.date_travail === "string" ? row.date_travail : null,
        duree_heures: toNumber(row.duree_heures),
        payable_minutes: toNumber(row.payable_minutes),
        total_salaire: toNumber(row.total_salaire),
        total_benefice: toNumber(row.total_benefice),
        total_titan: toNumber(row.total_titan),
        company_context:
          row.company_context === "oliem_solutions" ||
          row.company_context === "titan_produits_industriels"
            ? (row.company_context as AccountRequestCompany)
            : null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !userId || blocked) return;
    const timeout = setTimeout(() => {
      void loadRows();
    }, 0);
    return () => clearTimeout(timeout);
  }, [accessLoading, blocked, loadRows, userId]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const companyContext = row.company_context;
      const workDate = row.date_travail ?? "";

      return (
        Boolean(companyContext) &&
        (!companyFilter || companyContext === companyFilter) &&
        (!dateFrom || workDate >= dateFrom) &&
        (!dateTo || workDate <= dateTo)
      );
    });
  }, [companyFilter, dateFrom, dateTo, rows]);

  function getPayableHours(row: PayrollRow) {
    return row.payable_minutes != null && row.payable_minutes > 0
      ? row.payable_minutes / 60
      : toNumber(row.duree_heures);
  }

  const employeeAggregates = useMemo<EmployeeAggregate[]>(() => {
    const buckets = new Map<string, EmployeeAggregate>();

    filteredRows.forEach((row) => {
      if (!row.company_context) return;

      const key = `${row.company_context}::${String(row.employe_id ?? row.employe_nom ?? "sans-employe")}`;
      const existing = buckets.get(key);

      if (existing) {
        existing.totalHours += getPayableHours(row);
        existing.totalSalary += toNumber(row.total_salaire);
        existing.totalMargin += toNumber(row.total_benefice);
        existing.totalBillable += toNumber(row.total_titan);
        existing.firstWorkDate =
          existing.firstWorkDate && row.date_travail
            ? existing.firstWorkDate < row.date_travail
              ? existing.firstWorkDate
              : row.date_travail
            : existing.firstWorkDate ?? row.date_travail;
        existing.lastWorkDate =
          existing.lastWorkDate && row.date_travail
            ? existing.lastWorkDate > row.date_travail
              ? existing.lastWorkDate
              : row.date_travail
            : existing.lastWorkDate ?? row.date_travail;
        return;
      }

      buckets.set(key, {
        key,
        employeId: String(row.employe_id ?? ""),
        employeNom: row.employe_nom ?? "Employe non defini",
        companyContext: row.company_context,
        totalHours: getPayableHours(row),
        totalSalary: toNumber(row.total_salaire),
        totalMargin: toNumber(row.total_benefice),
        totalBillable: toNumber(row.total_titan),
        firstWorkDate: row.date_travail,
        lastWorkDate: row.date_travail,
      });
    });

    return [...buckets.values()].sort((left, right) => {
      if (left.companyContext !== right.companyContext) {
        return left.companyContext.localeCompare(right.companyContext);
      }

      return left.employeNom.localeCompare(right.employeNom);
    });
  }, [filteredRows]);

  const companyAggregates = useMemo<CompanyAggregate[]>(() => {
    const buckets = new Map<AccountRequestCompany, CompanyAggregate>();

    employeeAggregates.forEach((row) => {
      const existing = buckets.get(row.companyContext);

      if (existing) {
        existing.employeeCount += 1;
        existing.totalHours += row.totalHours;
        existing.totalSalary += row.totalSalary;
        existing.totalMargin += row.totalMargin;
        existing.totalBillable += row.totalBillable;
        return;
      }

      buckets.set(row.companyContext, {
        companyContext: row.companyContext,
        employeeCount: 1,
        totalHours: row.totalHours,
        totalSalary: row.totalSalary,
        totalMargin: row.totalMargin,
        totalBillable: row.totalBillable,
      });
    });

    return ACCOUNT_REQUEST_COMPANIES.map((company) => buckets.get(company.value))
      .filter((item): item is CompanyAggregate => Boolean(item));
  }, [employeeAggregates]);

  const overallTotals = useMemo(() => {
    return companyAggregates.reduce(
      (accumulator, row) => ({
        employeeCount: accumulator.employeeCount + row.employeeCount,
        totalHours: accumulator.totalHours + row.totalHours,
        totalSalary: accumulator.totalSalary + row.totalSalary,
        totalMargin: accumulator.totalMargin + row.totalMargin,
        totalBillable: accumulator.totalBillable + row.totalBillable,
      }),
      {
        employeeCount: 0,
        totalHours: 0,
        totalSalary: 0,
        totalMargin: 0,
        totalBillable: 0,
      }
    );
  }, [companyAggregates]);

  function exportEmployeeSummaryCsv() {
    const header = [
      "Compagnie",
      "Employe",
      "Employe ID",
      "Periode debut",
      "Periode fin",
      "Heures totales",
      "Salaire total",
      "Benefice total",
      "Total facturable",
    ];

    const lines = [
      toCsvLine(header),
      ...employeeAggregates.map((row) =>
        toCsvLine([
          getCompanyLabel(row.companyContext),
          row.employeNom,
          row.employeId,
          row.firstWorkDate ?? "",
          row.lastWorkDate ?? "",
          row.totalHours.toFixed(2),
          row.totalSalary.toFixed(2),
          row.totalMargin.toFixed(2),
          row.totalBillable.toFixed(2),
        ])
      ),
    ];

    downloadCsv(
      `paie-compagnies-employes-${dateFrom || "debut"}-${dateTo || "fin"}.csv`,
      lines.join("\n")
    );
  }

  function exportDetailedRowsCsv() {
    const header = [
      "Date",
      "Compagnie",
      "Employe",
      "Employe ID",
      "Heures",
      "Salaire",
      "Benefice",
      "Facturable",
    ];

    const lines = [
      toCsvLine(header),
      ...filteredRows.map((row) =>
        toCsvLine([
          row.date_travail ?? "",
          row.company_context ? getCompanyLabel(row.company_context) : "",
          row.employe_nom ?? "",
          String(row.employe_id ?? ""),
          getPayableHours(row).toFixed(2),
          toNumber(row.total_salaire).toFixed(2),
          toNumber(row.total_benefice).toFixed(2),
          toNumber(row.total_titan).toFixed(2),
        ])
      ),
    ];

    downloadCsv(
      `paie-compagnies-detail-${dateFrom || "debut"}-${dateTo || "fin"}.csv`,
      lines.join("\n")
    );
  }

  if (accessLoading || (!blocked && loading)) {
    return (
      <div className="page-container">
        <HeaderTagora
          title="Paie par compagnie"
          subtitle="Ventilation des heures et des couts par compagnie"
        />
        <AccessNotice description="Verification des acces et chargement des donnees de paie en cours." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (blocked) {
    return (
      <div className="page-container">
        <HeaderTagora
          title="Paie par compagnie"
          subtitle="Ventilation des heures et des couts par compagnie"
        />
        <AccessNotice description="La permission terrain n est pas active sur ce compte direction. L ecran paie par compagnie reste masque." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora
        title="Paie par compagnie"
        subtitle="Synthese par employe et par compagnie, avec export CSV compatible Excel"
      />

      {errorMessage ? (
        <div style={{ marginTop: 24 }}>
          <AccessNotice title="Chargement limite" description={errorMessage} />
        </div>
      ) : null}

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            alignItems: "end",
          }}
        >
          <label className="tagora-field">
            <span className="tagora-label">Compagnie</span>
            <select
              value={companyFilter}
              onChange={(e) =>
                setCompanyFilter(e.target.value as AccountRequestCompany | "")
              }
              className="tagora-input"
            >
              <option value="">Toutes les compagnies</option>
              {ACCOUNT_REQUEST_COMPANIES.map((company) => (
                <option key={company.value} value={company.value}>
                  {company.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tagora-field">
            <span className="tagora-label">Periode debut</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="tagora-input"
            />
          </label>

          <label className="tagora-field">
            <span className="tagora-label">Periode fin</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="tagora-input"
            />
          </label>

          <div className="actions-row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="tagora-dark-outline-action"
              onClick={exportEmployeeSummaryCsv}
              disabled={employeeAggregates.length === 0}
            >
              Export employes CSV
            </button>
            <button
              type="button"
              className="tagora-dark-action"
              onClick={exportDetailedRowsCsv}
              disabled={filteredRows.length === 0}
            >
              Export detail CSV
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 24,
        }}
      >
        <StatCard label="Employes sur la periode" value={String(overallTotals.employeeCount)} />
        <StatCard label="Heures totales" value={formatHours(overallTotals.totalHours)} />
        <StatCard label="Salaire total" value={formatMoney(overallTotals.totalSalary)} />
        <StatCard label="Benefice total" value={formatMoney(overallTotals.totalMargin)} />
        <StatCard label="Total facturable" value={formatMoney(overallTotals.totalBillable)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(300px, 0.9fr) minmax(0, 1.5fr)",
          gap: 24,
          alignItems: "start",
          marginTop: 24,
        }}
      >
        <section className="tagora-panel">
          <h2 className="section-title" style={{ marginBottom: 14 }}>
            Totaux par compagnie
          </h2>
          <div style={{ display: "grid", gap: 14 }}>
            {companyAggregates.length === 0 ? (
              <p className="tagora-note">
                Aucune ligne de paie disponible sur la periode selectionnee.
              </p>
            ) : (
              companyAggregates.map((row) => (
                <div key={row.companyContext} className="tagora-panel" style={{ margin: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div className="section-title" style={{ marginBottom: 6 }}>
                        {getCompanyLabel(row.companyContext)}
                      </div>
                      <div className="tagora-note">
                        {row.employeeCount} employe{row.employeeCount > 1 ? "s" : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        fontWeight: 700,
                      }}
                    >
                      {formatHours(row.totalHours)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 12,
                      marginTop: 16,
                    }}
                  >
                    <MiniStat label="Salaire" value={formatMoney(row.totalSalary)} />
                    <MiniStat label="Benefice" value={formatMoney(row.totalMargin)} />
                    <MiniStat label="Facturable" value={formatMoney(row.totalBillable)} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="tagora-panel">
          <h2 className="section-title" style={{ marginBottom: 14 }}>
            Totaux par employe
          </h2>
          <p className="tagora-note" style={{ marginBottom: 16 }}>
            Cette vue est prete pour un export CSV vers Excel par employe et par compagnie.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Compagnie</th>
                  <th style={thStyle}>Employe</th>
                  <th style={thStyle}>Periode debut</th>
                  <th style={thStyle}>Periode fin</th>
                  <th style={thStyle}>Heures</th>
                  <th style={thStyle}>Salaire</th>
                  <th style={thStyle}>Benefice</th>
                  <th style={thStyle}>Facturable</th>
                </tr>
              </thead>
              <tbody>
                {employeeAggregates.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={8}>
                      Aucune donnee de paie disponible sur cette combinaison compagnie / periode.
                    </td>
                  </tr>
                ) : (
                  employeeAggregates.map((row) => (
                    <tr key={row.key}>
                      <td style={tdStyle}>{getCompanyLabel(row.companyContext)}</td>
                      <td style={tdStyle}>{row.employeNom}</td>
                      <td style={tdStyle}>{row.firstWorkDate ?? "-"}</td>
                      <td style={tdStyle}>{row.lastWorkDate ?? "-"}</td>
                      <td style={tdStyle}>{formatHours(row.totalHours)}</td>
                      <td style={tdStyle}>{formatMoney(row.totalSalary)}</td>
                      <td style={tdStyle}>{formatMoney(row.totalMargin)}</td>
                      <td style={tdStyle}>{formatMoney(row.totalBillable)}</td>
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
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: "12px 14px",
        background: "#f8fafc",
      }}
    >
      <div className="tagora-label">{label}</div>
      <div style={{ marginTop: 6, fontWeight: 700, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 920,
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
