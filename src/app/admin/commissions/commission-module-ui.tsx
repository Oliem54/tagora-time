"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import AppCard from "@/app/components/ui/AppCard";

const quickGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const actionCardStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  minHeight: 112,
  textDecoration: "none",
  color: "inherit",
};

const actionTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.25,
};

const actionDescStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.45,
  color: "#64748b",
};

const amountStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: "#0f172a",
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748b",
};

const progressTrackStyle: CSSProperties = {
  width: "100%",
  height: 8,
  borderRadius: 999,
  background: "#e2e8f0",
  overflow: "hidden",
};


export type CommissionQuickAction = {
  key: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  primary?: boolean;
};

export function CommissionModuleSubnav({
  active,
}: {
  active:
    | "dashboard"
    | "objectives"
    | "plans"
    | "results"
    | "pending"
    | "paid"
    | "books";
}) {
  const items: Array<{
    key: typeof active;
    href: string;
    label: string;
  }> = [
    { key: "dashboard", href: "/admin/commissions", label: "Tableau Commissions" },
    {
      key: "objectives",
      href: "/admin/commissions#objectifs",
      label: "Objectifs",
    },
    {
      key: "plans",
      href: "/admin/commissions/plans",
      label: "Plans de rémunération",
    },
    {
      key: "results",
      href: "/admin/commissions#resultats-plans",
      label: "Résultats de commission",
    },
    {
      key: "pending",
      href: "/admin/commissions#commissions-a-valider",
      label: "À valider",
    },
    {
      key: "paid",
      href: "/admin/commissions#commissions-payees",
      label: "Commissions payées",
    },
    {
      key: "books",
      href: "/admin/commissions/acces-direction",
      label: "Partage des livres",
    },
  ];

  return (
    <nav
      aria-label="Navigation du module Commissions"
      className="commission-module-subnav"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={
            item.key === active
              ? "commission-module-subnav-link is-active"
              : "commission-module-subnav-link"
          }
        >
          {item.label}
        </Link>
      ))}
      <style jsx>{`
        .commission-module-subnav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 4px;
        }
        .commission-module-subnav :global(.commission-module-subnav-link) {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid #dbe3ef;
          background: #f8fafc;
          color: #0f172a;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
        }
        .commission-module-subnav :global(.commission-module-subnav-link.is-active) {
          background: #0f172a;
          border-color: #0f172a;
          color: #ffffff;
        }
      `}</style>
    </nav>
  );
}

export function CommissionQuickActions({
  actions,
}: {
  actions: CommissionQuickAction[];
}) {
  return (
    <div style={quickGridStyle}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link key={action.key} href={action.href} style={actionCardStyle}>
            <AppCard
              tone={action.primary ? "elevated" : "default"}
              style={{
                height: "100%",
                border: action.primary ? "1px solid #0f172a" : undefined,
              }}
            >
              <div style={{ display: "grid", gap: 10 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: action.primary ? "#0f172a" : "#eef2ff",
                    color: action.primary ? "#fff" : "#1e3a8a",
                  }}
                >
                  <Icon size={18} aria-hidden />
                </span>
                <div style={actionTitleStyle}>{action.title}</div>
                <p style={actionDescStyle}>{action.description}</p>
              </div>
            </AppCard>
          </Link>
        );
      })}
    </div>
  );
}

export function CommissionAmount({
  amountLabel,
  label = "Montant",
}: {
  amountLabel: string;
  label?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      <span style={amountStyle}>{amountLabel}</span>
    </div>
  );
}

export function CommissionProgressBar({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 13,
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        <span>Progression</span>
        <span>{safe}%</span>
      </div>
      <div style={progressTrackStyle} aria-hidden>
        <div
          style={{
            width: `${safe}%`,
            height: "100%",
            background: safe >= 100 ? "#15803d" : "#1d4ed8",
          }}
        />
      </div>
    </div>
  );
}

export function CommissionActionGroup({
  primary,
  secondary,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        marginTop: 4,
      }}
    >
      {primary}
      {secondary}
    </div>
  );
}

export function CommissionNavButtons({
  links,
}: {
  links: Array<{ href: string; label: string; primary?: boolean }>;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {links.map((link) => (
        <Link
          key={`${link.href}-${link.label}`}
          href={link.href}
          className={
            link.primary
              ? "tagora-dark-action tagora-page-navigation-button"
              : "tagora-dark-outline-action tagora-page-navigation-button"
          }
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
