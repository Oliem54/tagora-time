import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  bindEffectiveAppRole,
  getAppMetadataPermissionsOnly,
  getRequiredPermissionForPath,
  getUserPermissions,
  hasUserPermission,
} from "@/app/lib/auth/permissions";

vi.mock("server-only", () => ({}));

import {
  canManageHorodateurPayroll,
  canReadHorodateurPayroll,
  evaluateHorodateurPayrollAccess,
  evaluateHorodateurPayrollAccessForUser,
} from "./payroll-access.server";

function makeUser(input?: {
  appPermissions?: string[];
  userPermissions?: string[];
  jwtRole?: string;
}): User {
  return {
    id: "user-payroll-test",
    app_metadata: {
      role: input?.jwtRole ?? "direction",
      permissions: input?.appPermissions ?? [],
    },
    user_metadata: {
      permissions: input?.userPermissions ?? [],
    },
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

describe("evaluateHorodateurPayrollAccess", () => {
  it("grants organization_owner and organization_admin implicitly without JWT permissions", () => {
    for (const role of ["organization_owner", "organization_admin"] as const) {
      const decision = evaluateHorodateurPayrollAccess({
        membershipRole: role,
        membershipStatus: "active",
        appMetadataPermissions: [],
        userMetadataPermissions: ["horodateur_payroll_manage"],
        required: "manage",
      });
      expect(decision.allowed).toBe(true);
      expect(decision.canRead).toBe(true);
      expect(decision.canManage).toBe(true);
      expect(decision.source).toBe("membership_admin");
    }
  });

  it("allows direction read without manage", () => {
    const readOnly = evaluateHorodateurPayrollAccess({
      membershipRole: "direction",
      appMetadataPermissions: ["horodateur_payroll_read", "terrain"],
      userMetadataPermissions: ["horodateur_payroll_manage"],
      required: "read",
    });
    const manage = evaluateHorodateurPayrollAccess({
      membershipRole: "direction",
      appMetadataPermissions: ["horodateur_payroll_read", "terrain"],
      required: "manage",
    });
    expect(readOnly.allowed).toBe(true);
    expect(readOnly.canManage).toBe(false);
    expect(manage.allowed).toBe(false);
    expect(manage.reason).toBe("payroll_manage_permission_missing");
  });

  it("allows direction manage from app_metadata only", () => {
    const decision = evaluateHorodateurPayrollAccess({
      membershipRole: "direction",
      appMetadataPermissions: ["horodateur_payroll_manage"],
      userMetadataPermissions: [],
      required: "manage",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.canRead).toBe(true);
    expect(decision.source).toBe("app_metadata");
  });

  it("denies terrain-only direction", () => {
    const decision = evaluateHorodateurPayrollAccess({
      membershipRole: "direction",
      appMetadataPermissions: ["terrain", "livraisons"],
      userMetadataPermissions: ["horodateur_payroll_read"],
      required: "read",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("payroll_permission_missing");
  });

  it("denies employe even when payroll permissions are present in metadata", () => {
    const decision = evaluateHorodateurPayrollAccess({
      membershipRole: "employe",
      appMetadataPermissions: ["horodateur_payroll_manage", "terrain"],
      userMetadataPermissions: ["horodateur_payroll_read"],
      required: "read",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("employee_denied");
  });

  it("ignores user_metadata payroll permissions for direction", () => {
    const user = makeUser({
      appPermissions: ["terrain"],
      userPermissions: ["horodateur_payroll_read", "horodateur_payroll_manage"],
    });
    const decision = evaluateHorodateurPayrollAccessForUser(
      user,
      { role: "direction", status: "active" },
      "read"
    );
    expect(
      getUserPermissions(
        makeUser({
          appPermissions: [],
          userPermissions: ["horodateur_payroll_read"],
        })
      )
    ).toContain("horodateur_payroll_read");
    expect(
      getAppMetadataPermissionsOnly(
        makeUser({
          appPermissions: ["terrain"],
          userPermissions: ["horodateur_payroll_manage"],
        })
      )
    ).toEqual(["terrain"]);
    expect(decision.allowed).toBe(false);
  });

  it("denies JWT admin without an H4 membership", () => {
    const user = makeUser({ jwtRole: "admin", appPermissions: [] });
    expect(canReadHorodateurPayroll(user, null)).toBe(false);
    expect(canManageHorodateurPayroll(user, null)).toBe(false);
  });
});

describe("hasUserPermission payroll special case", () => {
  it("does not grant payroll from user_metadata or JWT admin when membership role is omitted", () => {
    const user = makeUser({
      jwtRole: "admin",
      appPermissions: [],
      userPermissions: ["horodateur_payroll_manage"],
    });
    expect(hasUserPermission(user, "horodateur_payroll_read")).toBe(false);
    expect(hasUserPermission(user, "horodateur_payroll_manage")).toBe(false);
  });

  it("grants implicit payroll to bound H4 admin and requires app_metadata for direction", () => {
    const admin = makeUser({ jwtRole: "none", appPermissions: [] });
    bindEffectiveAppRole(admin, "admin");
    expect(hasUserPermission(admin, "horodateur_payroll_manage")).toBe(true);

    const direction = makeUser({
      jwtRole: "direction",
      appPermissions: ["horodateur_payroll_read"],
      userPermissions: ["horodateur_payroll_manage"],
    });
    expect(hasUserPermission(direction, "horodateur_payroll_read", "direction")).toBe(
      true
    );
    expect(hasUserPermission(direction, "horodateur_payroll_manage", "direction")).toBe(
      false
    );
    expect(hasUserPermission(direction, "horodateur_payroll_read", "employe")).toBe(
      false
    );
  });

  it("maps the accountant report path to payroll read instead of terrain", () => {
    expect(getRequiredPermissionForPath("/direction/horodateur/rapport-comptable")).toBe(
      "horodateur_payroll_read"
    );
    expect(getRequiredPermissionForPath("/direction/horodateur/registre")).toBe("terrain");
  });
});

describe("payroll access helper isolation from browser service_role", () => {
  it("does not import or mention the service role key", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/lib/horodateur-v1/payroll-access.server.ts"),
      "utf8"
    );
    const client = readFileSync(
      join(process.cwd(), "src/app/lib/supabase/client.ts"),
      "utf8"
    );
    expect(source).toContain('import "server-only"');
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("createAdminSupabaseClient");
    expect(source).not.toContain("getUserPermissions");
    expect(client).not.toContain("SERVICE_ROLE");
    expect(client).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
});
