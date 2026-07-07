"use client";

import StatusBadge from "@/app/components/ui/StatusBadge";
import type { CompensationSaleEvent } from "@/app/lib/commissions/compensation-engine-api.client";
import { eligibilityTone } from "@/app/lib/commissions/compensation-engine-ui.shared";

type CompensationEligibilityPanelProps = {
  event: CompensationSaleEvent;
};

export default function CompensationEligibilityPanel({ event }: CompensationEligibilityPanelProps) {
  const { eligibility } = event;

  return (
    <section className="compensation-side-card">
      <div className="compensation-side-card__header">
        <h2>Eligibilite</h2>
        <StatusBadge
          label={eligibility.is_eligible ? "Admissible" : "Non admissible"}
          tone={eligibilityTone(eligibility.is_eligible)}
        />
      </div>

      {!eligibility.is_eligible && eligibility.rejection_reason ? (
        <p className="compensation-side-card__alert">{eligibility.rejection_reason}</p>
      ) : null}

      <ul className="compensation-eligibility-list">
        {eligibility.criteria_evaluated.map((criterion) => (
          <li key={criterion.criterion}>
            <span className={criterion.passed ? "is-pass" : "is-fail"} aria-hidden="true">
              {criterion.passed ? "✓" : "✗"}
            </span>
            <div>
              <strong>{criterion.message}</strong>
              <span>{criterion.criterion}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
