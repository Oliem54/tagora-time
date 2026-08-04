import { Suspense } from "react";
import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import GenericPayPlanDetailClient from "@/app/admin/commissions/plans/[templateId]/GenericPayPlanDetailClient";

type Params = { params: Promise<{ templateId: string }> };

export default async function AdminGenericPayPlanDetailPage({ params }: Params) {
  const { templateId } = await params;
  return (
    <AdminFinanceGate moduleLabel="Plan de rémunération">
      <Suspense fallback={<main className="page-container">Chargement…</main>}>
        <GenericPayPlanDetailClient templateId={templateId} />
      </Suspense>
    </AdminFinanceGate>
  );
}
