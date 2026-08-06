import { Suspense } from "react";
import AdminFinanceGate from "@/app/components/admin/AdminFinanceGate";
import GenericPayPlansPageClient from "@/app/admin/commissions/plans/GenericPayPlansPageClient";

export default function AdminGenericPayPlansPage() {
  return (
    <AdminFinanceGate moduleLabel="Plans de rémunération">
      <Suspense fallback={<main className="page-container">Chargement…</main>}>
        <GenericPayPlansPageClient />
      </Suspense>
    </AdminFinanceGate>
  );
}
