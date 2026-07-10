import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { CompensationProcessingResult } from "@/app/lib/commissions/compensation-processing.shared";

const requireAdminFinanceCommissionsAccess = vi.hoisted(() => vi.fn());
const getCompensationProcessingService = vi.hoisted(() => vi.fn());

vi.mock("@/app/api/direction/commissions/_lib", () => ({
  requireAdminFinanceCommissionsAccess,
}));

vi.mock("@/app/lib/commissions/compensation-processing.service.factory.server", () => ({
  getCompensationProcessingService,
}));

import { POST as recalculateEvent } from "./route";
import { POST as processEvent } from "../process/route";

function makeRequest(path: string, init?: RequestInit) {
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}

function authOk() {
  requireAdminFinanceCommissionsAccess.mockResolvedValue({
    ok: true,
    user: { id: "admin-user-1" },
    supabase: {},
  });
}

function authDenied(status = 403, message = "Acces reserve a l administration finance.") {
  requireAdminFinanceCommissionsAccess.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: message }, { status }),
  });
}

function mockProcessingService(result: CompensationProcessingResult) {
  const processCompensationEventById = vi.fn().mockResolvedValue(result);
  getCompensationProcessingService.mockReturnValue({
    processCompensationEventById,
  });
  return processCompensationEventById;
}

function successResult(): CompensationProcessingResult {
  return {
    ok: true,
    value: {
      event: {
        id: "11111111-1111-4111-8111-111111111111",
        event_type: "sale",
        status: "active",
        sale_state: "delivered",
        chauffeur_id: 21,
        amount: 10000,
        sold_at: "2026-07-01",
        delivered_at: "2026-07-03",
        invoiced_at: null,
        collected_at: null,
        company_context: null,
        external_reference: null,
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
      },
      context: {
        event: {
          id: "11111111-1111-4111-8111-111111111111",
          event_type: "sale",
          status: "active",
          sale_state: "delivered",
          chauffeur_id: 21,
          amount: 10000,
          sold_at: "2026-07-01",
          delivered_at: "2026-07-03",
          invoiced_at: null,
          collected_at: null,
          company_context: null,
          external_reference: null,
          label: null,
          notes: null,
        },
        eligibility: {
          is_eligible: true,
          criteria_evaluated: [],
          rejection_reason: null,
        },
        rules: [],
        sales_basis_amount: 10000,
        calculation_params: {},
        is_calculable: true,
        rejection_reason: null,
      },
      calculation: {
        lines: [
          {
            rule_name: "Commission",
            component: "commission",
            sales_basis_amount: 10000,
            calculated_amount: 500,
          },
        ],
        skipped: false,
        rejection_reason: null,
      },
      accrual_drafts: [],
      accruals: [
        {
          id: "accrual-1",
          compensation_event_id: "11111111-1111-4111-8111-111111111111",
          component: "commission",
          rule_name: "Commission",
          label: "Commission",
          sales_basis_amount: 10000,
          calculated_amount: 500,
          status: "calculated",
          period_start: null,
          period_end: null,
          created_at: "2026-07-07T12:00:00.000Z",
          updated_at: "2026-07-07T12:00:00.000Z",
          created_by: "admin-user-1",
          updated_by: "admin-user-1",
        },
      ],
      history: [],
    },
  };
}

describe("POST /sales-events/[id]/recalculate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    getCompensationProcessingService.mockReset();
  });

  it("retourne 401 UNAUTHORIZED sans auth", async () => {
    authDenied(401, "Authentification requise.");

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("UNAUTHORIZED");
  });

  it("retourne 403 FORBIDDEN sans acces admin finance", async () => {
    authDenied(403);

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("FORBIDDEN");
  });

  it("retourne 200 avec execution_type recalculate", async () => {
    authOk();
    mockProcessingService(successResult());

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotency_key: "idem-recalc-1" }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result.ok).toBe(true);
    expect(payload.result.summary.execution_type).toBe("recalculate");
    expect(payload.result.meta.api_version).toBe("1.0");
  });

  it("retourne 404 NOT_FOUND", async () => {
    authOk();
    mockProcessingService({
      ok: false,
      code: "NOT_FOUND",
      errors: ["Vente introuvable."],
    });

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/missing/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.code).toBe("NOT_FOUND");
  });

  it("retourne 422 INELIGIBLE", async () => {
    authOk();
    mockProcessingService({
      ok: false,
      code: "INELIGIBLE",
      errors: ["Livraison requise."],
    });

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("INELIGIBLE");
  });

  it("retourne 422 VALIDATION_ERROR", async () => {
    authOk();
    mockProcessingService({
      ok: false,
      code: "VALIDATION",
      errors: ["Regle 1: montant fixe invalide."],
    });

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("VALIDATION_ERROR");
  });

  it("retourne 422 ALREADY_PROCESSED si under_review", async () => {
    authOk();
    mockProcessingService({
      ok: false,
      code: "ALREADY_PROCESSED",
      errors: ["Recalcul impossible: des accruals sont en revue."],
    });

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("ALREADY_PROCESSED");
  });

  it("retourne 422 ALREADY_VALIDATED si validated", async () => {
    authOk();
    mockProcessingService({
      ok: false,
      code: "ALREADY_VALIDATED",
      errors: ["Recalcul impossible: au moins un accrual est deja valide."],
    });

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("ALREADY_VALIDATED");
  });

  it("retourne 422 ALREADY_VALIDATED si melange validated + under_review", async () => {
    authOk();
    mockProcessingService({
      ok: false,
      code: "ALREADY_VALIDATED",
      errors: ["Recalcul impossible: au moins un accrual est deja valide."],
    });

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("ALREADY_VALIDATED");
  });

  it("autorise le recalcul pour draft/calculated uniquement", async () => {
    authOk();
    const processFn = mockProcessingService(successResult());

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result.summary.execution_type).toBe("recalculate");
    expect(processFn).toHaveBeenCalledOnce();
  });

  it("retourne 500 PERSISTENCE_ERROR", async () => {
    authOk();
    mockProcessingService({
      ok: false,
      code: "PERSISTENCE",
      errors: ["Erreur base de donnees."],
    });

    const response = await recalculateEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/recalculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.code).toBe("PERSISTENCE_ERROR");
  });

  it("non-regression process: execution_type initial et mapping erreurs", async () => {
    authOk();
    mockProcessingService(successResult());

    const okResponse = await processEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/process", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const okPayload = await okResponse.json();

    expect(okResponse.status).toBe(200);
    expect(okPayload.result.summary.execution_type).toBe("initial");

    mockProcessingService({
      ok: false,
      code: "ALREADY_PROCESSED",
      errors: ["Recalcul impossible: des accruals sont en revue."],
    });

    const blocked = await processEvent(
      makeRequest("/api/direction/commissions/sales-events/event-1/process", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "event-1" }) }
    );
    const blockedPayload = await blocked.json();

    expect(blocked.status).toBe(422);
    expect(blockedPayload.code).toBe("ALREADY_PROCESSED");
  });
});
