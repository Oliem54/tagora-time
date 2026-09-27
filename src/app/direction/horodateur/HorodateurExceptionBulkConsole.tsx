"use client";

import { useEffect, useState } from "react";
import { fetchHororaNexusSession } from "@/app/lib/auth/horora-nexus-session.client";
import type { ExceptionBulkMutation } from "@/app/lib/horodateur-v1/horodateur-exception-bulk.shared";
import "./horodateur-exception-bulk.css";

type CompanyOption = { id: string; company_code: string; status: string };
type BulkRow = {
  id: string;
  employeeId: number;
  exceptionType: string;
  status: string;
  workDate: string | null;
  gravity: string;
  notificationState: string;
};

const ACTIONS: Array<{ id: ExceptionBulkMutation; label: string }> = [
  { id: "approve", label: "Approuver" },
  { id: "refuse", label: "Refuser" },
  { id: "resolve", label: "Résoudre" },
  { id: "archive", label: "Archiver" },
  { id: "restore", label: "Restaurer" },
  { id: "soft_delete", label: "Suppression logique" },
];

export default function HorodateurExceptionBulkConsole() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [exceptionType, setExceptionType] = useState("");
  const [status, setStatus] = useState("");
  const [gravity, setGravity] = useState("");
  const [expectedEventType, setExpectedEventType] = useState("");
  const [punchPresence, setPunchPresence] = useState("");
  const [notificationState, setNotificationState] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchHororaNexusSession("/api/direction/horodateur/exceptions/bulk")
      .then((response) => response.json())
      .then((payload: { companies?: CompanyOption[] }) => {
        const next = Array.isArray(payload.companies) ? payload.companies : [];
        setCompanies(next);
        if (next[0]) setCompanyId(next[0].id);
      })
      .catch(() => setError("Compagnies indisponibles."));
  }, []);

  function filters() {
    return {
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      employeeId: employeeId ? Number(employeeId) : null,
      exceptionType: exceptionType || null,
      status: status || null,
      gravity: gravity || null,
      expectedEventType: expectedEventType || null,
      punchPresence: punchPresence || null,
      notificationState: notificationState || null,
      search: search || null,
      archiveState: "active" as const,
    };
  }

  async function preview() {
    setError("");
    setProgress("Prévisualisation…");
    const response = await fetchHororaNexusSession("/api/direction/horodateur/exceptions/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "preview",
        selection: "page",
        organizationCompanyId: companyId,
        page,
        pageSize: 25,
        filters: filters(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setProgress("");
      setError(payload.error ?? "Prévisualisation impossible.");
      return;
    }
    setRows(Array.isArray(payload.rows) ? payload.rows : []);
    setTotal(Number(payload.total ?? 0));
    setSelected([]);
    setSelectAllFiltered(false);
    setProgress("");
    setReport(`${payload.total ?? 0} ligne(s) correspondent aux filtres.`);
  }

  async function run(action: ExceptionBulkMutation | "export") {
    if (!companyId) {
      setError("Compagnie obligatoire.");
      return;
    }
    const selectedCount = selectAllFiltered ? total : selected.length;
    if (action !== "export" && selectedCount === 0) {
      setError("Aucune ligne sélectionnée.");
      return;
    }
    if (
      action !== "export" &&
      !window.confirm(`Confirmer ${action} sur ${selectedCount} exception(s) ?`)
    ) {
      return;
    }
    setProgress("Action en cours…");
    setError("");
    const response = await fetchHororaNexusSession("/api/direction/horodateur/exceptions/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        selection: selectAllFiltered ? "all_filtered" : "page",
        ids: selected,
        organizationCompanyId: companyId,
        page,
        pageSize: 25,
        confirmedCount: action === "export" ? undefined : selectedCount,
        idempotencyKey: action === "export" ? undefined : crypto.randomUUID(),
        filters: filters(),
      }),
    });
    if (action === "export") {
      const text = await response.text();
      setProgress("");
      setReport(response.ok ? "Export prêt." : "Export refusé.");
      if (response.ok) {
        const blob = new Blob([text], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "exceptions-horora.csv";
        link.click();
        URL.revokeObjectURL(url);
      }
      return;
    }
    const payload = await response.json();
    setProgress("");
    if (!response.ok) {
      setError(payload.error ?? "Action refusée.");
      return;
    }
    setReport(
      `Résultat ${payload.result ?? "success"} : ${payload.successCount ?? 0} succès, ${payload.failureCount ?? 0} échec(s).`
    );
    await preview();
  }

  return (
    <section className="horodateur-exception-bulk" aria-label="Gestion en lot des exceptions">
      <div className="horodateur-exception-bulk__filters">
        <label>
          Compagnie
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.company_code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Période du
          <input type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
        </label>
        <label>
          Période au
          <input type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
        </label>
        <label>
          Employé
          <input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          Type
          <input value={exceptionType} onChange={(event) => setExceptionType(event.target.value)} />
        </label>
        <label>
          Statut
          <input value={status} onChange={(event) => setStatus(event.target.value)} />
        </label>
        <label>
          Gravité
          <select value={gravity} onChange={(event) => setGravity(event.target.value)}>
            <option value="">Toutes</option>
            <option value="critique">Critique</option>
            <option value="standard">Standard</option>
          </select>
        </label>
        <label>
          Quart attendu
          <input value={expectedEventType} onChange={(event) => setExpectedEventType(event.target.value)} />
        </label>
        <label>
          Pointage
          <select value={punchPresence} onChange={(event) => setPunchPresence(event.target.value)}>
            <option value="">Tous</option>
            <option value="present">Présent</option>
            <option value="absent">Absent</option>
          </select>
        </label>
        <label>
          Notification
          <select value={notificationState} onChange={(event) => setNotificationState(event.target.value)}>
            <option value="">Toutes</option>
            <option value="sent">Envoyée</option>
            <option value="failed">Échouée</option>
            <option value="pending">En attente</option>
          </select>
        </label>
        <label>
          Recherche
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      <div className="horodateur-exception-bulk__actions">
        <button type="button" onClick={() => void preview()}>
          Filtrer
        </button>
        <button type="button" onClick={() => setSelected(rows.map((row) => row.id))}>
          Sélectionner la page
        </button>
        <button type="button" onClick={() => setSelectAllFiltered(true)}>
          Sélectionner toutes les lignes filtrées
        </button>
        <button type="button" onClick={() => void run("export")}>
          Exporter
        </button>
        {ACTIONS.map((action) => (
          <button key={action.id} type="button" onClick={() => void run(action.id)}>
            {action.label}
          </button>
        ))}
      </div>
      <p className="horodateur-exception-bulk__progress">{progress}</p>
      <p className="horodateur-exception-bulk__report">{report}</p>
      {error ? <p role="alert">{error}</p> : null}
      <p>
        Page {page} · {selected.length} sur la page · {total} au total
        <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Précédent
        </button>
        <button type="button" onClick={() => setPage((current) => current + 1)}>
          Suivant
        </button>
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <label>
              <input
                type="checkbox"
                checked={selectAllFiltered || selected.includes(row.id)}
                onChange={(event) => {
                  setSelectAllFiltered(false);
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, row.id]
                      : current.filter((id) => id !== row.id)
                  );
                }}
              />
              {row.workDate ?? row.status} · {row.exceptionType} · {row.gravity} · {row.notificationState}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
