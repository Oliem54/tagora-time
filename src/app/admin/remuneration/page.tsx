"use client";

import Link from "next/link";
import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";

const FINANCE_MODULE_LINKS = [
  {
    href: "/admin/paie",
    label: "Paie (synthèse)",
    description: "Synthèse des heures et des montants de paie par compagnie.",
  },
  {
    href: "/admin/paie-compagnies",
    label: "Répartition Oliem / Titan",
    description: "Détail des heures par compagnie et ventilation Oliem / Titan.",
  },
  {
    href: "/admin/temps-titan-finance",
    label: "Journal des heures et coûts",
    description: "Saisie des heures, taux horaires, marges et refacturation intercompagnies.",
  },
  {
    href: "/admin/facturation-titan",
    label: "Refacturation intercompagnies",
    description: "Montants à refacturer entre Oliem et Titan par entrée.",
  },
  {
    href: "/admin/commissions",
    label: "Commissions & objectifs",
    description: "Objectifs de vente, règles et suivi des commissions.",
  },
] as const;

export default function AdminRemunerationPage() {
  return (
    <AdminFinanceGate moduleLabel="Finance & rémunération">
      <main className="page-container">
        <AuthenticatedPageHeader
          title="Finance & rémunération"
          subtitle="Accédez aux outils administratifs de paie, de répartition, de coûts et de commissions."
        />

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
      </main>
    </AdminFinanceGate>
  );
}
