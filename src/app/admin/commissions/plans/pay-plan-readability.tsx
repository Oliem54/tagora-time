import type { CSSProperties, ReactNode } from "react";
import StatusBadge from "@/app/components/ui/StatusBadge";

const labelStyle: CSSProperties = {
  display: "block",
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: "#6b7280",
};

const valueStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.35,
  color: "#111827",
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const detailRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "12px 0",
  borderBottom: "1px solid #e5e7eb",
};

const resultHeroStyle: CSSProperties = {
  marginTop: 8,
  padding: "18px 20px",
  borderRadius: 12,
  background: "#f3f4f6",
  border: "1px solid #d1d5db",
};

const resultAmountStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 36,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  color: "#0f172a",
};

export function formatCad(amount: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

const FR_CA_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/**
 * Extrait le jour calendaire métier YYYY-MM-DD.
 * Ne convertit jamais une date sans heure en instant local (évite le jour précédent).
 */
export function resolvePayPlanCalendarDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (isoDay) {
    return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`;
  }

  // Ex. String(new Date("2026-08-05T00:00:00.000Z")) en Amérique du Nord
  // → "Tue Aug 04 2026 20:00:00 GMT-0400" — récupérer le jour UTC métier.
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

/** Formate YYYY-MM-DD en libellé fr-CA sans passer par un instant timezone. */
export function formatPayPlanCalendarDayLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return ymd;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return ymd;
  }
  return `${day} ${FR_CA_MONTHS[month - 1]} ${year}`;
}

/**
 * Chemin d’affichage du résumé « Date d’effet » (MetaLine à droite).
 * Entrée : workingVersion.effective_from (API).
 */
export function formatPayPlanVersionSummaryDate(value: unknown): string {
  const ymd = resolvePayPlanCalendarDate(value);
  if (!ymd) return "—";
  return formatPayPlanCalendarDayLabel(ymd);
}

/**
 * Affiche une date calendaire métier en fr-CA.
 * Les valeurs ISO avec heure/offset sont ramenées au jour calendaire YYYY-MM-DD.
 */
export function formatFrDate(value: string): string {
  return formatPayPlanVersionSummaryDate(value);
}

/** Libellés humains pour les types de règle (affichage uniquement). */
export function formatPayPlanRuleKindLabel(ruleKind: unknown): string {
  const key = String(ruleKind || "").trim();
  if (!key) return "Type inconnu";
  const labels: Record<string, string> = {
    percentage_of_eligible_sales: "Pourcentage des ventes admissibles",
    fixed_amount_per_unit: "Montant fixe par unité",
    percentage_of_gross_profit: "Pourcentage du profit brut",
    minimum_guarantee: "Garantie minimale",
    progressive_profit_tiers: "Paliers progressifs de profit",
    retroactive_volume_tier: "Palier de volume rétroactif",
    non_retroactive_volume_tier: "Palier de volume non rétroactif",
    monthly_volume_bonus: "Bonification mensuelle de volume",
    annual_volume_bonus: "Bonification annuelle de volume",
    account_opening_bonus: "Bonification d’ouverture de compte",
    full_price_bonus: "Bonification plein prix",
    financing_bonus: "Bonification financement",
    extended_warranty_bonus: "Bonification garantie prolongée",
    margin_threshold: "Seuil de marge",
    account_class_rate: "Taux par classe de compte",
    product_category_rate: "Taux par catégorie de produit",
    company_rate: "Taux par compagnie",
    sales_channel_rate: "Taux par canal de vente",
    shared_sale_split: "Partage de vente",
    recoverable_advance: "Avance récupérable",
    advance_waterfall: "Cascade d’avances",
    adjustment: "Ajustement",
    reversal: "Contrepassation",
    credit: "Crédit",
    return: "Retour",
    manual_approval: "Approbation manuelle",
    accounting_confirmation: "Confirmation comptable",
    training_entry_exclusion: "Exclusion entrée de formation",
  };
  if (labels[key]) return labels[key];
  const humanized = key
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!humanized) return "Type inconnu";
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}

export function formatFrDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function payPlanStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  const labels: Record<string, string> = {
    draft: "Brouillon",
    active: "Actif",
    inactive: "Inactif",
    archived: "Archivé",
    pending: "En attente",
    calculated: "Calculé",
    under_review: "À valider",
    validated: "Validée",
    approved: "Approuvée",
    rejected: "Refusée",
  };
  return labels[normalized] || status;
}

export function payPlanStatusTone(
  status: string
): "default" | "info" | "success" | "warning" | "danger" {
  const normalized = status.trim().toLowerCase();
  if (normalized === "active" || normalized === "validated" || normalized === "approved") {
    return "success";
  }
  if (normalized === "draft" || normalized === "pending" || normalized === "calculated") {
    return "warning";
  }
  if (normalized === "rejected" || normalized === "inactive") {
    return "danger";
  }
  return "info";
}

export function PayPlanStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      label={payPlanStatusLabel(status)}
      tone={payPlanStatusTone(status)}
    />
  );
}

export function PayPlanFieldStack({ children }: { children: ReactNode }) {
  return <div style={fieldStackStyle}>{children}</div>;
}

export function PayPlanField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6, maxWidth: 520 }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint ? (
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function PayPlanDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <PayPlanField label={label} hint={`Lecture : ${formatFrDate(value)}`}>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </PayPlanField>
  );
}

export function PayPlanDetailRow({
  label,
  children,
  last = false,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        ...detailRowStyle,
        borderBottom: last ? "none" : "1px solid #e5e7eb",
        paddingBottom: last ? 4 : 12,
      }}
    >
      <dt style={labelStyle}>{label}</dt>
      <dd style={{ ...valueStyle, margin: 0 }}>{children}</dd>
    </div>
  );
}

export function PayPlanMetaLine({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={{ ...labelStyle, fontSize: 12 }}>{label}</span>
      <span style={{ ...valueStyle, fontSize: 15 }}>{value}</span>
    </div>
  );
}

export function PayPlanResultAmount({ amount }: { amount: number }) {
  return (
    <div style={resultHeroStyle}>
      <div style={labelStyle}>Résultat</div>
      <div style={resultAmountStyle}>{formatCad(amount)}</div>
    </div>
  );
}
