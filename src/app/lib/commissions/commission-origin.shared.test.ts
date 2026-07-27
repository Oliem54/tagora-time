import { describe, expect, it } from "vitest";
import {
  CLIENT_COMMERCIAL_ORIGIN_V1_VISIBLE,
  resolveClientOriginForV1Plan,
} from "./commission-plan.shared";
import { normalizeOrganizationId } from "./commission-catalog.shared";
import {
  applyProfileChangeToSnapshot,
  assertSameOrganization,
  buildSaleOriginSnapshot,
  findApplicableTransfer,
  isCommercialOriginVisibleInSimpleWizard,
  isSnapshotUsableForFutureCalculation,
  resolveCommercialOriginForSale,
  validateCommercialOriginProfileInput,
  validateCommercialOriginTransferInput,
  type CommercialOriginProfile,
  type CommercialOriginTransfer,
} from "./commission-origin.shared";

const ORG = "org_a";
const PARTY = "11111111-1111-1111-1111-111111111111";

function profile(
  overrides: Partial<CommercialOriginProfile> = {}
): CommercialOriginProfile {
  return {
    id: "profile-1",
    organization_id: ORG,
    entity_type: "client",
    entity_id: PARTY,
    commercial_origin: "existing",
    developed_by_employee_id: null,
    effective_from: "2026-01-01",
    effective_to: null,
    status: "active",
    ...overrides,
  };
}

