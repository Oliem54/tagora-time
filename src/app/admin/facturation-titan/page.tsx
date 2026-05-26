"use client";

import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import FacturationTitanPage from "@/app/direction/facturation-titan/DirectionFacturationTitanFinancePage";

export default function AdminFacturationTitanPage() {
  return (
    <AdminFinanceGate moduleLabel="Facturation Titan">
      <FacturationTitanPage />
    </AdminFinanceGate>
  );
}
