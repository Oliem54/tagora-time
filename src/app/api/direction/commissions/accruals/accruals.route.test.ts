import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { Accrual, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import type {
  AccrualStatusHistoryRepository,
  AccrualsRepository,
} from "@/app/lib/commissions/accruals.persistence.shared";
import { createCompensationAccrualsService } from "@/app/lib/commissions/compensation-accruals.service.server";
import { createCompensationCalculationService } from "@/app/lib/commissions/compensation-calculation.service.server";

const serviceState = vi.hoisted(() => ({
  service: null as ReturnType<typeof createCompensationAccrualsService> | null,
}));

const requireAdminFinanceCommissionsAccess = vi.hoisted(() => vi.fn());

vi.mock("@/app/api/direction/commissions/_lib", () => ({
  requireAdminFinanceCommissionsAccess,
}));

vi.mock("@/app/lib/commissions/compensation-accruals.service.factory.server", () => ({
  getCompensationAccrualsService: () => {
    if (!serviceState.service) {
      throw new Error("Service compensation accruals non configure pour le test.");
    }
    return serviceState.service;
  },
  setCompensationAccrualsServiceForTests: (
    service: ReturnType<typeof createCompensationAccrualsService> | null
  ) => {
    serviceState.service = service;
  },
}));

import { setCompensationAccrualsServiceForTests } from "@/app/lib/commissions/compensation-accruals.service.factory.server";
import { GET as listAccruals } from "./route";
import { GET as getAccrual } from "./[id]/route";
import { PATCH as patchWorkflow } from "./[id]/workflow/route";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function buildAccrual(overrides: Partial<Accrual> = {}): Accrual {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    compensation_event_id: EVENT_ID,
    component: "commission",
    rule_name: "base",
    label: "Commission base",
    sales_basis_amount: 10000,
    calculated_amount: 500,
    status: "calculated",
    period_start: null,
    period_end: null,
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z",
    created_by: null,
    updated_by: null,
    ...overrides,
  };
}

