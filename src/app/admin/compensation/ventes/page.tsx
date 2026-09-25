"use client";

import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import AdminCommissionsPageClient from "@/app/admin/commissions/AdminCommissionsPageClient";

export default function AdminCompensationVentesPage() {
  return (
    <AdminFinanceGate moduleLabel="Commissions">
      <AdminCommissionsPageClient />
    </AdminFinanceGate>
  );
}
