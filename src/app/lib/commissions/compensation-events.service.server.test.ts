import { describe, expect, it, vi } from "vitest";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_SOLD,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "./compensation-events.shared";
import type { CompensationEventRow } from "./compensation-events.mapper.server";
import { createCompensationEventsService } from "./compensation-events.service.server";
import type { CompensationEventsRepository } from "./compensation-events.persistence.shared";

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
    list: vi.fn(async (filters) => {
      return rows.filter((row) => {
        if (filters?.chauffeur_id != null && row.chauffeur_id !== filters.chauffeur_id) {
          return false;
        }
        if (filters?.status && row.status !== filters.status) return false;
        if (filters?.sale_state && row.sale_state !== filters.sale_state) return false;
        return true;
      });
    }),
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
        updated_at: "2026-07-06T13:00:00.000Z",
      });
      rows[index] = updated;
      return updated;
    }),
  };
}

describe("createCompensationEventsService", () => {
  it("refuse la creation si le validator echoue", async () => {
    const repository = createMockRepository();
    const service = createCompensationEventsService({ repository });

    const result = await service.createSaleEvent({
      event_type: "delivery",
      chauffeur_id: 21,
      amount: 100,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION");
      expect(repository.insert).not.toHaveBeenCalled();
    }
  });

  it("cree une vente valide et retourne eligibility", async () => {
    const repository = createMockRepository();
    const service = createCompensationEventsService({ repository });

    const result = await service.createSaleEvent({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      chauffeur_id: 21,
      amount: 1500,
      sold_at: "2026-07-01",
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      delivered_at: "2026-07-03",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBeTruthy();
      expect(result.value.eligibility.is_eligible).toBe(true);
      expect(repository.insert).toHaveBeenCalledOnce();
    }
  });

  it("relit une vente par id", async () => {
    const row = buildRow();
    const repository = createMockRepository([row]);
    const service = createCompensationEventsService({ repository });

    const result = await service.getSaleEvent(row.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(row.id);
      expect(result.value.eligibility.is_eligible).toBe(false);
    }
  });

  it("liste les ventes avec filtres via repository", async () => {
    const repository = createMockRepository([
      buildRow({ id: "a", chauffeur_id: 21 }),
      buildRow({ id: "b", chauffeur_id: 22 }),
    ]);
    const service = createCompensationEventsService({ repository });

    const result = await service.listSaleEvents({ chauffeur_id: 21 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.chauffeur_id).toBe(21);
    }
  });

  it("met a jour une vente apres validation merge", async () => {
    const row = buildRow();
    const repository = createMockRepository([row]);
    const service = createCompensationEventsService({ repository });

    const result = await service.updateSaleEvent(row.id, {
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      delivered_at: "2026-07-04",
      sold_at: "2026-07-01",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sale_state).toBe(COMPENSATION_EVENT_SALE_STATE_DELIVERED);
      expect(result.value.eligibility.is_eligible).toBe(true);
      expect(repository.update).toHaveBeenCalledOnce();
    }
  });

  it("retourne NOT_FOUND pour un id inconnu", async () => {
    const service = createCompensationEventsService({ repository: createMockRepository() });
    const result = await service.getSaleEvent("missing-id");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_FOUND");
    }
  });

  it("refuse une mise a jour invalide via validator avant persist", async () => {
    const row = buildRow({
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      delivered_at: "2026-07-03",
      sold_at: "2026-07-01",
    });
    const repository = createMockRepository([row]);
    const service = createCompensationEventsService({ repository });

    const result = await service.updateSaleEvent(row.id, {
      amount: -50,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION");
      expect(repository.update).not.toHaveBeenCalled();
    }
  });
});
