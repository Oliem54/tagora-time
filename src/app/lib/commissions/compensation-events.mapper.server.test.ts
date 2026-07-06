import { describe, expect, it } from "vitest";
import {
  mapCompensationEventRow,
  mapDomainToCompensationEventInsertPayload,
  mapDomainToCompensationEventUpdatePayload,
  mapInsertPayloadToDatabaseRow,
  mapUpdatePayloadToDatabaseRow,
} from "./compensation-events.mapper.server";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
  type CompensationEvent,
} from "./compensation-events.shared";

const sampleDomainEvent: CompensationEvent = {
  event_type: COMPENSATION_EVENT_TYPE_SALE,
  status: COMPENSATION_EVENT_STATUS_ACTIVE,
  sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  chauffeur_id: 21,
  amount: 1500.5,
  sold_at: "2026-07-01",
  delivered_at: "2026-07-03T12:00:00.000Z",
  invoiced_at: null,
  collected_at: null,
  company_context: "oliem_solutions",
  external_reference: "VTE-1001",
  label: "Vente terrain",
  notes: "Note test",
};

describe("mapCompensationEventRow", () => {
  it("mappe une ligne DB vers le domaine persiste", () => {
    const mapped = mapCompensationEventRow({
      id: "11111111-1111-4111-8111-111111111111",
      event_type: "sale",
      status: "active",
      sale_state: "delivered",
      chauffeur_id: 21,
      amount: "1500.50",
      sold_at: "2026-07-01",
      delivered_at: "2026-07-03",
      invoiced_at: null,
      collected_at: null,
      company_context: "oliem_solutions",
      external_reference: "VTE-1001",
      label: "Vente terrain",
      notes: "Note test",
      created_by: "22222222-2222-4222-8222-222222222222",
      updated_by: null,
      created_at: "2026-07-06T12:00:00.000Z",
      updated_at: "2026-07-06T12:00:00.000Z",
    });

    expect(mapped.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(mapped.amount).toBe(1500.5);
    expect(mapped.delivered_at).toBe("2026-07-03");
    expect(mapped.created_by).toBe("22222222-2222-4222-8222-222222222222");
  });
});

describe("domain ↔ persistence payloads", () => {
  it("produit un payload insert avec audit", () => {
    const payload = mapDomainToCompensationEventInsertPayload(sampleDomainEvent, {
      actorUserId: "actor-1",
    });

    expect(payload.created_by).toBe("actor-1");
    expect(payload.updated_by).toBe("actor-1");
    expect(mapInsertPayloadToDatabaseRow(payload)).toMatchObject({
      event_type: "sale",
      chauffeur_id: 21,
      amount: 1500.5,
      delivered_at: "2026-07-03",
    });
  });

  it("produit un payload update sans created_by", () => {
    const payload = mapDomainToCompensationEventUpdatePayload(sampleDomainEvent, {
      actorUserId: "actor-2",
    });
    const row = mapUpdatePayloadToDatabaseRow(payload);

    expect(row.created_by).toBeUndefined();
    expect(row.updated_by).toBe("actor-2");
  });

  it("normalise delivered_at au format date", () => {
    const mapped = mapCompensationEventRow({
      id: "1",
      event_type: "sale",
      status: "active",
      sale_state: "delivered",
      chauffeur_id: 1,
      amount: 100,
      delivered_at: "2026-07-03T15:00:00.000Z",
      created_at: "2026-07-06T12:00:00.000Z",
      updated_at: "2026-07-06T12:00:00.000Z",
    });

    expect(mapped.delivered_at).toBe("2026-07-03");
  });
});
