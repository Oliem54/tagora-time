import { Suspense } from "react";
import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import GenericPayPlanResultClient from "@/app/admin/commissions/plans/results/[accrualId]/GenericPayPlanResultClient";

type Params = { params: Promise<{ accrualId: string }> };

export default async function AdminGenericPayPlanResultPage({ params }: Params) {
  const { accrualId } = await params;
  return (
    <AdminFinanceGate moduleLabel="Résultat de commission">
      <Suspense fallback={<main className="page-container">Chargement…</main>}>
        <GenericPayPlanResultClient accrualId={accrualId} />
      </Suspense>
    </AdminFinanceGate>
  );
}
