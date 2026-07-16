import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appRoleMatchesArea,
  mapOrganizationMembershipRoleToAppRole,
} from "@/app/lib/auth/organization-role-mapping.shared";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import type { User } from "@supabase/supabase-js";

const ROOT = process.cwd();
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-QA-V1C2-OWNER-ADMIN-DIRECTION-ACCESS-2026-07-16.md"
);

function jwtUser(role: string | null): User {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    app_metadata: role ? { role } : {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

describe("QA V1-C2 owner admin direction access documentary", () => {
  const handoff = readFileSync(HANDOFF, "utf8");

  it("exists and records GO with H4 as source of truth", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    expect(handoff).toMatch(
      /GO QA V1-C2 — OWNER, ADMIN ET DIRECTION VALIDÉS SUR MEMBERSHIPS H4/
    );
    expect(handoff).toMatch(/membership H4 = source de vérité|source=membership/i);
    expect(handoff).toContain("053dd39450da0c9fbbe5dfd834ea6455517188b7");
    expect(handoff).toContain("qokyobcvplzufshydhih");
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
  });

  it("documents Employé without elevation and higher roles conform", () => {
    expect(handoff).toMatch(/QA-USER-2[\s\S]*employe[\s\S]*Élévation[\s\S]*aucune/i);
    expect(handoff).toMatch(/QA-USER-4[\s\S]*direction/i);
    expect(handoff).toMatch(/QA-USER-3[\s\S]*organization_admin[\s\S]*appRole=admin/i);
    expect(handoff).toMatch(/QA-USER-1[\s\S]*organization_owner/i);
    expect(handoff).toMatch(/JWT historique[\s\S]*n’élève pas|ne réduit pas/i);
  });

  it("keeps Compensation finance JWT-admin guard and no platform implicit access", () => {
    expect(handoff).toMatch(/hasAdminFinanceAccess|JWT `admin` uniquement|JWT admin/i);
    expect(handoff).toMatch(/organization_admin[\s\S]*Compensation finance[\s\S]*\*\*non\*\*/i);
    expect(handoff).toMatch(/platform_access[\s\S]*0/);
    expect(handoff).toMatch(/aucun accès plateforme implicite|Accès plateforme implicite[\s\S]*\*\*non\*\*/i);
  });

  it("forbids writes and keeps V1 at 77%", () => {
    expect(handoff).toMatch(/Aucun POST|GET only|aucune[\s\S]*écriture/i);
    expect(handoff).toMatch(/\*\*77 % → 77 %\*\*/);
    expect(handoff).toMatch(/QA V1-C3/);
    expect(handoff).toMatch(/Auth \/ memberships[\s\S]*inchangés/i);
    expect(handoff).toMatch(/Storage[\s\S]*0/);
  });

  it("encodes real AuthGate hierarchy and finance guard in code", () => {
    expect(mapOrganizationMembershipRoleToAppRole("organization_owner")).toBe(
      "admin"
    );
    expect(mapOrganizationMembershipRoleToAppRole("organization_admin")).toBe(
      "admin"
    );
    expect(mapOrganizationMembershipRoleToAppRole("direction")).toBe("direction");
    expect(appRoleMatchesArea("admin", "direction")).toBe(false);
    expect(appRoleMatchesArea("direction", "admin")).toBe(true);
    expect(appRoleMatchesArea("employe", "employe")).toBe(true);
    expect(appRoleMatchesArea("direction", "employe")).toBe(false);
    expect(hasAdminFinanceAccess(jwtUser("admin"))).toBe(true);
    expect(hasAdminFinanceAccess(jwtUser("direction"))).toBe(false);
    expect(hasAdminFinanceAccess(jwtUser(null))).toBe(false);
  });
});
