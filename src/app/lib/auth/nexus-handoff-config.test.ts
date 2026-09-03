import { describe, expect, it } from "vitest";
import {
  DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
  NEXUS_BROKERED_SESSION_COOKIE_NAME,
  NEXUS_CALLBACK_FAIL_CLOSED_PATH,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_TECHNICAL_MODULE_KEY,
  isNexusHororaSessionMintEnabled,
  readNexusHandoffConfig,
  resolveNexusPortalReturnUrl,
} from "@/app/lib/auth/nexus-handoff-config";

const ISSUER = "https://nexus-handoff.test";
const JWKS = "https://nexus-handoff.test/jwks.json";

describe("HORORA Nexus handoff config", () => {
  it("fails closed without issuer/JWKS", () => {
    expect(readNexusHandoffConfig({})).toEqual({
      ok: false,
      reason: "missing_configuration",
    });
  });

  it("rejects a non-frozen audience or module key", () => {
    expect(
      readNexusHandoffConfig({
        NEXUS_HANDOFF_ISSUER: ISSUER,
        NEXUS_HANDOFF_JWKS_URL: JWKS,
        NEXUS_HANDOFF_AUDIENCE: "authenticated",
        NEXUS_HANDOFF_EXPECTED_MODULE_KEY: NEXUS_TECHNICAL_MODULE_KEY,
      })
    ).toEqual({ ok: false, reason: "invalid_configuration" });
    expect(
      readNexusHandoffConfig({
        NEXUS_HANDOFF_ISSUER: ISSUER,
        NEXUS_HANDOFF_JWKS_URL: JWKS,
        NEXUS_HANDOFF_AUDIENCE: NEXUS_HANDOFF_AUDIENCE,
        NEXUS_HANDOFF_EXPECTED_MODULE_KEY: "tagora_stock_premium",
      })
    ).toEqual({ ok: false, reason: "invalid_configuration" });
  });

  it("accepts frozen tagora:time / tagora_time", () => {
    const result = readNexusHandoffConfig({
      NEXUS_HANDOFF_ISSUER: ISSUER,
      NEXUS_HANDOFF_JWKS_URL: JWKS,
      NEXUS_HANDOFF_AUDIENCE: "tagora:time",
      NEXUS_HANDOFF_EXPECTED_MODULE_KEY: "tagora_time",
    });
    expect(result.ok).toBe(true);
    expect(NEXUS_HANDOFF_AUDIENCE).toBe("tagora:time");
    expect(NEXUS_TECHNICAL_MODULE_KEY).toBe("tagora_time");
    expect(NEXUS_BROKERED_SESSION_COOKIE_NAME).toBe("horora_nx_session");
    expect(NEXUS_CALLBACK_FAIL_CLOSED_PATH).toBe("/employe/login");
    expect(DEFAULT_HORORA_NEXUS_ORGANIZATION_ID).toBe("org_tagora_internal");
  });

  it("keeps session mint closed unless the HORORA flag is true", () => {
    expect(isNexusHororaSessionMintEnabled({})).toBe(false);
    expect(
      isNexusHororaSessionMintEnabled({ NEXUS_HORORA_SESSION_MINT_ENABLED: "true" })
    ).toBe(true);
  });

  it("allows only the configured /modules portal return", () => {
    expect(
      resolveNexusPortalReturnUrl({
        NEXUS_PORTAL_RETURN_URL: "https://nexus.example.test/modules",
      })
    ).toEqual({ ok: true, url: "https://nexus.example.test/modules" });
    expect(
      resolveNexusPortalReturnUrl({
        NEXUS_PORTAL_RETURN_URL: "https://nexus.example.test/other",
      })
    ).toEqual({ ok: false, reason: "invalid_configuration" });
    expect(
      resolveNexusPortalReturnUrl({ NEXUS_PORTAL_RETURN_URL: "//evil.example/modules" })
    ).toEqual({ ok: false, reason: "open_redirect" });
  });
});
