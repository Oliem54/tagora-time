"use client";

import {
  PAYMENT_METHOD_OPTIONS_FINALIZE,
  PAYMENT_METHOD_OPTIONS_FORM,
  type EmbeddedPaymentPayload,
  type PaymentFormInput,
  paymentMethodLabel,
} from "@/app/lib/livraisons/payment-embed";

export function formatMoneyCad(amount: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function PaymentDetailBanner({ payment }: { payment: EmbeddedPaymentPayload }) {
  const paid = payment.payment_status === "paye_complet" && payment.payment_balance_due <= 0.009;
  const balance = payment.payment_balance_due;
  return (
    <div
      role="region"
      aria-label="Paiement client"
      style={{
        borderRadius: 12,
        padding: "14px 16px",
        border: paid ? "2px solid #22c55e" : "2px solid #ea580c",
        background: paid ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)" : "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
        boxShadow: paid ? "0 2px 8px rgba(34,197,94,0.15)" : "0 2px 12px rgba(234,88,12,0.2)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <strong style={{ fontSize: 15, letterSpacing: 0.2 }}>Paiement</strong>
        <span
          style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            background: paid ? "#16a34a" : "#ea580c",
          }}
        >
          {paid ? "Payé au complet" : "Solde à collecter"}
        </span>
      </div>
      {paid ? (
        <div style={{ fontSize: 16, fontWeight: 600, color: "#14532d" }}>
          Solde : {formatMoneyCad(0)}
        </div>
      ) : (
        <div className="ui-stack-xs" style={{ gap: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#9a3412", lineHeight: 1.2 }}>
            Solde à payer : {formatMoneyCad(balance)}
          </div>
          <div style={{ fontSize: 14, color: "#431407" }}>
            Méthode prévue : <strong>{paymentMethodLabel(payment.payment_method)}</strong>
          </div>
        </div>
      )}
      {payment.payment_note ? (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#334155" }}>
          <span className="ui-text-muted">Note paiement : </span>
          {payment.payment_note}
        </p>
      ) : null}
      {payment.payment_confirmed_at ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#475569" }}>
          Paiement confirmé
          {payment.payment_confirmed_by_name ? ` par ${payment.payment_confirmed_by_name}` : ""}
          {` — ${new Date(payment.payment_confirmed_at).toLocaleString("fr-CA")}`}
        </p>
      ) : null}
    </div>
  );
}

type FinalizeKind = "livraison" | "ramassage";

type PaymentFinalizeModalProps = {
  open: boolean;
  kind: FinalizeKind;
  balanceDue: number;
  loading: boolean;
  method: string;
  confirmChecked: boolean;
  onMethodChange: (v: string) => void;
  onConfirmChange: (v: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function PaymentFinalizeModal({
  open,
  kind,
  balanceDue,
  loading,
  method,
  confirmChecked,
  onMethodChange,
  onConfirmChange,
  onCancel,
  onSubmit,
}: PaymentFinalizeModalProps) {
  if (!open) return null;
  const label = kind === "ramassage" ? "Ce ramassage" : "Cette livraison";
  const canSubmit = Boolean(method.trim()) && confirmChecked && !loading;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-finalize-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="tagora-panel"
        style={{
          maxWidth: 440,
          width: "100%",
          padding: 20,
          borderRadius: 14,
          border: "2px solid #ea580c",
          boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
          background: "#fff",
        }}
      >
        <h2 id="payment-finalize-title" style={{ margin: "0 0 12px", fontSize: 18, color: "#9a3412" }}>
          Paiement requis avant finalisation
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.5, color: "#0f172a" }}>
          {label} a un solde à payer de <strong>{formatMoneyCad(balanceDue)}</strong>.
          <br />
          Avant de finaliser, confirme que le client a payé au complet.
        </p>

        <label className="tagora-field" style={{ display: "block", marginBottom: 14 }}>
          <span className="tagora-label">Méthode de paiement reçue</span>
          <select
            className="tagora-input"
            value={method}
            onChange={(e) => onMethodChange(e.target.value)}
            aria-required
          >
            <option value="">— Choisir —</option>
            {PAYMENT_METHOD_OPTIONS_FINALIZE.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            marginBottom: 18,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1.45,
            color: "#0f172a",
          }}
        >
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(e) => onConfirmChange(e.target.checked)}
            style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
          />
          <span>
            Je confirme que le client a payé le solde complet avant la remise.
          </span>
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="tagora-dark-outline-action" onClick={onCancel} disabled={loading}>
            Annuler
          </button>
          <button
            type="button"
            className="tagora-dark-action"
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {loading ? "En cours…" : "Confirmer le paiement et finaliser"}
          </button>
        </div>
      </div>
    </div>
  );
}

type PaymentClientFormSectionProps = {
  value: PaymentFormInput;
  onChange: (next: PaymentFormInput) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export function PaymentClientFormSection({ value, onChange, disabled, idPrefix = "pay" }: PaymentClientFormSectionProps) {
  const p = idPrefix;
  return (
    <fieldset
      disabled={disabled}
      style={{
        border: "2px solid #cbd5e1",
        borderRadius: 12,
        padding: "14px 16px",
        margin: 0,
        background: "#f8fafc",
      }}
    >
      <legend style={{ fontWeight: 700, padding: "0 8px", fontSize: 15 }}>Paiement client</legend>
      <div className="tagora-form-grid" style={{ marginTop: 8 }}>
        <div className="tagora-field" style={{ gridColumn: "1 / -1" }}>
          <span className="tagora-label" id={`${p}-paid-label`}>
            Client a payé au complet ?
          </span>
          <div style={{ display: "flex", gap: 16, marginTop: 6 }} role="group" aria-labelledby={`${p}-paid-label`}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input
                type="radio"
                name={`${p}-paid`}
                checked={value.paidFull}
                onChange={() => onChange({ ...value, paidFull: true, balanceDue: "" })}
              />
              Oui
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input
                type="radio"
                name={`${p}-paid`}
                checked={!value.paidFull}
                onChange={() => onChange({ ...value, paidFull: false })}
              />
              Non
            </label>
          </div>
        </div>

        {!value.paidFull ? (
          <label className="tagora-field">
            <span className="tagora-label">Solde à payer (CAD)</span>
            <input
              type="text"
              className="tagora-input"
              inputMode="decimal"
              placeholder="0.00"
              value={value.balanceDue}
              onChange={(e) => onChange({ ...value, balanceDue: e.target.value })}
            />
          </label>
        ) : (
          <div className="tagora-field">
            <span className="tagora-label">Solde à payer</span>
            <input type="text" className="tagora-input" readOnly value="0,00 $" />
          </div>
        )}

        <label className="tagora-field" style={{ gridColumn: value.paidFull ? "1 / -1" : undefined }}>
          <span className="tagora-label">Méthode de paiement prévue ou utilisée</span>
          <select
            className="tagora-input"
            value={value.method}
            onChange={(e) => onChange({ ...value, method: e.target.value })}
          >
            {PAYMENT_METHOD_OPTIONS_FORM.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
          <span className="tagora-label">Note paiement (optionnel)</span>
          <textarea
            className="tagora-textarea"
            rows={2}
            value={value.note}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            placeholder="Référence, détails…"
          />
        </label>
      </div>
    </fieldset>
  );
}
