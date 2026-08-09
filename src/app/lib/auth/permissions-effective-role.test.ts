import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  bindEffectiveAppRole,
  hasUserPermission,
} from "@/app/lib/auth/permissions";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function makeUser(input?: {
  jwtRole?: string | null;
  permissions?: string[];
}): User {
  return {
    id: "user-test",
    app_metadata: {
      role: input?.jwtRole ?? null,
      permissions: input?.permissions ?? [],
    },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

describe("hasUserPermission effective H4 role", () => {
  it("allows H4 admin without JWT admin role or terrain permission", () => {
    const user = makeUser({ jwtRole: "none", permissions: [] });
    expect(hasUserPermission(user, "terrain", "admin")).toBe(true);
    expect(hasUserPermission(user, "livraisons", "admin")).toBe(true);
    expect(hasUserPermission(user, "documents", "admin")).toBe(true);
    expect(hasUserPermission(user, "commissions", "admin")).toBe(true);
  });

  it("allows direction only when JWT permission list includes the module", () => {
    const withTerrain = makeUser({
      jwtRole: "direction",
      permissions: ["terrain"],
    });
    const withoutTerrain = makeUser({
      jwtRole: "direction",
      permissions: ["livraisons"],
    });
    expect(hasUserPermission(withTerrain, "terrain", "direction")).toBe(true);
    expect(hasUserPermission(withoutTerrain, "terrain", "direction")).toBe(false);
    expect(hasUserPermission(withoutTerrain, "livraisons", "direction")).toBe(true);
  });

  it("does not grant direction an accidental admin bypass via JWT admin claim", () => {
    const user = makeUser({ jwtRole: "admin", permissions: [] });
    // Explicit effectiveRole direction must win over JWT admin.
    expect(hasUserPermission(user, "terrain", "direction")).toBe(false);
  });

  it("keeps employe limited to explicit JWT permissions", () => {
    const user = makeUser({ jwtRole: "employe", permissions: ["terrain"] });
    expect(hasUserPermission(user, "terrain", "employe")).toBe(true);
    expect(hasUserPermission(user, "livraisons", "employe")).toBe(false);
    expect(hasUserPermission(user, "commissions", "employe")).toBe(false);
  });

  it("refuses organizational elevation when effectiveRole is null (non-member)", () => {
    const user = makeUser({ jwtRole: "admin", permissions: ["terrain"] });
    expect(hasUserPermission(user, "terrain", null)).toBe(true); // JWT list still applies
    const bare = makeUser({ jwtRole: "admin", permissions: [] });
    // Explicit null disables JWT-admin bypass path.
    expect(hasUserPermission(bare, "terrain", null)).toBe(false);
  });

  it("keeps admin_finance on JWT admin only even for H4 admin", () => {
    const h4Only = makeUser({ jwtRole: "none", permissions: [] });
    const jwtAdmin = makeUser({ jwtRole: "admin", permissions: [] });
    expect(hasUserPermission(h4Only, "admin_finance", "admin")).toBe(false);
    expect(hasUserPermission(jwtAdmin, "admin_finance", "admin")).toBe(true);
  });

  it("preserves legacy JWT admin bypass when effectiveRole is omitted", () => {
    const jwtAdmin = makeUser({ jwtRole: "admin", permissions: [] });
    const none = makeUser({ jwtRole: "none", permissions: [] });
    expect(hasUserPermission(jwtAdmin, "terrain")).toBe(true);
    expect(hasUserPermission(none, "terrain")).toBe(false);
  });

  it("uses bound H4 role for API callers that omit the third argument", () => {
    const user = makeUser({ jwtRole: "none", permissions: [] });
    bindEffectiveAppRole(user, "admin");
    expect(hasUserPermission(user, "livraisons")).toBe(true);
    bindEffectiveAppRole(user, null);
    expect(hasUserPermission(user, "livraisons")).toBe(false);
  });
});

describe("access admin effective-role wiring", () => {
  const root = process.cwd();

  it("wires useCurrentAccess hasPermission through H4 effective role", () => {
    const source = readFileSync(
      join(root, "src/app/hooks/useCurrentAccess.ts"),
      "utf8"
    );
    expect(source).toContain("fetchSessionAuthorizationContext");
    expect(source).toContain("hasUserPermission(state.user, permission, state.role)");
    expect(source).not.toContain("state.permissions.includes(permission)");
  });

  it("passes membership role into direction horodateur and commissions API guards", () => {
    const horodateur = readFileSync(
      join(root, "src/app/api/horodateur/_shared.ts"),
      "utf8"
    );
    const commissions = readFileSync(
      join(root, "src/app/api/direction/commissions/_lib.ts"),
      "utf8"
    );
    const accountRequests = readFileSync(
      join(root, "src/app/lib/account-requests.server.ts"),
      "utf8"
    );
    expect(horodateur).toContain(
      'hasUserPermission(authenticated.user, "terrain", role)'
    );
    expect(horodateur).toContain('hasUserPermission(user, "terrain", role)');
    expect(commissions).toContain(
      'hasUserPermission(user, "commissions", role)'
    );
    expect(accountRequests).toContain("bindEffectiveAppRole");
  });

  it("passes membership role into timeclock API guards", () => {
    const timeclock = readFileSync(
      join(root, "src/app/lib/timeclock-api.server.ts"),
      "utf8"
    );
    expect(timeclock).toContain("hasUserPermission(user, permission, role)");
    expect(timeclock).toContain("Membership H4 role is authoritative");
  });

  it("wires AuthGate membership as authorization source", () => {
    const authGate = readFileSync(
      join(root, "src/app/components/AuthGate.tsx"),
      "utf8"
    );
    expect(authGate).toContain("fetchSessionAuthorizationContext");
    expect(authGate).toContain("membershipAdminModuleBypass");
    expect(authGate).toMatch(/H4 membership is required/i);
  });

  it("wires AccountAuthGate membership as authorization source", () => {
    const accountAuthGate = readFileSync(
      join(root, "src/app/account/AccountAuthGate.tsx"),
      "utf8"
    );
    expect(accountAuthGate).toContain("fetchSessionAuthorizationContext");
  });

  it("documents that client org id is not trusted for authorization", () => {
    const membershipShared = readFileSync(
      join(root, "src/app/lib/saas/organization-membership.shared.ts"),
      "utf8"
    );
    expect(membershipShared).toContain(
      "Never trusts client-supplied organization_id"
    );
  });
});
