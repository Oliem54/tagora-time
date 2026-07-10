import { describe, expect, it, vi } from "vitest";
import type { Accrual } from "./accruals.shared";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "./compensation-events.shared";
import type { CompensationSaleEvent } from "./compensation-engine-api.client";
import {
  buildListSummaryMetrics,
  buildProcessingTimelineSteps,
  formatCompensationEventReference,
  getDominantAccrualStatus,
  getProcessingActionVisibility,
  getWorkflowActionsForStatus,
  mapProcessingApiErrorMessage,
  runConfirmedProcessingAction,
} from "./compensation-engine-ui.shared";

function buildEvent(overrides: Partial<CompensationSaleEvent> = {}): CompensationSaleEvent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    event_type: COMPENSATION_EVENT_TYPE_SALE,
    status: COMPENSATION_EVENT_STATUS_ACTIVE,
    sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
    chauffeur_id: 21,
    amount: 10000,
    sold_at: "2026-07-01",
    delivered_at: "2026-07-03",
    invoiced_at: null,
    collected_at: null,
    company_context: "olien",
    external_reference: "VTE-2026-001",
    label: null,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z",
    eligibility: {
      is_eligible: true,
      criteria_evaluated: [],
      rejection_reason: null,
    },
    ...overrides,
  };
}

function buildAccrual(status: Accrual["status"], id = "accrual-1"): Accrual {
  return {
    id,
    compensation_event_id: "11111111-1111-4111-8111-111111111111",
    component: "commission",
    rule_name: "Commission",
    label: "Commission",
    sales_basis_amount: 10000,
    calculated_amount: 500,
    status,
    period_start: null,
    period_end: null,
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z",
    created_by: null,
    updated_by: null,
  };
}

describe("compensation-engine-ui.shared", () => {
  it("formate la reference externe en priorite", () => {
    expect(formatCompensationEventReference(buildEvent())).toBe("VTE-2026-001");
  });

  it("expose les actions workflow selon le statut", () => {
    expect(getWorkflowActionsForStatus("calculated")).toHaveLength(1);
    expect(getWorkflowActionsForStatus("under_review")).toHaveLength(2);
    expect(getWorkflowActionsForStatus("validated")).toHaveLength(0);
  });

  it("calcule le statut dominant des accruals", () => {
    expect(
      getDominantAccrualStatus([buildAccrual("calculated"), buildAccrual("under_review")])
    ).toBe("under_review");
  });

  it("construit une timeline complete pour une vente admissible", () => {
    const steps = buildProcessingTimelineSteps(buildEvent(), [buildAccrual("calculated")]);
    expect(steps.find((step) => step.id === "eligibility")?.state).toBe("done");
    expect(steps.find((step) => step.id === "workflow")?.detail).toBe("Calculée");
  });

  it("bloque la timeline si la vente est ineligible", () => {
    const steps = buildProcessingTimelineSteps(
      buildEvent({
        eligibility: {
          is_eligible: false,
          criteria_evaluated: [],
          rejection_reason: "Livraison requise.",
        },
      }),
      []
    );
    expect(steps.find((step) => step.id === "eligibility")?.state).toBe("blocked");
    expect(steps.find((step) => step.id === "calculation")?.state).toBe("skipped");
  });

  it("resume les metriques de liste", () => {
    const metrics = buildListSummaryMetrics([
      buildEvent(),
      buildEvent({
        id: "22222222-2222-4222-8222-222222222222",
        eligibility: {
          is_eligible: false,
          criteria_evaluated: [],
          rejection_reason: "Livraison requise.",
        },
      }),
    ]);
    expect(metrics.activeCount).toBe(2);
    expect(metrics.eligibleCount).toBe(1);
    expect(metrics.ineligibleCount).toBe(1);
  });

  it("affiche Traiter si vente admissible sans accrual", () => {
    const visibility = getProcessingActionVisibility(true, []);
    expect(visibility.canProcess).toBe(true);
    expect(visibility.canRecalculate).toBe(false);
  });

  it("affiche Recalculer si accruals draft/calculated seulement", () => {
    const visibility = getProcessingActionVisibility(true, [
      buildAccrual("draft"),
      buildAccrual("calculated", "accrual-2"),
    ]);
    expect(visibility.canProcess).toBe(false);
    expect(visibility.canRecalculate).toBe(true);
  });

  it("masque les actions si under_review", () => {
    const visibility = getProcessingActionVisibility(true, [buildAccrual("under_review")]);
    expect(visibility.canProcess).toBe(false);
    expect(visibility.canRecalculate).toBe(false);
    expect(visibility.blockedReason).toBe("under_review");
  });

  it("masque les actions si validated", () => {
    const visibility = getProcessingActionVisibility(true, [buildAccrual("validated")]);
    expect(visibility.canProcess).toBe(false);
    expect(visibility.canRecalculate).toBe(false);
    expect(visibility.blockedReason).toBe("validated");
  });

  it("masque Traiter si vente inadmissible", () => {
    const visibility = getProcessingActionVisibility(false, []);
    expect(visibility.canProcess).toBe(false);
    expect(visibility.blockedReason).toBe("ineligible");
  });

  it("mappe les messages d erreur API", () => {
    expect(mapProcessingApiErrorMessage("INELIGIBLE", "x")).toMatch(/inadmissible/i);
    expect(mapProcessingApiErrorMessage("ALREADY_PROCESSED", "x")).toMatch(/revue/i);
    expect(mapProcessingApiErrorMessage("ALREADY_VALIDATED", "x")).toMatch(/validé/i);
    expect(mapProcessingApiErrorMessage("NOT_FOUND", "x")).toMatch(/introuvable/i);
    expect(mapProcessingApiErrorMessage("FORBIDDEN", "x")).toMatch(/finance/i);
    expect(mapProcessingApiErrorMessage("PERSISTENCE_ERROR", "x")).toMatch(/serveur/i);
  });

  it("confirmation annulee = aucun appel", async () => {
    const execute = vi.fn();
    const onSuccess = vi.fn();
    const outcome = await runConfirmedProcessingAction({
      confirmed: false,
      isBusy: false,
      execute,
      onSuccess,
    });
    expect(outcome).toBe("cancelled");
    expect(execute).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("busy = aucun appel", async () => {
    const execute = vi.fn();
    const outcome = await runConfirmedProcessingAction({
      confirmed: true,
      isBusy: true,
      execute,
      onSuccess: vi.fn(),
    });
    expect(outcome).toBe("skipped_busy");
    expect(execute).not.toHaveBeenCalled();
  });

  it("succes = refresh appele", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    const outcome = await runConfirmedProcessingAction({
      confirmed: true,
      isBusy: false,
      execute,
      onSuccess,
    });
    expect(outcome).toEqual({ ok: true, value: { ok: true } });
    expect(onSuccess).toHaveBeenCalledWith({ ok: true });
  });
});
