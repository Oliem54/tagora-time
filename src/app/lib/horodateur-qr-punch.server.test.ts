import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TEST_PEPPER = "qa-lot2-test-pepper-not-for-runtime";
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);
const SOURCE = readFileSync(
  join(process.cwd(), "src/app/lib/horodateur-qr-punch.server.ts"),
  "utf8"
);

describe("punch zone token hashing fail-closed", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.PUNCH_ZONE_TOKEN_PEPPER;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    delete process.env.PUNCH_ZONE_TOKEN_PEPPER;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.unstubAllEnvs();
  });

  async function load() {
    return import("@/app/lib/horodateur-qr-punch.server");
  }

  it("removes service-role and development-literal fallbacks from source", () => {
    expect(SOURCE).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(SOURCE).not.toContain("tagora-punch-zone-dev-pepper");
    expect(SOURCE).toContain("timingSafeEqual");
    expect(SOURCE).toContain('createHash("sha256")');
    expect(SOURCE).toContain("import \"server-only\"");
  });

  it("requires PUNCH_ZONE_TOKEN_PEPPER and does not use service role or a dev literal", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-must-not-be-pepper";
    const { hashPunchZoneToken, PUNCH_ZONE_PEPPER_MISSING_ERROR } = await load();
    expect(() => hashPunchZoneToken(TOKEN_A)).toThrow(
      PUNCH_ZONE_PEPPER_MISSING_ERROR
    );
    expect(PUNCH_ZONE_PEPPER_MISSING_ERROR).not.toContain(
      "service-role-must-not-be-pepper"
    );
    expect(PUNCH_ZONE_PEPPER_MISSING_ERROR).not.toContain(TOKEN_A);
    expect(PUNCH_ZONE_PEPPER_MISSING_ERROR).not.toContain(
      "tagora-punch-zone-dev-pepper"
    );
  });

  it("hashes the same token and pepper identically and changes when the token changes", async () => {
    process.env.PUNCH_ZONE_TOKEN_PEPPER = TEST_PEPPER;
    const { hashPunchZoneToken, verifyPunchZoneToken } = await load();

    const first = hashPunchZoneToken(TOKEN_A);
    const second = hashPunchZoneToken(TOKEN_A);
    const other = hashPunchZoneToken(TOKEN_B);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(second);
    expect(other).not.toBe(first);
    expect(verifyPunchZoneToken(TOKEN_A, first)).toBe(true);
    expect(verifyPunchZoneToken(TOKEN_B, first)).toBe(false);
  });

  it("keeps errors free of secrets and tokens", async () => {
    process.env.PUNCH_ZONE_TOKEN_PEPPER = TEST_PEPPER;
    const { hashPunchZoneToken, PUNCH_ZONE_PEPPER_MISSING_ERROR } = await load();
    const hash = hashPunchZoneToken(TOKEN_A);
    expect(PUNCH_ZONE_PEPPER_MISSING_ERROR).not.toContain(TEST_PEPPER);
    expect(PUNCH_ZONE_PEPPER_MISSING_ERROR).not.toContain(TOKEN_A);
    expect(PUNCH_ZONE_PEPPER_MISSING_ERROR).not.toContain(hash);
  });
});
