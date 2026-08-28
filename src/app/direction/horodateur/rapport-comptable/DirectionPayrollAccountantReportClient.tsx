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
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import HorodateurDirectionPageShell from "@/app/direction/horodateur/HorodateurDirectionPageShell";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  collectPayrollAccountantHumanNotes,
  formatPayrollDateFrCa,
  formatPayrollDateTimeFrCa,
  formatPayrollHours,
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

  if (accessLoading || (canRead && loadingContext)) {
    return (
      <TagoraLoadingScreen
        isLoading
        message="Chargement du rapport comptable..."
        fullScreen
      />
    );
  }

  if (!user || !canRead) {
    return (
      <HorodateurDirectionPageShell
        active="paie"
      subtitle="Rapport comptable de paie HORORA"
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

  return (
    <HorodateurDirectionPageShell
      active="paie"
      subtitle="Préparer, vérifier, émettre et exporter le rapport comptable"
    >
      <section className="horora-payroll-accountant" aria-labelledby="horora-payroll-title">
        <div className="horora-payroll-accountant-toolbar">
          <h2 id="horora-payroll-title" className="horora-payroll-accountant-heading">
            Sélection du rapport
          </h2>
          <div className="horora-payroll-accountant-filters">
            <label className="tagora-field">
              <span className="tagora-label">Entreprise opérante</span>
              <select
                className="tagora-input"
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
            <label className="tagora-field">
              <span className="tagora-label">Date de début</span>
              <input
                type="date"
                className="tagora-input"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Date de fin</span>
              <input
                type="date"
                className="tagora-input"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Cycle</span>
              <select
                className="tagora-input"
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
          </div>
          <p className="horora-payroll-accountant-hint">
            Cycle par défaut : deux semaines inclusives.
            {biweekly ? " Période de 14 jours confirmée." : " Période personnalisée."}
            {selectedCycle && !datesMatchCycle
              ? " Les dates diffèrent du cycle : l'enregistrement exigera le calendrier exact du cycle."
              : null}
          </p>
        </div>

        <div className="horora-payroll-accountant-actions" role="toolbar" aria-label="Actions du rapport">
          <SecondaryButton onClick={() => void refreshPreview()} disabled={loadingPreview || busy}>
            <RefreshCw size={16} aria-hidden />
            Actualiser l&apos;aperçu
          </SecondaryButton>
          <SecondaryButton
            onClick={() => void persist("draft")}
            disabled={busy || issuedLocked || !datesMatchCycle || !cycleId}
          >
            <Save size={16} aria-hidden />
            Enregistrer le brouillon
          </SecondaryButton>
          <PrimaryButton
            onClick={() => setConfirmOpen(true)}
            disabled={
              busy ||
              issuedLocked ||
              !manageAllowed ||
              !datesMatchCycle ||
              !cycleId
            }
          >
            <Send size={16} aria-hidden />
            Émettre le rapport
          </PrimaryButton>
          <SecondaryButton onClick={() => void exportFile("csv")} disabled={busy || !preview}>
            <FileSpreadsheet size={16} aria-hidden />
            Télécharger CSV
          </SecondaryButton>
          <SecondaryButton onClick={() => void exportFile("pdf")} disabled={busy || !preview}>
            <Download size={16} aria-hidden />
            Télécharger PDF
          </SecondaryButton>
          <SecondaryButton onClick={() => window.print()} disabled={!preview}>
            <Printer size={16} aria-hidden />
            Imprimer
          </SecondaryButton>
        </div>

        {issuedLocked ? (
          <p className="horora-payroll-accountant-lock" role="status">
            <Lock size={16} aria-hidden />
            Rapport émis verrouillé. Aucune modification n&apos;est possible.
          </p>
        ) : null}
        {errorMessage ? (
          <AccessNotice title="Erreur" description={errorMessage} />
        ) : null}
        {message ? (
          <p className="horora-payroll-accountant-success" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}

        {loadingPreview ? (
          <AccessNotice description="Chargement de l'aperçu comptable..." />
        ) : null}

        {!loadingPreview && !preview ? (
          <AccessNotice
            title="Aperçu vide"
            description="Actualisez l'aperçu pour charger les heures de la période."
          />
        ) : null}

        {preview ? (
          <article className="horora-payroll-accountant-report" aria-labelledby="horora-payroll-report-title">
            <header className="horora-payroll-accountant-report-head">
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
              <div className="horora-payroll-accountant-badges">
                <StatusBadge
                  label={payrollCompletenessLabel(preview.completenessStatus)}
                  tone={completenessTone(preview.completenessStatus)}
                />
                <StatusBadge
                  label={payrollReportStatusLabel(persistMeta?.status ?? "preview")}
                  tone={persistMeta?.status === "issued" ? "success" : "info"}
                />
                {persistMeta ? (
                  <StatusBadge label={`Révision ${persistMeta.revision}`} tone="default" />
                ) : null}
              </div>
            </header>

            {preview.completenessStatus === "blocked_incomplete" ? (
              <AccessNotice
                title="Émission bloquée"
                description="Des pointages sont incomplets. Corrigez-les ou forcez l'émission avec un motif."
              />
            ) : null}

            <div className="horora-payroll-accountant-totals" aria-label="Totaux generaux">
              <div>
                <span>Heures régulières</span>
                <strong>{formatPayrollHours(preview.totals.regularMinutes)} h</strong>
              </div>
              <div>
                <span>Heures supplémentaires</span>
                <strong>{formatPayrollHours(preview.totals.overtimeMinutes)} h</strong>
              </div>
              <div>
                <span>Heures payables</span>
                <strong>{formatPayrollHours(preview.totals.payableMinutes)} h</strong>
              </div>
              <div>
                <span>Employés</span>
                <strong>{preview.totals.employeeCount}</strong>
              </div>
            </div>

            {preview.payload.employees.length === 0 ? (
              <AccessNotice description="Aucune heure sur la période sélectionnée." />
            ) : (
              preview.payload.employees.map((employee) => (
                <section
                  key={employee.employeeId}
                  className="horora-payroll-accountant-employee"
                  aria-labelledby={`employee-${employee.employeeId}`}
                >
                  <h4 id={`employee-${employee.employeeId}`}>
                    {employee.employeeName ?? `Employé ${employee.employeeId}`}
                  </h4>
                  {employee.weeks.map((week) => (
                    <div key={`${employee.employeeId}-${week.weekStart}`}>
                      <h5>
                        Semaine {formatPayrollDateFrCa(week.weekStart)} — {formatPayrollDateFrCa(week.weekEnd)} · R{" "}
                        {formatPayrollHours(week.regularMinutes)} h · S{" "}
                        {formatPayrollHours(week.overtimeMinutes)} h
                      </h5>
                      <div className="horora-payroll-accountant-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Journée</th>
                              <th scope="col">Entrée</th>
                              <th scope="col">Sortie</th>
                              <th scope="col">Regulier</th>
                              <th scope="col">Supp.</th>
                              <th scope="col">Pauses</th>
                              <th scope="col">Corrections / notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {week.days.map((day) => (
                              <tr key={day.workDate}>
                                <th scope="row">{formatPayrollDateFrCa(day.workDate)}</th>
                                <td>{formatPayrollDateTimeFrCa(day.punchInAt, preview.payload.timezone) || "—"}</td>
                                <td>{formatPayrollDateTimeFrCa(day.punchOutAt, preview.payload.timezone) || "—"}</td>
                                <td>{formatPayrollHours(day.regularMinutes)} h</td>
                                <td>{formatPayrollHours(day.overtimeMinutes)} h</td>
                                <td>
                                  {day.paidBreakMinutes +
                                    day.unpaidBreakMinutes +
                                    day.unpaidLunchMinutes}{" "}
                                  min
                                  {day.hasIncompletePunch ? " · incomplet" : ""}
                                </td>
                                <td>
                                  {collectPayrollAccountantHumanNotes([
                                    ...day.corrections.map((item) => item.notes ?? "Correction"),
                                    ...day.notes,
                                  ]).join(" · ") || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  <p className="horora-payroll-accountant-employee-total">
                    Total employé : {formatPayrollHours(employee.totals.regularMinutes)} h
                    régulières, {formatPayrollHours(employee.totals.overtimeMinutes)} h
                    supplémentaires, {formatPayrollHours(employee.totals.payableMinutes)} h
                    payables.
                  </p>
                </section>
              ))
            )}
          </article>
        ) : null}
      </section>

      {confirmOpen ? (
        <div
          className="horora-payroll-accountant-dialog-backdrop"
          role="presentation"
        >
          <div
            className="horora-payroll-accountant-dialog"
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
              <label className="tagora-field">
                <span className="tagora-label">Motif d&apos;émission forcée</span>
                <textarea
                  className="tagora-input"
                  value={forceReason}
                  onChange={(event) => setForceReason(event.target.value)}
                  rows={3}
                  required
                />
              </label>
            ) : null}
            <div className="horora-payroll-accountant-dialog-actions">
              <SecondaryButton onClick={() => setConfirmOpen(false)} disabled={busy}>
                Annuler
              </SecondaryButton>
              <PrimaryButton
                onClick={() => void persist("issue")}
                disabled={
                  busy ||
                  ((preview?.completenessStatus === "blocked_incomplete" ||
                    preview?.completenessStatus === "forced") &&
                    !forceReason.trim())
                }
              >
                Confirmer l&apos;émission
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </HorodateurDirectionPageShell>
  );
}
