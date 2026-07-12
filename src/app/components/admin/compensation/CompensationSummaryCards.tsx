"use client";

import AdminCommissionsMetricCard from "@/app/components/admin/AdminCommissionsMetricCard";
import { buildListSummaryMetrics } from "@/app/lib/commissions/compensation-engine-ui.shared";
import type { CompensationSaleEvent } from "@/app/lib/commissions/compensation-engine-api.client";
import { CheckCircle2, CircleDollarSign, ShieldAlert, Store } from "lucide-react";

type CompensationSummaryCardsProps = {
  events: CompensationSaleEvent[];
};

export default function CompensationSummaryCards({ events }: CompensationSummaryCardsProps) {
  const metrics = buildListSummaryMetrics(events);

  return (
    <div className="compensation-summary-grid">
      <AdminCommissionsMetricCard
        label="Événements actifs"
        value={metrics.activeCount}
        note="Events status actif"
        icon={<Store size={18} aria-hidden />}
      />
      <AdminCommissionsMetricCard
        label="Admissibles"
        value={metrics.eligibleCount}
        note="Eligibles au calcul"
        icon={<CheckCircle2 size={18} aria-hidden />}
      />
      <AdminCommissionsMetricCard
        label="Non admissibles"
        value={metrics.ineligibleCount}
        note="Rejet eligibility"
        icon={<ShieldAlert size={18} aria-hidden />}
      />
      <AdminCommissionsMetricCard
        label="Base commissionnable totale"
        value={metrics.totalBasisFormatted}
        note="Somme des événements visibles"
        icon={<CircleDollarSign size={18} aria-hidden />}
        valueIsCurrency
      />
    </div>
  );
}
