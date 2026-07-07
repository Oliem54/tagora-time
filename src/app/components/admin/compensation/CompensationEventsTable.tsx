"use client";

import Link from "next/link";
import StatusBadge from "@/app/components/ui/StatusBadge";
import type { CompensationSaleEvent } from "@/app/lib/commissions/compensation-engine-api.client";
import {
  compensationEventStatusLabel,
  compensationSaleStateLabel,
  eligibilityTone,
  formatCompensationEventReference,
} from "@/app/lib/commissions/compensation-engine-ui.shared";
import { formatCad } from "@/app/lib/commissions/commissions.shared";

type CompensationEventsTableProps = {
  events: CompensationSaleEvent[];
};

export default function CompensationEventsTable({ events }: CompensationEventsTableProps) {
  if (events.length === 0) {
    return (
      <div className="compensation-empty-state">
        <strong>Aucune vente ne correspond aux filtres.</strong>
        <p>Reinitialisez les filtres ou attendez de nouvelles ventes compensation.</p>
      </div>
    );
  }

  return (
    <div className="compensation-table-wrap compensation-table-wrap--desktop">
      <table className="compensation-premium-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Chauffeur</th>
            <th>Montant</th>
            <th>Vendue le</th>
            <th>Etat cycle</th>
            <th>Statut</th>
            <th>Eligibilite</th>
            <th>Compagnie</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>
                <Link href={`/admin/compensation/ventes/${event.id}`} className="compensation-link">
                  {formatCompensationEventReference(event)}
                </Link>
              </td>
              <td>{event.chauffeur_id ?? "—"}</td>
              <td className="compensation-money">{formatCad(event.amount)}</td>
              <td>{event.sold_at ?? "—"}</td>
              <td>
                <StatusBadge
                  label={compensationSaleStateLabel(event.sale_state)}
                  tone="info"
                />
              </td>
              <td>
                <StatusBadge
                  label={compensationEventStatusLabel(event.status)}
                  tone={event.status === "active" ? "success" : "default"}
                />
              </td>
              <td>
                <StatusBadge
                  label={event.eligibility.is_eligible ? "Admissible" : "Non admissible"}
                  tone={eligibilityTone(event.eligibility.is_eligible)}
                />
              </td>
              <td>{event.company_context ?? "—"}</td>
              <td>
                <Link href={`/admin/compensation/ventes/${event.id}`} className="tagora-dark-outline-action">
                  Voir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
