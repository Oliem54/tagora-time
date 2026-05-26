"use client";

import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import DirectionPayrollByCompanyPage from "@/app/direction/paie-compagnies/DirectionPaieCompagniesFinancePage";

export default function AdminPaieCompagniesPage() {
  return (
    <AdminFinanceGate moduleLabel="Paie par compagnie">
      <DirectionPayrollByCompanyPage />
    </AdminFinanceGate>
  );
}
