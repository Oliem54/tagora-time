"use client";

import { Suspense } from "react";
import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import AdminCommissionsPageClient from "@/app/admin/commissions/AdminCommissionsPageClient";

export default function AdminCommissionsPage() {
  return (
    <AdminFinanceGate moduleLabel="Commissions">
      <Suspense fallback={<main className="page-container">Chargement…</main>}>
        <AdminCommissionsPageClient />
      </Suspense>
    </AdminFinanceGate>
  );
}
