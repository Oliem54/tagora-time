"use client";

import type { Accrual } from "@/app/lib/commissions/accruals.shared";
import { formatCad } from "@/app/lib/commissions/commissions.shared";
import { summarizeCalculationLines } from "@/app/lib/commissions/compensation-engine-ui.shared";

type CompensationCalculationPanelProps = {
  accruals: Accrual[];
};

export default function CompensationCalculationPanel({ accruals }: CompensationCalculationPanelProps) {
  const lines = summarizeCalculationLines(accruals);

  return (
    <section className="compensation-panel">
      <div className="compensation-panel__header">
        <h2>Resultat de calcul</h2>
        <p>Lignes derivees des accruals persistes (Processing Result V1)</p>
      </div>

      {lines.length === 0 ? (
        <div className="compensation-empty-state compensation-empty-state--compact">
          <strong>Aucun resultat de calcul disponible.</strong>
          <p>La vente est admissible mais aucun accrual n a encore ete persiste.</p>
        </div>
      ) : (
        <div className="compensation-table-wrap">
          <table className="compensation-premium-table">
            <thead>
              <tr>
                <th>Regle</th>
                <th>Composant</th>
                <th>Libelle</th>
                <th>Base</th>
                <th>Montant calcule</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.rule_name}</td>
                  <td>{line.component}</td>
                  <td>{line.label}</td>
                  <td className="compensation-money">{formatCad(line.sales_basis_amount)}</td>
                  <td className="compensation-money compensation-money--strong">
                    {formatCad(line.calculated_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
