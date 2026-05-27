"use client";

import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import TempsTitanPage from "@/app/direction/temps-titan/DirectionTempsTitanFinancePage";

export default function AdminTempsTitanFinancePage() {
  return (
    <AdminFinanceGate moduleLabel="Journal des heures et couts">
      <TempsTitanPage />
    </AdminFinanceGate>
  );
}
