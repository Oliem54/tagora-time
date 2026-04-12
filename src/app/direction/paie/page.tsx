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
import { getProfitTone } from "@/app/lib/terrain-gps";

type PayrollSummaryRow = {
  company_context: AccountRequestCompany | null;
  employe_id: string | number | null;
  employe_nom: string | null;
  first_work_date: string | null;
  last_work_date: string | null;
  total_hours: number | null;
  total_salary: number | null;
  total_margin: number | null;
  total_billable: number | null;
};

type CompanyTotals = {
  companyContext: AccountRequestCompany;
  totalHours: number;
  totalSalary: number;
  totalMargin: number;
  totalBillable: number;
  profit: number;
  marginPercent: number;
};

type EnrichedPayrollRow = PayrollSummaryRow & {
  profit: number;
  marginPercent: number;
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

function computeProfit(totalBillable: number, totalSalary: number) {
  return totalBillable - totalSalary;
}

function computeMarginPercent(totalMargin: number, totalBillable: number) {
  if (!totalBillable) return 0;
  return (totalMargin / totalBillable) * 100;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)} %`;
}

function toCsvLine(values: Array<string | number>) {
  return values
    .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
    .join(",");
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

function getCompanyBadgeStyle(company: AccountRequestCompany) {
  if (company === "oliem_solutions") {
    return {
      color: "#0f766e",
      background: "#ccfbf1",
      border: "1px solid #5eead4",
    };
  }

  return {
    color: "#1d4ed8",
    background: "#dbeafe",
    border: "1px solid #93c5fd",
  };
}

export default function DirectionPayrollPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [rows, setRows] = useState<PayrollSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [companyFilter, setCompanyFilter] = useState<AccountRequestCompany | "">("");
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());

  const blocked = !accessLoading && !!user && !hasPermission("terrain");
  const userId = user?.id ?? null;

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("payroll_company_summary")
      .select(
        "company_context, employe_id, employe_nom, first_work_date, last_work_date, total_hours, total_salary, total_margin, total_billable"
      );

    if (error) {
      setRows([]);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setRows(
      (data ?? []).map((row: Record<string, unknown>) => ({
        company_context:
          row.company_context === "oliem_solutions" ||
          row.company_context === "titan_produits_industriels"
            ? (row.company_context as AccountRequestCompany)
            : null,
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
        total_salary: toNumber(row.total_salary),
        total_margin: toNumber(row.total_margin),
        total_billable: toNumber(row.total_billable),
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

  const filteredRows = useMemo<EnrichedPayrollRow[]>(() => {
    return rows
      .filter((row) => {
        if (!row.company_context) return false;
        if (companyFilter && row.company_context !== companyFilter) return false;

        const firstDate = row.first_work_date ?? "";
        const lastDate = row.last_work_date ?? "";

        if (dateFrom && lastDate && lastDate < dateFrom) return false;
        if (dateTo && firstDate && firstDate > dateTo) return false;

        return true;
      })
      .map((row) => {
        const totalSalary = toNumber(row.total_salary);
        const totalMargin = toNumber(row.total_margin);
        const totalBillable = toNumber(row.total_billable);

        return {
          ...row,
          profit: computeProfit(totalBillable, totalSalary),
          marginPercent: computeMarginPercent(totalMargin, totalBillable),
        };
      })
      .sort((left, right) => {
        if (right.profit !== left.profit) {
          return right.profit - left.profit;
        }

        return (left.employe_nom ?? "").localeCompare(right.employe_nom ?? "");
      });
  }, [companyFilter, dateFrom, dateTo, rows]);

  const companyTotals = useMemo<CompanyTotals[]>(() => {
    const buckets = new Map<AccountRequestCompany, CompanyTotals>();

    filteredRows.forEach((row) => {
      if (!row.company_context) return;

      const existing = buckets.get(row.company_context);

      if (existing) {
        existing.totalHours += toNumber(row.total_hours);
        existing.totalSalary += toNumber(row.total_salary);
        existing.totalMargin += toNumber(row.total_margin);
        existing.totalBillable += toNumber(row.total_billable);
        existing.profit += row.profit;
        return;
      }

      const totalBillable = toNumber(row.total_billable);
      const totalSalary = toNumber(row.total_salary);
      const totalMargin = toNumber(row.total_margin);

      buckets.set(row.company_context, {
        companyContext: row.company_context,
        totalHours: toNumber(row.total_hours),
        totalSalary,
        totalMargin,
        totalBillable,
        profit: computeProfit(totalBillable, totalSalary),
        marginPercent: computeMarginPercent(totalMargin, totalBillable),
      });
    });

    return ACCOUNT_REQUEST_COMPANIES.map((company) => buckets.get(company.value))
      .filter((item): item is CompanyTotals => Boolean(item))
      .map((item) => ({
        ...item,
        marginPercent: computeMarginPercent(item.totalMargin, item.totalBillable),
      }))
      .sort((left, right) => right.profit - left.profit);
  }, [filteredRows]);

  const overallTotals = useMemo(() => {
    return companyTotals.reduce(
      (accumulator, item) => ({
        totalHours: accumulator.totalHours + item.totalHours,
        totalSalary: accumulator.totalSalary + item.totalSalary,
        totalMargin: accumulator.totalMargin + item.totalMargin,
        totalBillable: accumulator.totalBillable + item.totalBillable,
        profit: accumulator.profit + item.profit,
      }),
      {
        totalHours: 0,
        totalSalary: 0,
        totalMargin: 0,
        totalBillable: 0,
        profit: 0,
      }
    );
  }, [companyTotals]);

  const topCompany = companyTotals[0] ?? null;
  const topEmployee = filteredRows[0] ?? null;
  const bottomEmployee = filteredRows[filteredRows.length - 1] ?? null;

  function handleExportCsv() {
    const lines = [
      toCsvLine([
        "Nom",
        "Compagnie",
        "Total heures",
        "Total salaire",
        "Total marge",
        "Total facturable",
        "Profit",
        "% marge",
        "Periode debut",
        "Periode fin",
      ]),
      ...filteredRows.map((row) =>
        toCsvLine([
          row.employe_nom ?? "Employe non defini",
          row.company_context ? getCompanyLabel(row.company_context) : "",
          toNumber(row.total_hours).toFixed(2),
          toNumber(row.total_salary).toFixed(2),
          toNumber(row.total_margin).toFixed(2),
          toNumber(row.total_billable).toFixed(2),
          row.profit.toFixed(2),
          row.marginPercent.toFixed(2),
          row.first_work_date ?? "",
          row.last_work_date ?? "",
        ])
      ),
    ];

    downloadCsv(
      `paie-direction-${companyFilter || "toutes-compagnies"}-${dateFrom || "debut"}-${dateTo || "fin"}.csv`,
      lines.join("\n")
    );
  }

  if (accessLoading || (!blocked && loading)) {
    return (
      <div className="page-container">
        <HeaderTagora
          title="Paie"
          subtitle="Paie par compagnie"
        />
        <AccessNotice description="Verification des acces et chargement de la vue payroll_company_summary en cours." />
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
          title="Paie"
          subtitle="Paie par compagnie"
        />
        <AccessNotice description="La permission terrain n est pas active sur ce compte direction. Le module paie reste masque." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora
        title="Paie"
        subtitle="Paie par compagnie depuis payroll_company_summary"
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
            <span className="tagora-label">Date debut</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="tagora-input"
            />
          </label>

          <label className="tagora-field">
            <span className="tagora-label">Date fin</span>
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
              onClick={() => void loadRows()}
            >
              Actualiser
            </button>
            <button
              type="button"
              className="tagora-dark-action"
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
            >
              Export CSV
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
        <StatCard label="Heures totales" value={formatHours(overallTotals.totalHours)} />
        <StatCard label="Salaire total" value={formatMoney(overallTotals.totalSalary)} />
        <StatCard label="Marge totale" value={formatMoney(overallTotals.totalMargin)} />
        <StatCard label="Facturable total" value={formatMoney(overallTotals.totalBillable)} />
        <StatCard
          label="Profit global"
          value={formatMoney(overallTotals.profit)}
          tone={getProfitTone(overallTotals.profit, computeMarginPercent(overallTotals.totalMargin, overallTotals.totalBillable))}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        <SummaryCard
          label="Compagnie la plus rentable"
          value={topCompany ? getCompanyLabel(topCompany.companyContext) : "-"}
          detail={topCompany ? formatMoney(topCompany.profit) : "Aucune donnee"}
        />
        <SummaryCard
          label="Employe le plus rentable"
          value={topEmployee?.employe_nom ?? "-"}
          detail={topEmployee ? formatMoney(topEmployee.profit) : "Aucune donnee"}
        />
        <SummaryCard
          label="Employe le moins rentable"
          value={bottomEmployee?.employe_nom ?? "-"}
          detail={bottomEmployee ? formatMoney(bottomEmployee.profit) : "Aucune donnee"}
        />
      </div>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 14 }}>
          Resume par compagnie
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {companyTotals.length === 0 ? (
            <p className="tagora-note">
              Aucune donnee disponible pour la periode selectionnee.
            </p>
          ) : (
            companyTotals.map((item) => (
              <div key={item.companyContext} className="tagora-panel" style={{ margin: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      ...getCompanyBadgeStyle(item.companyContext),
                      borderRadius: 999,
                      padding: "7px 12px",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {getCompanyLabel(item.companyContext)}
                  </span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>
                    {formatHours(item.totalHours)}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <MiniStat label="Salaire total" value={formatMoney(item.totalSalary)} />
                  <MiniStat label="Marge totale" value={formatMoney(item.totalMargin)} />
                  <MiniStat label="Facturable total" value={formatMoney(item.totalBillable)} />
                  <MiniStat
                    label="Profit"
                    value={formatMoney(item.profit)}
                    tone={getProfitTone(item.profit, item.marginPercent)}
                  />
                  <MiniStat
                    label="% marge"
                    value={formatPercent(item.marginPercent)}
                    tone={getProfitTone(item.profit, item.marginPercent)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div>
            <h2 className="section-title" style={{ marginBottom: 8 }}>
              Detail par employe
            </h2>
            <p className="tagora-note">
              Tri par profit decroissant par defaut.
            </p>
          </div>
          <div className="tagora-note">
            {filteredRows.length} ligne{filteredRows.length > 1 ? "s" : ""}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Nom</th>
                <th style={thStyle}>Compagnie</th>
                <th style={thStyle}>Total heures</th>
                <th style={thStyle}>Total salaire</th>
                <th style={thStyle}>Total marge</th>
                <th style={thStyle}>Total facturable</th>
                <th style={thStyle}>Profit</th>
                <th style={thStyle}>% marge</th>
                <th style={thStyle}>Periode</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={9}>
                    Aucune ligne de paie sur la periode selectionnee.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr
                    key={`${row.company_context}-${row.employe_id}-${index}`}
                    style={{
                      background: index % 2 === 0 ? "#ffffff" : "#f8fafc",
                    }}
                  >
                    <td style={tdStyle}>{row.employe_nom ?? "Employe non defini"}</td>
                    <td style={tdStyle}>
                      {row.company_context ? (
                        <span
                          style={{
                            ...getCompanyBadgeStyle(row.company_context),
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          {getCompanyLabel(row.company_context)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={tdStyle}>{formatHours(toNumber(row.total_hours))}</td>
                    <td style={tdStyle}>{formatMoney(toNumber(row.total_salary))}</td>
                    <td style={tdStyle}>{formatMoney(toNumber(row.total_margin))}</td>
                    <td style={tdStyle}>{formatMoney(toNumber(row.total_billable))}</td>
                    <td style={{ ...tdStyle, ...getProfitTone(row.profit, row.marginPercent) }}>
                      {formatMoney(row.profit)}
                    </td>
                    <td style={{ ...tdStyle, ...getProfitTone(row.profit, row.marginPercent) }}>
                      {formatPercent(row.marginPercent)}
                    </td>
                    <td style={tdStyle}>
                      {row.first_work_date ?? "-"} {"->"} {row.last_work_date ?? "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: React.CSSProperties;
}) {
  return (
    <div className="tagora-panel" style={{ margin: 0, ...(tone ?? {}) }}>
      <div className="tagora-label">{label}</div>
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
        {value}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="tagora-panel" style={{ margin: 0 }}>
      <div className="tagora-label">{label}</div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
        {value}
      </div>
      <div className="tagora-note" style={{ marginTop: 6 }}>
        {detail}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "10px 12px",
        background: "#f8fafc",
        ...(tone ?? {}),
      }}
    >
      <span className="tagora-label">{label}</span>
      <span style={{ fontWeight: 700, color: "#0f172a" }}>{value}</span>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#334155",
  background: "#f8fafc",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "top",
};
