import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import {
  HORORA_PRODUCTION_SUPABASE_HOST,
  HORORA_STAGING_SUPABASE_HOST,
} from "@/app/lib/supabase/supabase-host.shared";
import {
  HORORA_LOCAL_FIXTURE_USER_ID,
  isHororaLocalNexusFixtureEnabled,
  isHororaServingSessionSource,
  readHororaLocalFixtureRole,
  readHororaLocalFixtureTerrainPermissions,
  resolveHororaModuleEntryUrl,
} from "@/app/lib/auth/horora-local-nexus-fixture";

const LOCAL = {
  nodeEnv: "development",
  vercelEnv: undefined,
  hostname: "localhost",
  flag: "true",
  supabaseUrl: `https://${HORORA_STAGING_SUPABASE_HOST}`,
} as const;

describe("HORORA local Nexus fixture", () => {
  it("stays off unless every local guard passes", () => {
    expect(isHororaLocalNexusFixtureEnabled(LOCAL)).toBe(true);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, flag: undefined })).toBe(false);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, flag: "false" })).toBe(false);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, nodeEnv: "production" })).toBe(false);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, nodeEnv: "test" })).toBe(false);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, vercelEnv: "production" })).toBe(false);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, vercelEnv: "preview" })).toBe(false);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, hostname: "time.tagora.ca" })).toBe(
      false
    );
    expect(
      isHororaLocalNexusFixtureEnabled({ ...LOCAL, hostname: "time.staging.tagora.ca" })
    ).toBe(false);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, hostname: "192.168.1.20" })).toBe(
      false
    );
    expect(
      isHororaLocalNexusFixtureEnabled({
        ...LOCAL,
        supabaseUrl: `https://${HORORA_PRODUCTION_SUPABASE_HOST}`,
      })
    ).toBe(false);
  });

  it("allows a loopback dev server when the hostname is still unknown", () => {
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, hostname: null })).toBe(true);
    expect(isHororaLocalNexusFixtureEnabled({ ...LOCAL, hostname: "127.0.0.1" })).toBe(true);
  });

  it("keeps the production entry when the fixture is off", () => {
    expect(readHororaLocalFixtureRole(undefined)).toBe("direction");
    expect(readHororaLocalFixtureRole("employe")).toBe("employe");
    expect(readHororaLocalFixtureRole("owner")).toBe("direction");
    expect(isHororaServingSessionSource("nexus_handoff")).toBe(true);
    expect(isHororaServingSessionSource("local_nexus_fixture")).toBe(true);
    expect(isHororaServingSessionSource("legacy_supabase")).toBe(false);
    expect(resolveHororaModuleEntryUrl(NEXUS_PUBLIC_LOGIN_URL)).toBe(NEXUS_PUBLIC_LOGIN_URL);
  });

  it("grants only the local terrain permission inside the fixture guards", () => {
    expect(readHororaLocalFixtureTerrainPermissions(LOCAL)).toEqual(["terrain"]);
    expect(
      readHororaLocalFixtureTerrainPermissions({ ...LOCAL, nodeEnv: "production" })
    ).toEqual([]);
    expect(
      readHororaLocalFixtureTerrainPermissions({ ...LOCAL, vercelEnv: "preview" })
    ).toEqual([]);
    expect(
      readHororaLocalFixtureTerrainPermissions({ ...LOCAL, vercelEnv: "production" })
    ).toEqual([]);
    expect(
      readHororaLocalFixtureTerrainPermissions({ ...LOCAL, hostname: "time.tagora.ca" })
    ).toEqual([]);
    expect(
      readHororaLocalFixtureTerrainPermissions({
        ...LOCAL,
        supabaseUrl: `https://${HORORA_PRODUCTION_SUPABASE_HOST}`,
      })
    ).toEqual([]);

    const user = {
      id: HORORA_LOCAL_FIXTURE_USER_ID,
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00.000Z",
      app_metadata: {
        role: "direction",
        permissions: readHororaLocalFixtureTerrainPermissions(LOCAL),
      },
      user_metadata: {},
    } as User;
    expect(hasUserPermission(user, "terrain", "direction")).toBe(true);
    expect(hasUserPermission(user, "livraisons", "direction")).toBe(false);
    expect(hasUserPermission(user, "documents", "direction")).toBe(false);
    expect(hasUserPermission(user, "admin_finance", "direction")).toBe(false);
    expect(hasUserPermission(user, "horodateur_payroll_read", "direction")).toBe(false);

    const blocked = {
      ...user,
      app_metadata: {
        role: "direction",
        permissions: readHororaLocalFixtureTerrainPermissions({
          ...LOCAL,
          nodeEnv: "production",
        }),
      },
    } as User;
    expect(hasUserPermission(blocked, "terrain", "direction")).toBe(false);
  });

  it("wires the fixture in front of the Nexus redirect", () => {
    const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    const session = readFileSync(
      join(process.cwd(), "src/app/api/auth/session-context/route.ts"),
      "utf8"
    );
    expect(middleware).toContain("isProcessLocalNexusFixtureEnabled");
    expect(middleware).toContain("resolveHororaRequestAccess");
    expect(session).toContain('source: "nexus_handoff"');
    expect(session).toContain('source: "local_nexus_fixture"');
    expect(
      readFileSync(join(process.cwd(), "src/app/lib/account-requests.server.ts"), "utf8")
    ).toContain("readHororaLocalFixtureTerrainPermissions");
    expect(
      readFileSync(join(process.cwd(), "src/app/hooks/useCurrentAccess.ts"), "utf8")
    ).toContain("readHororaLocalFixtureTerrainPermissions");
  });
});