function createMockRepositories(initialAccruals: Accrual[] = []) {
  const accruals = [...initialAccruals];
  const history: AccrualStatusHistoryEntry[] = [];
  let nextId = 1;

  const repository: AccrualsRepository = {
    list: vi.fn(async (filters) =>
      accruals.filter((row) => {
        if (
          filters?.compensation_event_id &&
          row.compensation_event_id !== filters.compensation_event_id
        ) {
          return false;
        }
        if (filters?.status && row.status !== filters.status) return false;
        return true;
      })
    ),
    listByEventId: vi.fn(async (eventId) =>
      accruals.filter((row) => row.compensation_event_id === eventId)
    ),
    getById: vi.fn(async (id) => accruals.find((row) => row.id === id) ?? null),
    insertMany: vi.fn(async (payloads) => {
      const inserted = payloads.map((payload) => {
        const row: Accrual = {
          id: `accrual-${nextId++}`,
          ...payload,
          created_at: "2026-07-07T12:00:00.000Z",
          updated_at: "2026-07-07T12:00:00.000Z",
        };
        accruals.push(row);
        return row;
      });
      return inserted;
    }),
    updateStatus: vi.fn(async (id, status, audit) => {
      const index = accruals.findIndex((row) => row.id === id);
      if (index < 0) return null;
      accruals[index] = {
        ...accruals[index],
        status,
        updated_by: audit?.actorUserId ?? null,
        updated_at: "2026-07-07T13:00:00.000Z",
      };
      return accruals[index];
    }),
    deleteByEventIdAndStatuses: vi.fn(async () => 0),
  };

  const statusHistoryRepository: AccrualStatusHistoryRepository = {
    listByAccrualId: vi.fn(async (accrualId) =>
      history.filter((entry) => entry.accrual_id === accrualId)
    ),
    append: vi.fn(async (payload) => {
      const entry: AccrualStatusHistoryEntry = {
        id: `history-${history.length + 1}`,
        accrual_id: payload.accrual_id,
        from_status: payload.from_status,
        to_status: payload.to_status,
        changed_at: "2026-07-07T12:00:00.000Z",
        changed_by: payload.changed_by ?? null,
        reason: payload.reason ?? null,
      };
      history.push(entry);
      return entry;
    }),
  };

  return { repository, statusHistoryRepository, accruals, history };
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

function setService(initialAccruals: Accrual[] = []) {
  const { repository, statusHistoryRepository } = createMockRepositories(initialAccruals);
  setCompensationAccrualsServiceForTests(
    createCompensationAccrualsService({
      accrualsRepository: repository,
      statusHistoryRepository,
      calculationService: createCompensationCalculationService({
        eventsService: {
          getSaleEvent: vi.fn(),
        } as never,
      }),
    })
  );
}

describe("accruals HTTP routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setService();
  });

  afterEach(() => {
    setCompensationAccrualsServiceForTests(null);
  });

  it("GET /accruals retourne 403 sans acces admin finance", async () => {
    authDenied(403);
    const response = await listAccruals(
      makeRequest(`/api/direction/commissions/accruals?compensation_event_id=${EVENT_ID}`)
    );
    expect(response.status).toBe(403);
  });

  it("GET /accruals retourne 400 sans compensation_event_id", async () => {
    authOk();
    const response = await listAccruals(makeRequest("/api/direction/commissions/accruals"));
    expect(response.status).toBe(400);
  });

  it("GET /accruals retourne la liste par compensation_event_id", async () => {
    authOk();
    const accrual = buildAccrual();
    setService([accrual]);

    const response = await listAccruals(
      makeRequest(`/api/direction/commissions/accruals?compensation_event_id=${EVENT_ID}`)
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accruals).toHaveLength(1);
    expect(payload.accruals[0].id).toBe(accrual.id);
  });

  it("GET /accruals/[id] retourne 404 si introuvable", async () => {
    authOk();
    const response = await getAccrual(makeRequest("/api/direction/commissions/accruals/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("GET /accruals/[id] retourne le detail et l historique", async () => {
    authOk();
    const accrual = buildAccrual({ status: "under_review" });
    const { repository, statusHistoryRepository, history } = createMockRepositories([accrual]);
    history.push({
      id: "history-1",
      accrual_id: accrual.id,
      from_status: "calculated",
      to_status: "under_review",
      changed_at: "2026-07-07T12:30:00.000Z",
      changed_by: "admin-user-1",
      reason: "Soumission revue",
    });
    setCompensationAccrualsServiceForTests(
      createCompensationAccrualsService({
        accrualsRepository: repository,
        statusHistoryRepository,
        calculationService: createCompensationCalculationService({
          eventsService: { getSaleEvent: vi.fn() } as never,
        }),
      })
    );

    const response = await getAccrual(
      makeRequest(`/api/direction/commissions/accruals/${accrual.id}`),
      { params: Promise.resolve({ id: accrual.id }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accrual.id).toBe(accrual.id);
    expect(payload.history).toHaveLength(1);
    expect(payload.history[0].to_status).toBe("under_review");
  });

  it("PATCH /accruals/[id]/workflow retourne 400 pour action invalide", async () => {
    authOk();
    const accrual = buildAccrual();
    setService([accrual]);

    const response = await patchWorkflow(
      makeRequest(`/api/direction/commissions/accruals/${accrual.id}/workflow`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "pay" }),
      }),
      { params: Promise.resolve({ id: accrual.id }) }
    );

    expect(response.status).toBe(400);
  });

  it("PATCH /accruals/[id]/workflow soumet en revue", async () => {
    authOk();
    const accrual = buildAccrual({ status: "calculated" });
    setService([accrual]);

    const response = await patchWorkflow(
      makeRequest(`/api/direction/commissions/accruals/${accrual.id}/workflow`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "submit_review", reason: "Revue finance" }),
      }),
      { params: Promise.resolve({ id: accrual.id }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accrual.status).toBe("under_review");
    expect(payload.accrual.updated_by).toBe("admin-user-1");
  });

  it("PATCH /accruals/[id]/workflow valide un accrual", async () => {
    authOk();
    const accrual = buildAccrual({ status: "under_review" });
    setService([accrual]);

    const response = await patchWorkflow(
      makeRequest(`/api/direction/commissions/accruals/${accrual.id}/workflow`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      }),
      { params: Promise.resolve({ id: accrual.id }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accrual.status).toBe("validated");
  });

  it("PATCH /accruals/[id]/workflow renvoie en calculated", async () => {
    authOk();
    const accrual = buildAccrual({ status: "under_review" });
    setService([accrual]);

    const response = await patchWorkflow(
      makeRequest(`/api/direction/commissions/accruals/${accrual.id}/workflow`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send_back", reason: "Correction requise" }),
      }),
      { params: Promise.resolve({ id: accrual.id }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accrual.status).toBe("calculated");
  });

  it("PATCH /accruals/[id]/workflow retourne 409 pour transition invalide", async () => {
    authOk();
    const accrual = buildAccrual({ status: "calculated" });
    setService([accrual]);

    const response = await patchWorkflow(
      makeRequest(`/api/direction/commissions/accruals/${accrual.id}/workflow`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      }),
      { params: Promise.resolve({ id: accrual.id }) }
    );

    expect(response.status).toBe(409);
  });
});
