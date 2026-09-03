import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NEXUS_BROKERED_SESSION_COOKIE_NAME,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20260902214500_horora_nexus_access_foundation.sql";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const HANDOFF_FILES = [
  "src/app/lib/auth/nexus-handoff.ts",
  "src/app/lib/auth/nexus-identity-mapping.server.ts",
  "src/app/lib/auth/nexus-session-mint.server.ts",
  "src/app/lib/auth/nexus-callback.server.ts",
  "src/app/lib/auth/nexus-brokered-session.ts",
  "src/app/auth/nexus/callback/route.ts",
  "src/app/components/AuthGate.tsx",
  "src/app/api/auth/session-context/route.ts",
] as const;

describe("HORORA Nexus handoff source guards", () => {
  it("creates the additive HORORA-only migration with RLS forced and anon/authenticated revoked", () => {
    expect(existsSync(join(ROOT, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toContain("horora_nexus_identity_map");
    expect(sql).toContain("horora_nexus_organization_map");
    expect(sql).toContain("horora_nexus_handoff_receipts");
    expect(sql).toContain("horora_nexus_sessions");
    expect(sql).toContain("token_hash");
    expect(sql).toMatch(/jti text primary key/i);
    expect(sql).toContain("nonce text not null");
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
    expect(sql).toMatch(/revoke all on table public\.horora_nexus_identity_map from anon/i);
    expect(sql).toMatch(/revoke all on table public\.horora_nexus_identity_map from authenticated/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).not.toContain("email");
    expect(sql).not.toMatch(/access_token|refresh_token|raw_token|assertion/i);
  });

  it("keeps frozen audience, module key, and cookie name", () => {
    expect(NEXUS_HANDOFF_AUDIENCE).toBe("tagora:time");
    expect(NEXUS_TECHNICAL_MODULE_KEY).toBe("tagora_time");
    expect(NEXUS_BROKERED_SESSION_COOKIE_NAME).toBe("horora_nx_session");
    const verifier = read("src/app/lib/auth/nexus-handoff.ts");
    expect(verifier).toContain("jwtVerify");
    expect(verifier).toContain('algorithms: [NEXUS_HANDOFF_ALGORITHM]');
    expect(verifier).toContain("disallowed_algorithm");
    expect(verifier).toContain("forbidden_authority_claim");
    expect(verifier).not.toMatch(/allowedAlgorithms:\s*\[[^\]]*HS256/);
  });

  it("does not create users, forge JWTs, or use a second password", () => {
    for (const file of HANDOFF_FILES) {
      const src = read(file);
      expect(src).not.toContain("generateLink");
      expect(src).not.toContain("signInWithPassword");
      expect(src).not.toContain("createUser");
      expect(src).not.toContain("signInWithOtp");
    }
    const mint = read("src/app/lib/auth/nexus-session-mint.server.ts");
    expect(mint).toContain("getUserById");
    expect(mint).toContain("session_mint_disabled");
  });

  it("does not treat user_metadata as authority and does not log secrets", () => {
    const mapping = read("src/app/lib/auth/nexus-identity-mapping.server.ts");
    const callback = read("src/app/lib/auth/nexus-callback.server.ts");
    const gate = read("src/app/components/AuthGate.tsx");
    const session = read("src/app/api/auth/session-context/route.ts");
    const sessionClient = read("src/app/lib/auth/session-context.client.ts");
    const brokered = read("src/app/lib/auth/nexus-brokered-session.ts");
    expect(mapping).toContain("mapOrganizationMembershipRoleToAppRole");
    expect(mapping).not.toMatch(/\.user_metadata\b/);
    expect(callback).not.toMatch(/\.user_metadata\b/);
    expect(gate).not.toContain("user_metadata");
    expect(session).not.toContain("user_metadata");
    expect(session).toContain('sessionSource === "nexus_handoff"');
    expect(sessionClient).toContain("accessToken?: string");
    expect(sessionClient).toContain('"nexus_handoff"');
    expect(gate).toContain('source === "nexus_handoff"');
    expect(gate).not.toContain('router.replace("/direction/login")');
    expect(brokered).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(callback).not.toMatch(/console\.(info|log|error).*token/);
  });
});
