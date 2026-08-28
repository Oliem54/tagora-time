"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Lock,
  Printer,
  RefreshCw,
  Save,
  Send,
} from "lucide-react";
import AccessNotice from "@/app/components/AccessNotice";
import HorodateurDirectionPageShell from "@/app/direction/horodateur/HorodateurDirectionPageShell";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  collectPayrollAccountantHumanNotes,
  formatPayrollDateFrCa,
  formatPayrollHours,
  formatPayrollTimeFrCa,
  payrollCompletenessLabel,
  payrollReportStatusLabel,
} from "@/app/lib/horodateur-v1/payroll-accountant-export.shared";
import {
  isInclusiveFourteenDayPeriod,
  payrollOperationalErrorMessage,
} from "@/app/lib/horodateur-v1/payroll-accountant-operational.shared";
import type { PayrollAccountantSnapshotPayload } from "@/app/lib/horodateur-v1/payroll-accountant-snapshot.shared";

type CompanyOption = {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
};

type CycleOption = {
  id: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  kind: string;
  status: string;
};

type PersistMeta = {
  reportId: string;
  revision: number;
  status: "draft" | "issued";
  sourceHash: string;
  completenessStatus: string;
  idempotent: boolean;
};

type PreviewState = {
  payload: PayrollAccountantSnapshotPayload;
  totals: PayrollAccountantSnapshotPayload["companyTotals"];
  sourceHash: string;
  completenessStatus: PayrollAccountantSnapshotPayload["completenessStatus"];
  canIssue: boolean;
  datesAdjustedFromCycle: boolean;
};

function completenessTone(
  status: PayrollAccountantSnapshotPayload["completenessStatus"]
): "success" | "warning" | "danger" {
  if (status === "complete") return "success";
  if (status === "forced") return "warning";
  return "danger";
}

async function readApiError(res: Response) {
  try {
    const body = (await res.json()) as { code?: string; error?: string };
    if (body.code) return payrollOperationalErrorMessage(body.code);
    if (body.error) return body.error;
  } catch {
    /* ignore */
  }
  return "Erreur serveur.";
}

