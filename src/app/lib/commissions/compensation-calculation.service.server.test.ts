import { describe, expect, it, vi } from "vitest";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_SOLD,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "./compensation-events.shared";
import type { CompensationEventRow } from "./compensation-events.mapper.server";
import { createCompensationEventsService } from "./compensation-events.service.server";
import { createCompensationCalculationService } from "./compensation-calculation.service.server";
import type { CompensationEventsRepository } from "./compensation-events.persistence.shared";

function buildRow(overrides: Partial<CompensationEventRow> = {}): CompensationEventRow {
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
    created_at: "2026-07-06T12:00:00.000Z",
    updated_at: "2026-07-06T12:00:00.000Z",
    ...overrides,
  };
}

function createMockRepository(rows: CompensationEventRow[] = []): CompensationEventsRepository {
  return {
    list: vi.fn(async () => rows),
    getById: vi.fn(async (id) => rows.find((row) => row.id === id) ?? null),
    insert: vi.fn(),
    update: vi.fn(),
  };
}

describe("createCompensationCalculationService", () => {
  it("calcule des accruals en memoire pour un event admissible", () => {
    const row = buildRow();
    const service = createCompensationCalculationService({
      eventsService: createCompensationEventsService({
        repository: createMockRepository([row]),
      }),
    });

    const result = service.calculateAccrualsForEventRow(row, [
      { rule_type: "percentage", percentage_rate: 5, rule_name: "Commission" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.accruals).toHaveLength(1);
    expect(result.value.accruals[0]?.compensation_event_id).toBe(row.id);
    expect(result.value.context.is_calculable).toBe(true);
  });

  it("retourne INELIGIBLE pour une vente non admissible", () => {
    const row = buildRow({
      sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
      delivered_at: null,
    });
    const service = createCompensationCalculationService({
      eventsService: createCompensationEventsService({
        repository: createMockRepository([row]),
      }),
    });

    const result = service.calculateAccrualsForEventRow(row, [
      { rule_type: "fixed", fixed_amount: 100 },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INELIGIBLE");
  });

  it("lit un event via le service Sprint 2", async () => {
    const row = buildRow();
    const service = createCompensationCalculationService({
      eventsService: createCompensationEventsService({
        repository: createMockRepository([row]),
      }),
    });

    const result = await service.calculateAccrualsForEventId(row.id, [
      { rule_type: "percentage", percentage_rate: 10, rule_name: "Commission" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accruals[0]?.calculated_amount).toBe(1000);
  });

  it("preview retourne accruals meme si ineligible via skip interne", () => {
    const row = buildRow({
      sale_state: COMPENSATION_EVENT_SALE_STATE_SOLD,
      delivered_at: null,
    });
    const service = createCompensationCalculationService({
      eventsService: createCompensationEventsService({
        repository: createMockRepository([row]),
      }),
    });

    const result = service.previewCalculationForEventRow(row, [
      { rule_type: "fixed", fixed_amount: 100 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.context.is_calculable).toBe(false);
    expect(result.value.accruals).toEqual([]);
  });
});
