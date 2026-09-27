"use client";

import { useCallback, useEffect, useState } from "react";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import { formatCad, type TargetType } from "@/app/lib/commissions/commissions.shared";

type SaleLine = {
  id: string;
  kind: string;
  saleDate: string;
  reference: string | null;
  label: string;
  amount: number;
  salesCount: number;
  notes: string | null;
  source: string;
};

type LedgerResponse = {
  ledgerAvailable?: boolean;
  lines?: SaleLine[];
  defaultSaleDate?: string;
  error?: string;
  code?: string;
};

const KIND_LABELS: Record<string, string> = {
  sale: "Vente",
  adjustment: "Ajustement",
  correction: "Correction",
};

export default function AdminCommissionSalesLedger({
  objectiveId,
  targetType,
  onSaved,
}: {
  objectiveId: string;
  targetType: TargetType;
  onSaved: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [ledgerAvailable, setLedgerAvailable] = useState(true);
  const [mode, setMode] = useState<"sale" | "adjustment" | "import">("sale");
  const [saleDate, setSaleDate] = useState("");
  const [reference, setReference] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [salesCount, setSalesCount] = useState("");
  const [notes, setNotes] = useState("");
  const [correctsLineId, setCorrectsLineId] = useState("");
  const [csv, setCsv] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await commissionsFetch(
      `/api/direction/commissions/objectives/${objectiveId}/sales`
    );
    const payload = (await response.json().catch(() => ({}))) as LedgerResponse;
    if (!response.ok) {
      setMessage(payload.error || "Impossible de charger le registre.");
      setLines([]);
    } else {
      setLedgerAvailable(payload.ledgerAvailable !== false);
      setLines(Array.isArray(payload.lines) ? payload.lines : []);
      setSaleDate((current) => current || payload.defaultSaleDate || "");
      setMessage("");
    }
    setLoading(false);
  }, [objectiveId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitLine() {
    setSaving(true);
    setMessage("");
    try {
      const response = await commissionsFetch(
        `/api/direction/commissions/objectives/${objectiveId}/sales`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: mode === "adjustment" ? (correctsLineId ? "correction" : "adjustment") : "sale",
            sale_date: saleDate,
            reference,
            label: label || (mode === "adjustment" ? "Ajustement" : "Vente"),
            amount: amount ? Number(amount) : 0,
            sales_count: salesCount ? Number(salesCount) : 0,
            notes,
            corrects_line_id: mode === "adjustment" ? correctsLineId || null : null,
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as LedgerResponse;
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.");
      setReference("");
      setLabel("");
      setAmount("");
      setSalesCount("");
      setNotes("");
      setCorrectsLineId("");
      setMessage(mode === "adjustment" ? "Ajustement enregistre." : "Vente enregistree.");
      await load();
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur registre.");
    } finally {
      setSaving(false);
    }
  }

  async function submitImport() {
    setSaving(true);
    setMessage("");
    try {
      const response = await commissionsFetch(
        `/api/direction/commissions/objectives/${objectiveId}/sales/import`,
        {
          method: "POST",
          body: JSON.stringify({ csv }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as LedgerResponse & {
        imported?: number;
      };
      if (!response.ok) throw new Error(payload.error || "Import impossible.");
      setCsv("");
      setMessage(`${payload.imported ?? 0} vente(s) importee(s).`);
      await load();
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur import.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="ui-text-muted">Chargement du registre de ventes...</p>;
  }

  return (
    <div className="commission-ledger">
      {message ? <p className="ui-text-muted">{message}</p> : null}
      {!ledgerAvailable ? (
        <p className="ui-text-muted">
          Le registre structure n&apos;est pas encore actif sur cette base. La saisie manuelle du
          realise reste disponible.
        </p>
      ) : (
        <>
          <div className="commissions-list-actions">
            <button type="button" className="tagora-dark-outline-action" onClick={() => setMode("sale")}>
              Vente
            </button>
            <button
              type="button"
              className="tagora-dark-outline-action"
              onClick={() => setMode("adjustment")}
            >
              Ajustement
            </button>
            <button
              type="button"
              className="tagora-dark-outline-action"
              onClick={() => setMode("import")}
            >
              Importer
            </button>
          </div>
          {mode === "import" ? (
            <label className="tagora-field">
              <span className="tagora-label">
                CSV : date, reference, libelle, montant, nombre, notes
              </span>
              <textarea
                className="tagora-textarea"
                rows={4}
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                placeholder={"date;reference;libelle;montant;nombre;notes"}
              />
              <button
                type="button"
                className="tagora-dark-action"
                disabled={saving || !csv.trim()}
                onClick={() => void submitImport()}
              >
                {saving ? "Import..." : "Importer les ventes"}
              </button>
            </label>
          ) : (
            <div className="commissions-form-grid">
              <label className="tagora-field">
                <span className="tagora-label">Date</span>
                <input
                  type="date"
                  className="tagora-input"
                  value={saleDate}
                  onChange={(event) => setSaleDate(event.target.value)}
                />
              </label>
              <label className="tagora-field">
                <span className="tagora-label">Reference</span>
                <input
                  className="tagora-input"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
              <label className="tagora-field">
                <span className="tagora-label">Libelle</span>
                <input
                  className="tagora-input"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </label>
              {targetType === "amount" || mode === "adjustment" ? (
                <label className="tagora-field">
                  <span className="tagora-label">Montant (CAD)</span>
                  <input
                    type="number"
                    step="0.01"
                    className="tagora-input"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
              ) : null}
              {targetType === "sales_count" || mode === "adjustment" ? (
                <label className="tagora-field">
                  <span className="tagora-label">Nombre</span>
                  <input
                    type="number"
                    step="1"
                    className="tagora-input"
                    value={salesCount}
                    onChange={(event) => setSalesCount(event.target.value)}
                  />
                </label>
              ) : null}
              <label className="tagora-field commissions-form-span-2">
                <span className="tagora-label">
                  {mode === "adjustment" ? "Motif" : "Notes"}
                </span>
                <input
                  className="tagora-input"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              {mode === "adjustment" ? (
                <label className="tagora-field commissions-form-span-2">
                  <span className="tagora-label">Corrige la ligne</span>
                  <select
                    className="tagora-input"
                    value={correctsLineId}
                    onChange={(event) => setCorrectsLineId(event.target.value)}
                  >
                    <option value="">Ajustement libre</option>
                    {lines.map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.saleDate} · {line.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="commissions-form-actions commissions-form-span-2">
                <button
                  type="button"
                  className="tagora-dark-action"
                  disabled={saving}
                  onClick={() => void submitLine()}
                >
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </div>
          )}
          {lines.length === 0 ? (
            <p className="ui-text-muted">Aucune ligne de vente.</p>
          ) : (
            <ul className="commission-ledger-lines">
              {lines.map((line) => (
                <li key={line.id}>
                  <strong>{KIND_LABELS[line.kind] ?? line.kind}</strong> · {line.saleDate} ·{" "}
                  {line.label}
                  {line.reference ? ` · ${line.reference}` : ""} ·{" "}
                  {targetType === "sales_count" && line.amount === 0
                    ? `${line.salesCount} vente(s)`
                    : formatCad(line.amount)}
                  {line.notes ? ` · ${line.notes}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <style jsx>{`
        .commission-ledger {
          display: grid;
          gap: 10px;
          margin-top: 8px;
        }
        .commission-ledger-lines {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 6px;
        }
      `}</style>
    </div>
  );
}
