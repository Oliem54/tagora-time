"use client";

import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";

export default function AdminCommissionsPage() {
  return (
    <AdminFinanceGate moduleLabel="Commissions">
      <main className="page-container">
        <AuthenticatedPageHeader
          title="Commissions & objectifs"
          subtitle="Module commissions a venir sur cette branche isolee."
        />

        <AppCard className="ui-stack-sm" style={{ marginTop: 24, maxWidth: 720 }}>
          <p style={{ margin: 0, lineHeight: 1.6, color: "#334155" }}>
            Module commissions a venir. Le MVP commissions (objectifs, API Direction, migration
            Supabase) n&apos;est pas inclus dans cette branche isolee Phase 1 + 2A.
          </p>
          <p className="tagora-note" style={{ margin: 0 }}>
            Les modules paie, temps Titan, facturation Titan et remuneration restent disponibles
            sous /admin. Aucune route /direction/commissions n&apos;est exposee ici.
          </p>
        </AppCard>
      </main>
    </AdminFinanceGate>
  );
}
