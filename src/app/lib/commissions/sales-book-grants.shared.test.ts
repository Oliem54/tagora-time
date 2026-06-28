import { describe, expect, it } from "vitest";
import {
  isCommissionBookGrantId,
  isCommissionBookGrantRevoked,
  isCommissionGrantActiveRow,
  isRevokeRequestedInBody,
  normalizeCommissionTimestamp,
} from "@/app/lib/commissions/sales-book-grants.shared";

describe("normalizeCommissionTimestamp", () => {
  it("accepte les chaînes ISO non vides", () => {
    expect(normalizeCommissionTimestamp("2026-06-07T12:00:00.000Z")).toBe(
      "2026-06-07T12:00:00.000Z"
    );
  });

  it("convertit les Date en ISO", () => {
    const date = new Date("2026-06-07T12:00:00.000Z");
    expect(normalizeCommissionTimestamp(date)).toBe("2026-06-07T12:00:00.000Z");
  });

  it("retourne null pour vide ou types invalides", () => {
    expect(normalizeCommissionTimestamp(null)).toBeNull();
    expect(normalizeCommissionTimestamp("")).toBeNull();
    expect(normalizeCommissionTimestamp(42)).toBeNull();
  });
});

describe("isCommissionGrantActiveRow", () => {
  it("traite une Date revoked_at comme révoqué", () => {
    const revokedAt = new Date("2026-06-07T12:00:00.000Z");
    expect(
      isCommissionGrantActiveRow({
        can_view: true,
        revoked_at: revokedAt,
        expires_at: null,
      })
    ).toBe(false);
  });

  it("garde actif si revoked_at est null", () => {
    expect(
      isCommissionGrantActiveRow({
        can_view: true,
        revoked_at: null,
        expires_at: null,
      })
    ).toBe(true);
  });
});

describe("isCommissionBookGrantRevoked", () => {
  it("exige revoked_at non vide", () => {
    expect(
      isCommissionBookGrantRevoked({ revoked_at: "2026-06-07T12:00:00.000Z" })
    ).toBe(true);
    expect(isCommissionBookGrantRevoked({ revoked_at: null })).toBe(false);
    expect(isCommissionBookGrantRevoked({ revoked_at: "" })).toBe(false);
  });
});

describe("isRevokeRequestedInBody", () => {
  it("accepte boolean true et string true", () => {
    expect(isRevokeRequestedInBody({ revoke: true })).toBe(true);
    expect(isRevokeRequestedInBody({ revoke: "true" })).toBe(true);
    expect(isRevokeRequestedInBody({ revoke: false })).toBe(false);
    expect(isRevokeRequestedInBody({})).toBe(false);
  });
});

describe("isCommissionBookGrantId", () => {
  it("valide un UUID grant", () => {
    expect(
      isCommissionBookGrantId("8fc83282-967d-4ee3-9e0a-dcb9bdcc4d2f")
    ).toBe(true);
    expect(isCommissionBookGrantId("not-a-uuid")).toBe(false);
  });
});
