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

export function formatFrDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6, maxWidth: 520 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
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