async function downloadBlob(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const header = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(header);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DirectionPayrollAccountantReportClient() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canRead = hasPermission("horodateur_payroll_read");
  const canManagePermission = hasPermission("horodateur_payroll_manage");

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [canManage, setCanManage] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [persistMeta, setPersistMeta] = useState<PersistMeta | null>(null);
  const [latestIssuedHash, setLatestIssuedHash] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forceReason, setForceReason] = useState("");

  const selection = useMemo(
    () => ({
      organizationCompanyId: companyId,
      periodStart,
      periodEnd,
      timezone,
      cycleId: cycleId || null,
    }),
    [companyId, cycleId, periodEnd, periodStart, timezone]
  );

  const biweekly = Boolean(
    periodStart && periodEnd && isInclusiveFourteenDayPeriod(periodStart, periodEnd)
  );
  const issuedLocked = Boolean(
    persistMeta?.status === "issued" ||
      (preview && latestIssuedHash && preview.sourceHash === latestIssuedHash)
  );

  const loadContext = useCallback(async (nextCompanyId?: string) => {
    setLoadingContext(true);
    setErrorMessage("");
    const res = await fetch("/api/direction/horodateur/payroll/context", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationCompanyId: nextCompanyId || undefined,
      }),
    });
    if (!res.ok) {
      setErrorMessage(await readApiError(res));
      setLoadingContext(false);
      return;
    }
    const body = (await res.json()) as {
      companies: CompanyOption[];
      selectedCompanyId: string | null;
      cycles: CycleOption[];
      selectedCycleId: string | null;
      defaultPeriod: {
        periodStart: string;
        periodEnd: string;
        timezone: string;
      };
      canManage: boolean;
      latestIssued: { sourceHash: string } | null;
    };
    setCompanies(body.companies ?? []);
    setCycles(body.cycles ?? []);
    setCompanyId(body.selectedCompanyId ?? "");
    setCycleId(body.selectedCycleId ?? "");
    setPeriodStart(body.defaultPeriod.periodStart);
    setPeriodEnd(body.defaultPeriod.periodEnd);
    setTimezone(body.defaultPeriod.timezone);
    setCanManage(Boolean(body.canManage));
    setLatestIssuedHash(body.latestIssued?.sourceHash ?? null);
    setLoadingContext(false);
  }, []);

  const refreshPreview = useCallback(async () => {
    if (!companyId || !periodStart || !periodEnd) {
      setErrorMessage("Choisissez une entreprise et une période.");
      return;
    }
    setLoadingPreview(true);
    setErrorMessage("");
    setMessage("");
    const res = await fetch("/api/direction/horodateur/payroll/preview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...selection,
        forceEmitReason: forceReason.trim() || null,
      }),
    });
    if (!res.ok) {
      setPreview(null);
      setErrorMessage(await readApiError(res));
      setLoadingPreview(false);
      return;
    }
    const body = (await res.json()) as PreviewState & { canManage?: boolean };
    setPreview({
      payload: body.payload,
      totals: body.totals,
      sourceHash: body.sourceHash,
      completenessStatus: body.completenessStatus,
      canIssue: body.canIssue,
      datesAdjustedFromCycle: body.datesAdjustedFromCycle,
    });
    if (typeof body.canManage === "boolean") {
      setCanManage(body.canManage);
    }
    setLoadingPreview(false);
  }, [companyId, forceReason, periodEnd, periodStart, selection]);

  useEffect(() => {
    if (accessLoading || !user || !canRead) return;
    void loadContext();
  }, [accessLoading, canRead, loadContext, user]);

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirmOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  async function persist(kind: "draft" | "issue") {
    setBusy(true);
    setErrorMessage("");
    setMessage("");
    const res = await fetch(
      kind === "issue"
        ? "/api/direction/horodateur/payroll/issue"
        : "/api/direction/horodateur/payroll/draft",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...selection,
          forceEmitReason: forceReason.trim() || null,
          confirmIssue: kind === "issue" ? true : undefined,
        }),
      }
    );
    if (!res.ok) {
      setErrorMessage(await readApiError(res));
      setBusy(false);
      return;
    }
    const body = (await res.json()) as { result: PersistMeta };
    setPersistMeta(body.result);
    if (body.result.status === "issued") {
      setLatestIssuedHash(body.result.sourceHash);
      setMessage(
        body.result.idempotent
          ? `Rapport déjà émis (révision ${body.result.revision}).`
          : `Rapport émis (révision ${body.result.revision}).`
      );
    } else {
      setMessage(
        body.result.idempotent
          ? "Brouillon déjà à jour."
          : "Brouillon enregistré."
      );
    }
    setConfirmOpen(false);
    setBusy(false);
    await refreshPreview();
  }

  async function exportFile(kind: "csv" | "pdf") {
    setBusy(true);
    setErrorMessage("");
    const res = await fetch(`/api/direction/horodateur/payroll/export/${kind}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...selection,
        reportId:
          persistMeta && preview && persistMeta.sourceHash === preview.sourceHash
            ? persistMeta.reportId
            : null,
      }),
    });
    if (!res.ok) {
      setErrorMessage(await readApiError(res));
      setBusy(false);
      return;
    }
    await downloadBlob(
      res,
      kind === "csv" ? "horora-rapport-comptable.csv" : "horora-rapport-comptable.pdf"
    );
    setBusy(false);
  }

  const selectedCompanyName =
    companies.find((company) => company.id === companyId)?.name ?? "";

  if (accessLoading || (canRead && loadingContext)) {
    return (
      <HorodateurDirectionPageShell
        active="paie"
        subtitle="Préparer, vérifier, émettre et exporter le rapport comptable."
      >
        <p className="horora-direction-loading">Chargement du rapport comptable…</p>
      </HorodateurDirectionPageShell>
    );
  }

  if (!user || !canRead) {
    return (
      <HorodateurDirectionPageShell
        active="paie"
        subtitle="Rapport comptable de paie HORORA."
      >
        <AccessNotice description="La permission horodateur_payroll_read est requise." />
      </HorodateurDirectionPageShell>
    );
  }

  const manageAllowed = canManage || canManagePermission;
  const selectedCycle = cycles.find((cycle) => cycle.id === cycleId) ?? null;
  const datesMatchCycle = Boolean(
    selectedCycle &&
      selectedCycle.periodStart === periodStart &&
      selectedCycle.periodEnd === periodEnd
  );
  const issueDisabled =
    busy || issuedLocked || !manageAllowed || !datesMatchCycle || !cycleId;

  const reportStatus = (
    <div className="horora-payroll-status">
      {preview ? (
        <>
          <span
            className={`horora-payroll-chip horora-payroll-chip--${completenessTone(preview.completenessStatus)}`}
          >
            {payrollCompletenessLabel(preview.completenessStatus)}
          </span>
          <span
            className={`horora-payroll-chip horora-payroll-chip--${persistMeta?.status === "issued" ? "success" : "info"}`}
          >
            {payrollReportStatusLabel(persistMeta?.status ?? "preview")}
          </span>
          {persistMeta ? (
            <span className="horora-payroll-chip">Révision {persistMeta.revision}</span>
          ) : null}
        </>
      ) : (
        <span className="horora-payroll-chip">En attente d&apos;aperçu</span>
      )}
    </div>
  );

  const primaryAction = (
    <button
      type="button"
      className="horora-btn horora-btn-primary"
      onClick={() => setConfirmOpen(true)}
      disabled={issueDisabled}
    >
      <Send size={16} aria-hidden />
      Émettre
    </button>
  );

  return (
    <HorodateurDirectionPageShell
      active="paie"
      title="Rapport comptable"
      subtitle="Préparer, vérifier, émettre et exporter les heures payables de la période."
      companyLabel={selectedCompanyName || undefined}
      status={reportStatus}
      primaryAction={primaryAction}
    >
      <section className="horora-payroll-accountant" aria-labelledby="horora-payroll-title">
        <h2 id="horora-payroll-title" className="horora-visually-hidden">
          Rapport comptable
        </h2>

        <div className="horora-payroll-filterbar" role="search">
          <label className="horora-payroll-filter">
            <span>Entreprise</span>
            <select
              value={companyId}
              onChange={(event) => {
                const next = event.target.value;
                setCompanyId(next);
                setPreview(null);
                void loadContext(next);
              }}
            >
              {companies.length === 0 ? (
                <option value="">Aucune entreprise</option>
              ) : null}
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <label className="horora-payroll-filter">
            <span>Début</span>
            <input
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
            />
          </label>
          <label className="horora-payroll-filter">
            <span>Fin</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </label>
          <label className="horora-payroll-filter">
            <span>Cycle</span>
            <select
              value={cycleId}
              onChange={(event) => {
                const next = event.target.value;
                setCycleId(next);
                const cycle = cycles.find((item) => item.id === next);
                if (cycle) {
                  setPeriodStart(cycle.periodStart);
                  setPeriodEnd(cycle.periodEnd);
                  setTimezone(cycle.timezone);
                }
              }}
            >
              <option value="">Aucun cycle</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {formatPayrollDateFrCa(cycle.periodStart)} → {formatPayrollDateFrCa(cycle.periodEnd)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="horora-btn horora-btn-secondary horora-payroll-refresh"
            onClick={() => void refreshPreview()}
            disabled={loadingPreview || busy}
          >
            <RefreshCw size={16} aria-hidden />
            Actualiser
          </button>
        </div>

        <p className="horora-payroll-hint">
          Cycle par défaut : deux semaines inclusives.
          {biweekly ? " Période de 14 jours confirmée." : " Période personnalisée."}
          {selectedCycle && !datesMatchCycle
            ? " Les dates diffèrent du cycle : l'enregistrement exigera le calendrier exact du cycle."
            : null}
        </p>

        <div className="horora-payroll-actions" role="toolbar" aria-label="Actions du rapport">
          <button
            type="button"
            className="horora-btn horora-btn-secondary"
            onClick={() => void persist("draft")}
            disabled={busy || issuedLocked || !datesMatchCycle || !cycleId}
          >
            <Save size={16} aria-hidden />
            Enregistrer le brouillon
          </button>
          <div className="horora-payroll-actions-export">
            <button
              type="button"
              className="horora-btn horora-btn-ghost"
              onClick={() => void exportFile("csv")}
              disabled={busy || !preview}
              aria-label="Télécharger CSV"
            >
              <FileSpreadsheet size={16} aria-hidden />
              CSV
            </button>
            <button
              type="button"
              className="horora-btn horora-btn-ghost"
              onClick={() => void exportFile("pdf")}
              disabled={busy || !preview}
              aria-label="Télécharger PDF"
            >
              <Download size={16} aria-hidden />
              PDF
            </button>
            <button
              type="button"
              className="horora-btn horora-btn-ghost"
              onClick={() => window.print()}
              disabled={!preview}
            >
              <Printer size={16} aria-hidden />
              Imprimer
            </button>
          </div>
        </div>

        {issuedLocked ? (
          <p className="horora-payroll-lock" role="status">
            <Lock size={16} aria-hidden />
            Rapport émis verrouillé. Aucune modification n&apos;est possible.
          </p>
        ) : null}
        {errorMessage ? (
          <p className="horora-callout horora-callout-danger" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {message ? (
          <p className="horora-callout horora-callout-success" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}

        {loadingPreview ? (
          <p className="horora-direction-loading">Chargement de l&apos;aperçu comptable…</p>
        ) : null}

        {!loadingPreview && !preview ? (
          <p className="horora-callout">
            Actualisez l&apos;aperçu pour charger les heures de la période.
          </p>
        ) : null}

        {preview ? (
          <article className="horora-payroll-report" aria-labelledby="horora-payroll-report-title">
            <header className="horora-payroll-report-head">
              <div>
                <h3 id="horora-payroll-report-title">Aperçu comptable</h3>
                <p>
                  {preview.payload.organizationName} — {preview.payload.organizationCompanyName}
                </p>
                <p>
                  {formatPayrollDateFrCa(preview.payload.periodStart)} au{" "}
                  {formatPayrollDateFrCa(preview.payload.periodEnd)}
                </p>
              </div>
            </header>

            {preview.completenessStatus === "blocked_incomplete" ? (
              <p className="horora-callout horora-callout-danger">
                Émission bloquée. Des pointages sont incomplets. Corrigez-les ou forcez
                l&apos;émission avec un motif.
              </p>
            ) : null}

            <div className="horora-payroll-kpi-grid" aria-label="Totaux généraux">
              <article className="horora-payroll-kpi">
                <p className="horora-payroll-kpi-label">Heures régulières</p>
                <p className="horora-payroll-kpi-value">
                  {formatPayrollHours(preview.totals.regularMinutes)}
                  <span> h</span>
                </p>
              </article>
              <article className="horora-payroll-kpi">
                <p className="horora-payroll-kpi-label">Heures supplémentaires</p>
                <p className="horora-payroll-kpi-value">
                  {formatPayrollHours(preview.totals.overtimeMinutes)}
                  <span> h</span>
                </p>
              </article>
              <article className="horora-payroll-kpi">
                <p className="horora-payroll-kpi-label">Heures payables</p>
                <p className="horora-payroll-kpi-value">
                  {formatPayrollHours(preview.totals.payableMinutes)}
                  <span> h</span>
                </p>
              </article>
              <article className="horora-payroll-kpi">
                <p className="horora-payroll-kpi-label">Employés</p>
                <p className="horora-payroll-kpi-value">{preview.totals.employeeCount}</p>
              </article>
            </div>

            {preview.payload.employees.length === 0 ? (
              <p className="horora-callout">Aucune heure sur la période sélectionnée.</p>
            ) : (
              preview.payload.employees.map((employee) => (
                <section
                  key={employee.employeeId}
                  className="horora-payroll-employee"
                  aria-labelledby={`employee-${employee.employeeId}`}
                >
                  <header className="horora-payroll-employee-head">
                    <h4 id={`employee-${employee.employeeId}`}>
                      {employee.employeeName ?? `Employé ${employee.employeeId}`}
                    </h4>
                    <p className="horora-payroll-employee-total">
                      <span>
                        Régulier {formatPayrollHours(employee.totals.regularMinutes)} h
                      </span>
                      <span>
                        Supp. {formatPayrollHours(employee.totals.overtimeMinutes)} h
                      </span>
                      <span>
                        Payable {formatPayrollHours(employee.totals.payableMinutes)} h
                      </span>
                    </p>
                  </header>
                  {employee.weeks.map((week) => (
                    <div
                      key={`${employee.employeeId}-${week.weekStart}`}
                      className="horora-payroll-week"
                    >
                      <h5>
                        Semaine {formatPayrollDateFrCa(week.weekStart)} —{" "}
                        {formatPayrollDateFrCa(week.weekEnd)}
                        <span>
                          R {formatPayrollHours(week.regularMinutes)} h · S{" "}
                          {formatPayrollHours(week.overtimeMinutes)} h
                        </span>
                      </h5>
                      <div className="horora-payroll-table-wrap">
                        <table className="horora-payroll-table">
                          <thead>
                            <tr>
                              <th scope="col">Journée</th>
                              <th scope="col">Entrée</th>
                              <th scope="col">Sortie</th>
                              <th scope="col" className="is-numeric">
                                Régulier
                              </th>
                              <th scope="col" className="is-numeric">
                                Supp.
                              </th>
                              <th scope="col" className="is-numeric">
                                Pauses
                              </th>
                              <th scope="col">Statut</th>
                              <th scope="col">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {week.days.map((day) => {
                              const notes =
                                collectPayrollAccountantHumanNotes([
                                  ...day.corrections.map((item) => item.notes ?? "Correction"),
                                  ...day.notes,
                                ]).join(" · ") || "—";
                              const breakMinutes =
                                day.paidBreakMinutes +
                                day.unpaidBreakMinutes +
                                day.unpaidLunchMinutes;
                              return (
                                <tr
                                  key={day.workDate}
                                  className={day.hasIncompletePunch ? "is-incomplete" : undefined}
                                >
                                  <th scope="row">{formatPayrollDateFrCa(day.workDate)}</th>
                                  <td>
                                    {formatPayrollTimeFrCa(
                                      day.punchInAt,
                                      preview.payload.timezone
                                    ) || "—"}
                                  </td>
                                  <td>
                                    {formatPayrollTimeFrCa(
                                      day.punchOutAt,
                                      preview.payload.timezone
                                    ) || "—"}
                                  </td>
                                  <td className="is-numeric">
                                    {formatPayrollHours(day.regularMinutes)} h
                                  </td>
                                  <td className="is-numeric">
                                    {formatPayrollHours(day.overtimeMinutes)} h
                                  </td>
                                  <td className="is-numeric">{breakMinutes} min</td>
                                  <td>
                                    {day.hasIncompletePunch ? (
                                      <span className="horora-payroll-incomplete">Incomplet</span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td>{notes}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </section>
              ))
            )}
          </article>
        ) : null}
      </section>

      {confirmOpen ? (
        <div className="horora-payroll-dialog-backdrop" role="presentation">
          <div
            className="horora-payroll-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="horora-payroll-confirm-title"
          >
            <h3 id="horora-payroll-confirm-title">Confirmer l&apos;émission</h3>
            <p>
              Le rapport sera émis et verrouillé. Une émission identique restera
              idempotente.
            </p>
            {preview?.completenessStatus === "blocked_incomplete" ||
            preview?.completenessStatus === "forced" ? (
              <label className="horora-payroll-filter horora-payroll-filter--stack">
                <span>Motif d&apos;émission forcée</span>
                <textarea
                  value={forceReason}
                  onChange={(event) => setForceReason(event.target.value)}
                  rows={3}
                  required
                />
              </label>
            ) : null}
            <div className="horora-payroll-dialog-actions">
              <button
                type="button"
                className="horora-btn horora-btn-ghost"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
              >
                Annuler
              </button>
              <button
                type="button"
                className="horora-btn horora-btn-primary"
                onClick={() => void persist("issue")}
                disabled={
                  busy ||
                  ((preview?.completenessStatus === "blocked_incomplete" ||
                    preview?.completenessStatus === "forced") &&
                    !forceReason.trim())
                }
              >
                Confirmer l&apos;émission
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </HorodateurDirectionPageShell>
  );
}
