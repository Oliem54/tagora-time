"use client";

import type { ProcessingTimelineStep } from "@/app/lib/commissions/compensation-engine-ui.shared";

type CompensationProcessingTimelineProps = {
  steps: ProcessingTimelineStep[];
};

function stepClass(state: ProcessingTimelineStep["state"]) {
  if (state === "done") return "compensation-timeline-step--done";
  if (state === "blocked") return "compensation-timeline-step--blocked";
  if (state === "skipped") return "compensation-timeline-step--skipped";
  return "compensation-timeline-step--pending";
}

export default function CompensationProcessingTimeline({
  steps,
}: CompensationProcessingTimelineProps) {
  return (
    <section className="compensation-panel">
      <div className="compensation-panel__header">
        <h2>Timeline Processing</h2>
        <p>Pipeline serveur Compensation Engine (lecture seule)</p>
      </div>
      <ol className="compensation-timeline">
        {steps.map((step, index) => (
          <li key={step.id} className={`compensation-timeline-step ${stepClass(step.state)}`}>
            <div className="compensation-timeline-step__marker" aria-hidden="true">
              {index + 1}
            </div>
            <div className="compensation-timeline-step__content">
              <strong>{step.label}</strong>
              {step.detail ? <span>{step.detail}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
