import { describe, expect, it } from "vitest";
import {
  mapAccrualDraftToInsertPayload,
  mapAccrualInsertPayloadToDatabaseRow,
  mapAccrualRow,
  mapAccrualStatusHistoryRow,
} from "./accruals.mapper.server";
import type { AccrualDraft } from "./accruals.shared";

const sampleDraft: AccrualDraft = {
  compensation_event_id: "11111111-1111-4111-8111-111111111111",
  component: "commission",
  rule_name: "Commission",
  label: "Commission — Employe",
  sales_basis_amount: 10000,
  calculated_amount: 500,
  status: "estimated",
  period_start: "2026-07-01",
  period_end: "2026-07-31",
};

describe("mapAccrualRow", () => {
  it("mappe une ligne DB vers le domaine accrual", () => {
    const mapped = mapAccrualRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      compensation_event_id: sampleDraft.compensation_event_id,
      component: "commission",
      rule_name: "Commission",
      label: "Commission",
      sales_basis_amount: "10000.00",
      calculated_amount: "500.00",
      status: "calculated",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      created_by: null,
      updated_by: null,
      created_at: "2026-07-07T12:00:00.000Z",
      updated_at: "2026-07-07T12:00:00.000Z",
    });

    expect(mapped.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(mapped.status).toBe("calculated");
    expect(mapped.calculated_amount).toBe(500);
  });
});

describe("mapAccrualDraftToInsertPayload", () => {
  it("convertit un draft memoire en payload calculated", () => {
    const payload = mapAccrualDraftToInsertPayload(sampleDraft, {
      status: "calculated",
      actorUserId: "actor-1",
    });

    expect(payload.status).toBe("calculated");
    expect(payload.created_by).toBe("actor-1");
    expect(mapAccrualInsertPayloadToDatabaseRow(payload)).toMatchObject({
      compensation_event_id: sampleDraft.compensation_event_id,
      component: "commission",
      status: "calculated",
    });
  });
});

describe("mapAccrualStatusHistoryRow", () => {
  it("mappe from_status null pour creation initiale", () => {
    const mapped = mapAccrualStatusHistoryRow({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      accrual_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      from_status: null,
      to_status: "calculated",
      changed_at: "2026-07-07T12:00:00.000Z",
      changed_by: "actor-1",
      reason: "Calcul initial",
    });

    expect(mapped.from_status).toBeNull();
    expect(mapped.to_status).toBe("calculated");
  });
});
