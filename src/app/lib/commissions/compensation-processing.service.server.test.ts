import { describe, expect, it, vi } from "vitest";
import type { Accrual, AccrualStatusHistoryEntry } from "./accruals.shared";
import type {
  AccrualStatusHistoryRepository,
  AccrualsRepository,
} from "./accruals.persistence.shared";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_SOLD,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "./compensation-events.shared";
import type { CompensationEventRow } from "./compensation-events.mapper.server";
import { createCompensationEventsService } from "./compensation-events.service.server";
import type { CompensationEventsRepository } from "./compensation-events.persistence.shared";
import { createCompensationProcessingService } from "./compensation-processing.service.server";

const RULES = [{ rule_type: "percentage", percentage_rate: 5, rule_name: "Commission" }];

function buildEventRow(overrides: Partial<CompensationEventRow> = {}): CompensationEventRow {
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
    company_context: null,
    external_reference: null,
    label: null,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z",
    ...overrides,
  };
}

function createMockAccrualsRepository(initialAccruals: Accrual[] = []) {
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
    deleteByEventIdAndStatuses: vi.fn(async (eventId, statuses) => {
      const before = accruals.length;
      for (let i = accruals.length - 1; i >= 0; i -= 1) {
        const row = accruals[i];
        if (row.compensation_event_id === eventId && statuses.includes(row.status)) {
          accruals.splice(i, 1);
        }
      }
      return before - accruals.length;
    }),
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

function createEventsRepository(rows: CompensationEventRow[]): CompensationEventsRepository {
  return {
    list: vi.fn(async () => rows),
    getById: vi.fn(async (id) => rows.find((row) => row.id === id) ?? null),
    insert: vi.fn(),
    update: vi.fn(),
  };
}

function createProcessingService(
  rows: CompensationEventRow[],
  initialAccruals: Accrual[] = []
) {
  const mocks = createMockAccrualsRepository(initialAccruals);
  const eventsRepository = createEventsRepository(rows);
  const service = createCompensationProcessingService({
    eventsService: createCompensationEventsService({ repository: eventsRepository }),
    accrualsRepository: mocks.repository,
    statusHistoryRepository: mocks.statusHistoryRepository,
  });

  return { service, mocks };
}

describe("createCompensationProcessingService", () => {
  it("retourne un ProcessingResult complet pour une vente admissible", async () => {
    const row = buildEventRow();
    const { service } = createProcessingService([row]);

    const result = await service.processCompensationEventById(row.id, RULES, undefined, {
      actorUserId: "admin-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.event.id).toBe(row.id);
    expect(result.value.event.eligibility.is_eligible).toBe(true);
    expect(result.value.context.is_calculable).toBe(true);
    expect(result.value.calculation.lines).toHaveLength(1);
    expect(result.value.calculation.lines[0]?.calculated_amount).toBe(500);
    expect(result.value.accrual_drafts).toHaveLength(1);
    expect(result.value.accruals).toHaveLength(1);
    expect(result.value.accruals[0]?.status).toBe("calculated");
    expect(result.value.history[0]?.to_status).toBe("calculated");
  });

  it("retourne NOT_FOUND si la vente est introuvable", async () => {
    const { service } = createProcessingService([]);

    const result = await service.processCompensationEventById("missing", RULES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
  });

  it("retourne INELIGIBLE sans persister si la vente nest pas admissible", async () => {
    const row = buildEventRow({
      sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
      delivered_at: null,
    });
    const { service, mocks } = createProcessingService([row]);

    const result = await service.processCompensationEventById(row.id, RULES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INELIGIBLE");
    expect(mocks.accruals).toHaveLength(0);
  });

  it("retourne VALIDATION si les regles sont invalides", async () => {
    const row = buildEventRow();
    const { service, mocks } = createProcessingService([row]);

    const result = await service.processCompensationEventById(row.id, [
      { rule_type: "percentage", percentage_rate: -1, rule_name: "Commission" },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("VALIDATION");
    expect(mocks.accruals).toHaveLength(0);
  });

  it("remplace les accruals draft/calculated lors d un recalcul", async () => {
    const row = buildEventRow();
    const { service, mocks } = createProcessingService([row]);

    const first = await service.processCompensationEventById(row.id, RULES);
    expect(first.ok).toBe(true);

    const second = await service.processCompensationEventById(row.id, [
      { rule_type: "percentage", percentage_rate: 10, rule_name: "Commission" },
    ]);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.accruals).toHaveLength(1);
    expect(second.value.accruals[0]?.calculated_amount).toBe(1000);
    expect(mocks.accruals).toHaveLength(1);
  });

  it("bloque le recalcul si un accrual est under_review", async () => {
    const row = buildEventRow();
    const protectedAccrual: Accrual = {
      id: "protected-1",
      compensation_event_id: row.id,
      component: "commission",
      rule_name: "Commission",
      label: "Commission",
      sales_basis_amount: 10000,
      calculated_amount: 500,
      status: "under_review",
      period_start: null,
      period_end: null,
      created_at: "2026-07-07T12:00:00.000Z",
      updated_at: "2026-07-07T12:00:00.000Z",
      created_by: null,
      updated_by: null,
    };
    const { service } = createProcessingService([row], [protectedAccrual]);

    const result = await service.processCompensationEventById(row.id, RULES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ALREADY_PROCESSED");
  });

  it("bloque le recalcul si un accrual est validated (prioritaire)", async () => {
    const row = buildEventRow();
    const accruals: Accrual[] = [
      {
        id: "validated-1",
        compensation_event_id: row.id,
        component: "commission",
        rule_name: "Commission",
        label: "Commission",
        sales_basis_amount: 10000,
        calculated_amount: 500,
        status: "validated",
        period_start: null,
        period_end: null,
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z",
        created_by: null,
        updated_by: null,
      },
      {
        id: "review-1",
        compensation_event_id: row.id,
        component: "commission",
        rule_name: "Commission",
        label: "Commission",
        sales_basis_amount: 10000,
        calculated_amount: 500,
        status: "under_review",
        period_start: null,
        period_end: null,
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z",
        created_by: null,
        updated_by: null,
      },
    ];
    const { service } = createProcessingService([row], accruals);

    const result = await service.processCompensationEventById(row.id, RULES);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ALREADY_VALIDATED");
  });
});