function transfer(
  overrides: Partial<CommercialOriginTransfer> = {}
): CommercialOriginTransfer {
  return {
    id: "tr-1",
    organization_id: ORG,
    entity_type: "client",
    entity_id: PARTY,
    from_employee_id: 10,
    to_employee_id: 20,
    effective_at: "2026-06-01",
    reason: null,
    created_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("commercial origin profile validation", () => {
  it("accepts existing without developer", () => {
    expect(
      validateCommercialOriginProfileInput({
        organization_id: ORG,
        entity_type: "client",
        entity_id: PARTY,
        commercial_origin: "existing",
        developed_by_employee_id: null,
        effective_from: "2026-01-01",
      })
    ).toEqual({ ok: true });
  });

  it("accepts employee_developed with developer", () => {
    expect(
      validateCommercialOriginProfileInput({
        organization_id: ORG,
        entity_type: "reseller",
        entity_id: PARTY,
        commercial_origin: "employee_developed",
        developed_by_employee_id: 42,
        effective_from: "2026-01-01",
      })
    ).toEqual({ ok: true });
  });

  it("rejects employee_developed without developer", () => {
    expect(
      validateCommercialOriginProfileInput({
        organization_id: ORG,
        entity_type: "client",
        entity_id: PARTY,
        commercial_origin: "employee_developed",
        developed_by_employee_id: null,
        effective_from: "2026-01-01",
      })
    ).toMatchObject({ ok: false });
  });

  it("supports company_developed internally but hides it from simple wizard", () => {
    expect(
      validateCommercialOriginProfileInput({
        organization_id: ORG,
        entity_type: "client",
        entity_id: PARTY,
        commercial_origin: "company_developed",
        developed_by_employee_id: null,
        effective_from: "2026-01-01",
      })
    ).toEqual({ ok: true });
    expect(isCommercialOriginVisibleInSimpleWizard("company_developed")).toBe(
      false
    );
    expect(CLIENT_COMMERCIAL_ORIGIN_V1_VISIBLE).not.toContain(
      "company_developed"
    );
    expect(resolveClientOriginForV1Plan("company_developed")).toBe("existing");
  });

  it("blocks employee actor from mutating profiles but allows admin to assign that employee as developer", () => {
    expect(
      validateCommercialOriginProfileInput({
        organization_id: ORG,
        entity_type: "client",
        entity_id: PARTY,
        commercial_origin: "employee_developed",
        developed_by_employee_id: 7,
        effective_from: "2026-01-01",
        actor_role: "employe",
      })
    ).toMatchObject({ ok: false });

    expect(
      validateCommercialOriginProfileInput({
        organization_id: ORG,
        entity_type: "client",
        entity_id: PARTY,
        commercial_origin: "employee_developed",
        developed_by_employee_id: 7,
        effective_from: "2026-01-01",
        actor_role: "admin",
      })
    ).toEqual({ ok: true });
  });
});

describe("resolveCommercialOriginForSale", () => {
  it("returns pending_review when profile is absent (no silent existing)", () => {
    const result = resolveCommercialOriginForSale({
      organization_id: ORG,
      entity_type: "client",
      entity_id: PARTY,
      sale_date: "2026-07-01",
      profile: null,
      transfers: [],
    });
    expect(result.resolution_status).toBe("pending_review");
    expect(result.requires_review).toBe(true);
    expect(result.commercial_origin).toBeNull();
    expect(result.origin_effective_for_engine).toBeNull();
  });

  it("keeps past sale on previous developer when transfer is in the future", () => {
    const result = resolveCommercialOriginForSale({
      organization_id: ORG,
      entity_type: "client",
      entity_id: PARTY,
      sale_date: "2026-05-15",
      profile: profile({
        commercial_origin: "employee_developed",
        developed_by_employee_id: 10,
      }),
      transfers: [transfer({ effective_at: "2026-06-01", to_employee_id: 20 })],
    });
    expect(result.developed_by_employee_id).toBe(10);
    expect(result.source).toBe("profile");
    expect(result.requires_review).toBe(false);
  });

  it("applies effective transfer to a new sale on or after effective_at", () => {
    const result = resolveCommercialOriginForSale({
      organization_id: ORG,
      entity_type: "client",
      entity_id: PARTY,
      sale_date: "2026-06-01",
      profile: profile({
        commercial_origin: "employee_developed",
        developed_by_employee_id: 10,
      }),
      transfers: [transfer({ effective_at: "2026-06-01", to_employee_id: 20 })],
    });
    expect(result.developed_by_employee_id).toBe(20);
    expect(result.source).toBe("transfer");
  });

  it("maps company_developed to existing for engine while keeping real origin", () => {
    const result = resolveCommercialOriginForSale({
      organization_id: ORG,
      entity_type: "client",
      entity_id: PARTY,
      sale_date: "2026-07-01",
      profile: profile({ commercial_origin: "company_developed" }),
      transfers: [],
    });
    expect(result.commercial_origin).toBe("company_developed");
    expect(result.origin_effective_for_engine).toBe("existing");
  });

  it("marks employee_developed without developer as pending_review", () => {
    const result = resolveCommercialOriginForSale({
      organization_id: ORG,
      entity_type: "client",
      entity_id: PARTY,
      sale_date: "2026-07-01",
      profile: profile({
        commercial_origin: "employee_developed",
        developed_by_employee_id: null,
      }),
      transfers: [],
    });
    expect(result.resolution_status).toBe("pending_review");
    expect(result.requires_review).toBe(true);
  });
});

describe("sale origin snapshot immutability", () => {
  it("captures previous employee on snapshot and ignores later profile change", () => {
    const resolution = resolveCommercialOriginForSale({
      organization_id: ORG,
      entity_type: "client",
      entity_id: PARTY,
      sale_date: "2026-05-01",
      profile: profile({
        commercial_origin: "employee_developed",
        developed_by_employee_id: 10,
      }),
      transfers: [],
    });
    const snapshot = buildSaleOriginSnapshot({
      organization_id: ORG,
      sale_id: "sale-100",
      resolution,
      captured_at: "2026-05-01T12:00:00.000Z",
    });
    expect(snapshot?.developed_by_employee_id_snapshot).toBe(10);
    expect(snapshot?.review_status).toBe("confirmed");

    const afterProfileChange = applyProfileChangeToSnapshot(
      snapshot!,
      profile({
        commercial_origin: "employee_developed",
        developed_by_employee_id: 99,
      })
    );
    expect(afterProfileChange.developed_by_employee_id_snapshot).toBe(10);
  });

  it("builds pending_review snapshot that is not usable for calculation", () => {
    const resolution = resolveCommercialOriginForSale({
      organization_id: ORG,
      entity_type: "client",
      entity_id: PARTY,
      sale_date: "2026-07-01",
      profile: null,
      transfers: [],
    });
    const snapshot = buildSaleOriginSnapshot({
      organization_id: ORG,
      sale_id: "sale-pending",
      resolution,
      captured_at: "2026-07-01T12:00:00.000Z",
    });
    expect(snapshot?.review_status).toBe("pending_review");
    expect(snapshot?.commercial_origin_snapshot).toBeNull();
    expect(isSnapshotUsableForFutureCalculation(snapshot!)).toBe(false);
  });
});

describe("transfers and multi-tenant", () => {
  it("ignores transfer after sale date via findApplicableTransfer", () => {
    expect(
      findApplicableTransfer(
        [transfer({ effective_at: "2026-08-01" })],
        ORG,
        "client",
        PARTY,
        "2026-07-01"
      )
    ).toBeNull();
  });

  it("rejects cross-tenant access and invalid organization_id", () => {
    expect(
      assertSameOrganization({
        actorOrganizationIds: ["org_a"],
        targetOrganizationId: "org_b",
      })
    ).toMatchObject({ ok: false });
    expect(normalizeOrganizationId("Oliem Solutions")).toBeNull();
    expect(normalizeOrganizationId("  Org_A ")).toBe("org_a");
    expect(
      validateCommercialOriginTransferInput({
        organization_id: "bad id",
        entity_type: "client",
        entity_id: PARTY,
        from_employee_id: 1,
        to_employee_id: 2,
        effective_at: "2026-06-01",
      })
    ).toMatchObject({ ok: false });
  });

  it("requires distinct employees and effective_at on transfers", () => {
    expect(
      validateCommercialOriginTransferInput({
        organization_id: ORG,
        entity_type: "client",
        entity_id: PARTY,
        from_employee_id: 1,
        to_employee_id: 1,
        effective_at: "2026-06-01",
      })
    ).toMatchObject({ ok: false });
    expect(
      validateCommercialOriginTransferInput({
        organization_id: ORG,
        entity_type: "client",
        entity_id: PARTY,
        from_employee_id: 1,
        to_employee_id: 2,
        effective_at: "2026-06-01",
      })
    ).toEqual({ ok: true });
  });
});
