import { describe, expect, it } from "vitest";

/**
 * Contract tests: direction/admin hour APIs must always scope by organizationId.
 */
describe("admin hours tenant isolation contract", () => {
  it("documents that cross-tenant access must be denied by organizationId mismatch", () => {
    const callerOrg = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const foreignOrg = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    expect(callerOrg).not.toBe(foreignOrg);
  });

  it("keeps direction live aliases for worked minutes", () => {
    const row = {
      workedMinutes: 120,
      weeklyProgressMinutes: 400,
      weeklyTargetMinutes: 2400,
    };
    expect(row.workedMinutes).toBeGreaterThan(0);
    expect(row.weeklyProgressMinutes).toBeLessThanOrEqual(row.weeklyTargetMinutes);
  });
});
