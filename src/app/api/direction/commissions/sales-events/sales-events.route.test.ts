import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_SOLD,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "@/app/lib/commissions/compensation-events.shared";
import type { CompensationEventRecordWithEligibility } from "@/app/lib/commissions/compensation-events.service.server";
import { createCompensationEventsService } from "@/app/lib/commissions/compensation-events.service.server";
import type { CompensationEventRow } from "@/app/lib/commissions/compensation-events.mapper.server";
import type { CompensationEventsRepository } from "@/app/lib/commissions/compensation-events.persistence.shared";

const serviceState = vi.hoisted(() => ({
  service: null as ReturnType<typeof createCompensationEventsService> | null,
}));

const requireAdminFinanceCommissionsAccess = vi.hoisted(() => vi.fn());

vi.mock("@/app/api/direction/commissions/_lib", () => ({
  requireAdminFinanceCommissionsAccess,
}));

vi.mock("@/app/lib/commissions/compensation-events.service.factory.server", () => ({
  getCompensationEventsService: () => {
    if (!serviceState.service) {
      throw new Error("Service compensation events non configure pour le test.");
    }
    return serviceState.service;
  },
  setCompensationEventsServiceForTests: (
    service: ReturnType<typeof createCompensationEventsService> | null
  ) => {
    serviceState.service = service;
  },
}));

import { setCompensationEventsServiceForTests } from "@/app/lib/commissions/compensation-events.service.factory.server";
import { GET as listEvents, POST as createEvent } from "./route";
import { GET as getEvent, PATCH as patchEvent } from "./[id]/route";

function buildRow(overrides: Partial<CompensationEventRow> = {}): CompensationEventRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    event_type: COMPENSATION_EVENT_TYPE_SALE,
    status: COMPENSATION_EVENT_STATUS_ACTIVE,
    sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
    chauffeur_id: 21,
    amount: 1200,
    sold_at: "2026-07-01",
    delivered_at: null,
    invoiced_at: null,
    collected_at: null,
    company_context: null,
    external_reference: null,
    label: null,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-07-06T12:00:00.000Z",
    updated_at: "2026-07-06T12:00:00.000Z",
    ...overrides,
  };
}

function createMockRepository(
  initialRows: CompensationEventRow[] = []
): CompensationEventsRepository & { rows: CompensationEventRow[] } {
  const rows = [...initialRows];

  return {
    rows,
    list: vi.fn(async (filters) =>
      rows.filter((row) => {
        if (filters?.chauffeur_id != null && row.chauffeur_id !== filters.chauffeur_id) {
          return false;
        }
        if (filters?.status && row.status !== filters.status) return false;
        if (filters?.sale_state && row.sale_state !== filters.sale_state) return false;
        return true;
      })
    ),
    getById: vi.fn(async (id) => rows.find((row) => row.id === id) ?? null),
    insert: vi.fn(async (payload) => {
      const row = buildRow({
        id: "22222222-2222-4222-8222-222222222222",
        event_type: payload.event_type,
        status: payload.status,
        sale_state: payload.sale_state,
        chauffeur_id: payload.chauffeur_id,
        amount: payload.amount,
        sold_at: payload.sold_at,
        delivered_at: payload.delivered_at,
        invoiced_at: payload.invoiced_at,
        collected_at: payload.collected_at,
        company_context: payload.company_context,
        external_reference: payload.external_reference,
        label: payload.label,
        notes: payload.notes,
        created_by: payload.created_by ?? null,
        updated_by: payload.updated_by ?? null,
      });
      rows.push(row);
      return row;
    }),
    update: vi.fn(async (id, payload) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return null;
      const updated = buildRow({
        ...rows[index],
        event_type: payload.event_type,
        status: payload.status,
        sale_state: payload.sale_state,
        chauffeur_id: payload.chauffeur_id,
        amount: payload.amount,
        sold_at: payload.sold_at,
        delivered_at: payload.delivered_at,
        invoiced_at: payload.invoiced_at,
        collected_at: payload.collected_at,
        company_context: payload.company_context,
        external_reference: payload.external_reference,
        label: payload.label,
        notes: payload.notes,
        updated_by: payload.updated_by ?? null,
      });
      rows[index] = updated;
      return updated;
    }),
  };
}

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

function authDenied(status = 403) {
  requireAdminFinanceCommissionsAccess.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: "Acces refuse." }, { status }),
  });
}

describe("sales-events HTTP routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const repository = createMockRepository();
    setCompensationEventsServiceForTests(createCompensationEventsService({ repository }));
  });

  afterEach(() => {
    setCompensationEventsServiceForTests(null);
  });

  it("GET /sales-events retourne 403 sans acces admin finance", async () => {
    authDenied(403);
    const response = await listEvents(makeRequest("/api/direction/commissions/sales-events"));
    expect(response.status).toBe(403);
  });

  it("GET /sales-events retourne la liste", async () => {
    authOk();
    setCompensationEventsServiceForTests(
      createCompensationEventsService({ repository: createMockRepository([buildRow()]) })
    );

    const response = await listEvents(
      makeRequest("/api/direction/commissions/sales-events?chauffeur_id=21")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(payload.events)).toBe(true);
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].eligibility).toBeDefined();
  });

  it("POST /sales-events cree une vente valide", async () => {
    authOk();
    setCompensationEventsServiceForTests(
      createCompensationEventsService({ repository: createMockRepository() })
    );

    const response = await createEvent(
      makeRequest("/api/direction/commissions/sales-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chauffeur_id: 21,
          amount: 1500,
          sold_at: "2026-07-01",
          sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
          delivered_at: "2026-07-03",
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.event.id).toBeTruthy();
    expect(payload.event.event_type).toBe(COMPENSATION_EVENT_TYPE_SALE);
    expect(payload.event.eligibility.is_eligible).toBe(true);
  });

  it("POST /sales-events retourne 400 si validation echoue", async () => {
    authOk();
    const response = await createEvent(
      makeRequest("/api/direction/commissions/sales-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_type: "delivery",
          chauffeur_id: 21,
          amount: 100,
        }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("GET /sales-events/[id] retourne 404 si introuvable", async () => {
    authOk();
    const response = await getEvent(makeRequest("/api/direction/commissions/sales-events/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("GET /sales-events/[id] retourne le detail", async () => {
    authOk();
    const row = buildRow();
    setCompensationEventsServiceForTests(
      createCompensationEventsService({ repository: createMockRepository([row]) })
    );

    const response = await getEvent(
      makeRequest(`/api/direction/commissions/sales-events/${row.id}`),
      { params: Promise.resolve({ id: row.id }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect((payload.event as CompensationEventRecordWithEligibility).id).toBe(row.id);
  });

  it("PATCH /sales-events/[id] met a jour une vente", async () => {
    authOk();
    const row = buildRow();
    setCompensationEventsServiceForTests(
      createCompensationEventsService({ repository: createMockRepository([row]) })
    );

    const response = await patchEvent(
      makeRequest(`/api/direction/commissions/sales-events/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
          delivered_at: "2026-07-04",
          sold_at: "2026-07-01",
        }),
      }),
      { params: Promise.resolve({ id: row.id }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.event.sale_state).toBe(COMPENSATION_EVENT_SALE_STATE_DELIVERED);
    expect(payload.event.eligibility.is_eligible).toBe(true);
  });
});
