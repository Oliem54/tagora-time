"use client";

import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import AdminCommissionBookAccessClient from "@/app/admin/commissions/acces-direction/AdminCommissionBookAccessClient";

export default function AdminCommissionBookAccessPage() {
  return (
    <AdminFinanceGate moduleLabel="Partage des livres de ventes">
      <AdminCommissionBookAccessClient />
    </AdminFinanceGate>
  );
}
