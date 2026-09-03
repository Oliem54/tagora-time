import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("HORORA session logout and MFA loop non-regression", () => {
  it("clears the HttpOnly app cookie on Direction, Admin and employee logout", () => {
    const badge = read("src/app/components/ui/UserIdentityBadge.tsx");
    const direction = read("src/app/direction/dashboard/DirectionDashboardClient.tsx");
    const admin = read("src/app/admin/dashboard/AdminDashboardClient.tsx");
    const employee = read("src/app/employe/dashboard/page.tsx");
    const helper = read("src/app/lib/auth/password-mfa.client.ts");

    expect(helper).toContain("await clearServerSessionCookie()");
    expect(helper).toContain("/api/auth/nexus-session");
    expect(helper).toContain("clearTagoraAuthBrowserSession()");
    expect(badge).toContain("signOutToSwitchAccount");
    expect(badge).toContain("Se déconnecter");
    expect(direction).toContain("signOutToSwitchAccount");
    expect(admin).toContain("signOutToSwitchAccount");
    expect(employee).toContain("signOutToSwitchAccount");
  });

  it("does not refreshSession after a successful MFA verify that already returned tokens", () => {
    const verify = read("src/app/auth/mfa/verify/page.tsx");
    const setup = read("src/app/auth/mfa/setup/page.tsx");
    expect(verify).toContain("persistVerifiedMfaSession");
    expect(verify).not.toContain("refreshSessionAfterMfa");
    expect(setup).toContain("persistVerifiedMfaSession");
    expect(setup).not.toContain("refreshSessionAfterMfa");
  });

  it("keeps AuthGate from bouncing an AAL2 session back to direction login", () => {
    const gate = read("src/app/components/AuthGate.tsx");
    expect(gate).toContain("getMandatoryMfaGate");
    expect(gate).toContain("clearServerSessionCookie");
    expect(gate).toContain('router.replace("/auth/mfa/verify")');
    expect(gate).not.toContain('router.replace("/direction/login")');
  });
});
