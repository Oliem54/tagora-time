"use client";

import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import DirectionPayrollPage from "@/app/direction/paie/DirectionPaieFinancePage";

export default function AdminPaiePage() {
  return (
    <AdminFinanceGate moduleLabel="Paie">
      <DirectionPayrollPage />
    </AdminFinanceGate>
  );
}
