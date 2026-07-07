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
import { createCompensationCalculationService } from "./compensation-calculation.service.server";
import { createCompensationAccrualsService } from "./compensation-accruals.service.server";

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

function createMockAccrualsRepository() {
  const accruals: Accrual[] = [];
  const history: AccrualStatusHistoryEntry[] = [];
  let nextId = 1;

  const repository: AccrualsRepository = {
    list: vi.fn(async (filters) => {
      return accruals.filter((row) => {
        if (
          filters?.compensation_event_id &&
          row.compensation_event_id !== filters.compensation_event_id
        ) {
          return false;
        }
        if (filters?.status && row.status !== filters.status) return false;
        return true;
      });
    }),
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

describe("createCompensationAccrualsService", () => {
  it("persiste des accruals calculated pour un event admissible", async () => {
    const row = buildEventRow();
    const mocks = createMockAccrualsRepository();
    const eventsRepository = createEventsRepository([row]);
    const calculationService = createCompensationCalculationService({
      eventsService: createCompensationEventsService({ repository: eventsRepository }),
    });
    const service = createCompensationAccrualsService({
      accrualsRepository: mocks.repository,
      statusHistoryRepository: mocks.statusHistoryRepository,
      calculationService,
    });

    const result = await service.calculateAndPersistAccrualsForEventId(row.id, [
      { rule_type: "percentage", percentage_rate: 5, rule_name: "Commission" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accruals).toHaveLength(1);
    expect(result.value.accruals[0]?.status).toBe("calculated");
    expect(result.value.history[0]?.from_status).toBeNull();
    expect(result.value.history[0]?.to_status).toBe("calculated");
  });

  it("retourne INELIGIBLE sans persister", async () => {
    const row = buildEventRow({
      sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
      delivered_at: null,
    });
    const mocks = createMockAccrualsRepository();
    const eventsRepository = createEventsRepository([row]);
    const calculationService = createCompensationCalculationService({
      eventsService: createCompensationEventsService({ repository: eventsRepository }),
    });
    const service = createCompensationAccrualsService({
      accrualsRepository: mocks.repository,
      statusHistoryRepository: mocks.statusHistoryRepository,
      calculationService,
    });

    const result = await service.calculateAndPersistAccrualsForEventId(row.id, [
      { rule_type: "fixed", fixed_amount: 100 },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INELIGIBLE");
    expect(mocks.accruals).toHaveLength(0);
  });

  it("remplace les accruals draft/calculated lors d un recalcul", async () => {
    const row = buildEventRow();
    const mocks = createMockAccrualsRepository();
    const eventsRepository = createEventsRepository([row]);
    const calculationService = createCompensationCalculationService({
      eventsService: createCompensationEventsService({ repository: eventsRepository }),
    });
    const service = createCompensationAccrualsService({
      accrualsRepository: mocks.repository,
      statusHistoryRepository: mocks.statusHistoryRepository,
      calculationService,
    });

    const first = await service.calculateAndPersistAccrualsForEventId(row.id, [
      { rule_type: "percentage", percentage_rate: 5, rule_name: "Commission" },
    ]);
    expect(first.ok).toBe(true);

    const second = await service.calculateAndPersistAccrualsForEventId(row.id, [
      { rule_type: "percentage", percentage_rate: 10, rule_name: "Commission" },
    ]);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.accruals).toHaveLength(1);
    expect(second.value.accruals[0]?.calculated_amount).toBe(1000);
    expect(mocks.accruals).toHaveLength(1);
  });

  it("execute le workflow finance minimal", async () => {
    const row = buildEventRow();
    const mocks = createMockAccrualsRepository();
    const eventsRepository = createEventsRepository([row]);
    const calculationService = createCompensationCalculationService({
      eventsService: createCompensationEventsService({ repository: eventsRepository }),
    });
    const service = createCompensationAccrualsService({
      accrualsRepository: mocks.repository,
      statusHistoryRepository: mocks.statusHistoryRepository,
      calculationService,
    });

    const persisted = await service.calculateAndPersistAccrualsForEventId(row.id, [
      { rule_type: "fixed", fixed_amount: 250, rule_name: "Commission" },
    ]);
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;

    const accrualId = persisted.value.accruals[0]?.id;
    if (!accrualId) throw new Error("missing accrual");

    const review = await service.submitForReview(accrualId);
    expect(review.ok).toBe(true);

    const validated = await service.validateAccrual(accrualId);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.accrual.status).toBe("validated");

    const history = await service.listAccrualStatusHistory(accrualId);
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value.length).toBeGreaterThanOrEqual(3);
  });
});
