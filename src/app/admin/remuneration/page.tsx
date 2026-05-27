"use client";

import Link from "next/link";
import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import { ADMIN_FINANCE_ROUTE_PREFIXES } from "@/app/lib/auth/admin-finance";

const FINANCE_MODULE_LINKS = [
  { href: "/admin/paie", label: "Paie (synthese)", description: "Vue payroll_company_summary." },
  {
    href: "/admin/paie-compagnies",
    label: "Repartition Oliem / Titan",
    description: "Detail des heures par compagnie et ventilation Oliem / Titan.",
  },
  {
    href: "/admin/temps-titan-finance",
    label: "Journal des heures et couts",
    description: "Saisie des heures, taux horaires, marges et refacturation intercompagnies.",
  },
  {
    href: "/admin/facturation-titan",
    label: "Refacturation intercompagnies",
    description: "Montants a refacturer entre Oliem et Titan par entree.",
  },
  {
    href: "/admin/commissions",
    label: "Commissions & objectifs",
    description: "Objectifs de vente, regles et suivi des commissions.",
  },
] as const;

export default function AdminRemunerationPage() {
  return (
    <AdminFinanceGate moduleLabel="Finance & remuneration">
      <main className="page-container">
        <AuthenticatedPageHeader
          title="Finance & remuneration"
          subtitle="Hub admin pour paie, heures par compagnie, refacturation intercompagnies et donnees financieres reservees a l administration."
        />

        <p className="tagora-note" style={{ marginTop: 0, lineHeight: 1.55 }}>
          Phase 1 : les ecrans financiers existants sont reutilises sous /admin avec protection role
          admin. Un module remuneration dedie (salaire annuel, avances, ventilation 50/50, etc.)
          sera ajoute dans une phase ulterieure.
        </p>

        <div
          className="ui-grid-auto"
          style={{ marginTop: 24, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          {FINANCE_MODULE_LINKS.map((item) => (
            <AppCard key={item.href}>
              <Link href={item.href} className="ui-stack-xs" style={{ textDecoration: "none" }}>
                <strong style={{ color: "#0f172a" }}>{item.label}</strong>
                <span className="ui-text-muted" style={{ fontSize: "0.9rem" }}>
                  {item.description}
                </span>
              </Link>
            </AppCard>
          ))}
        </div>

        <p className="tagora-note" style={{ marginTop: 24, fontSize: "0.85rem" }}>
          Prefixes routes finance admin : {ADMIN_FINANCE_ROUTE_PREFIXES.join(", ")}
        </p>
      </main>
    </AdminFinanceGate>
  );
}
