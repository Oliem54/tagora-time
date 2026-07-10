import { afterEach, describe, expect, it, vi } from "vitest";

const commissionsFetch = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/commissions/commissions-api.client", () => ({
  commissionsFetch,
}));

import {
  CompensationProcessingApiError,
  processCompensationSaleEvent,
  recalculateCompensationSaleEvent,
} from "./compensation-engine-api.client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const successResult = {
  ok: true,
  compensation_id: "event-1",
  session_id: "session-1",
  run_id: "run-1",
  sales_event_id: "event-1",
  finance_status: "CALCULATED",
  eligibility: { is_eligible: true, criteria_evaluated: [], rejection_reason: null },
  summary: {
    run_id: "run-1",
    execution_type: "initial",
    status: "succeeded",
    started_at: "2026-07-10T12:00:00.000Z",
    finished_at: "2026-07-10T12:00:01.000Z",
    duration_ms: 1000,
    accruals_created_count: 1,
    total_calculated_amount_cents: 500,
    warnings: [],
    triggered_by_user_id: "admin-1",
  },
  accruals: [],
  calculation_lines: [],
  errors: [],
  code: null,
  meta: {
    api_version: "1.0",
    dto_version: "1.0",
    engine_version: "compensation-engine@1.0.0",
    correlation_id: "corr-1",
  },
};

describe("compensation-engine-api.client processing", () => {
  afterEach(() => {
    commissionsFetch.mockReset();
  });

  it("processCompensationSaleEvent retourne le DTO en succes", async () => {
    commissionsFetch.mockResolvedValue(jsonResponse(200, { result: successResult }));

    const result = await processCompensationSaleEvent("event-1");

    expect(result.run_id).toBe("run-1");
    expect(commissionsFetch).toHaveBeenCalledWith(
      "/api/direction/commissions/sales-events/event-1/process",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("processCompensationSaleEvent propage le code d erreur", async () => {
    commissionsFetch.mockResolvedValue(
      jsonResponse(422, {
        error: "Vente non admissible.",
        code: "INELIGIBLE",
      })
    );

    await expect(processCompensationSaleEvent("event-1")).rejects.toMatchObject({
      name: "CompensationProcessingApiError",
      code: "INELIGIBLE",
    } satisfies Partial<CompensationProcessingApiError>);
  });

  it("recalculateCompensationSaleEvent retourne le DTO en succes", async () => {
    commissionsFetch.mockResolvedValue(
      jsonResponse(200, {
        result: {
          ...successResult,
          summary: { ...successResult.summary, execution_type: "recalculate" },
        },
      })
    );

    const result = await recalculateCompensationSaleEvent("event-1");

    expect(result.summary.execution_type).toBe("recalculate");
    expect(commissionsFetch).toHaveBeenCalledWith(
      "/api/direction/commissions/sales-events/event-1/recalculate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("recalculateCompensationSaleEvent propage ALREADY_VALIDATED", async () => {
    commissionsFetch.mockResolvedValue(
      jsonResponse(422, {
        error: "Deja valide.",
        code: "ALREADY_VALIDATED",
      })
    );

    await expect(recalculateCompensationSaleEvent("event-1")).rejects.toMatchObject({
      code: "ALREADY_VALIDATED",
    });
  });
});
