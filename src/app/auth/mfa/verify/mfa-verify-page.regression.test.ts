import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const verifyPage = readFileSync(
  join(process.cwd(), "src/app/auth/mfa/verify/page.tsx"),
  "utf8"
);
const setupPage = readFileSync(
  join(process.cwd(), "src/app/auth/mfa/setup/page.tsx"),
  "utf8"
);
const cookieRoute = readFileSync(
  join(process.cwd(), "src/app/api/auth/session-cookie/route.ts"),
  "utf8"
);
const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
const loginPage = readFileSync(
  join(process.cwd(), "src/app/direction/login/page.tsx"),
  "utf8"
);

describe("MFA verify session persistence regression", () => {
  it("persists the verify session through the HttpOnly cookie API before redirect", () => {
    expect(verifyPage).toContain("persistVerifiedMfaSession");
    expect(verifyPage).not.toContain("refreshSessionAfterMfa");
    expect(verifyPage).not.toContain("writeBrowserSessionCookie");
    expect(setupPage).toContain("persistVerifiedMfaSession");
    expect(setupPage).not.toContain("refreshSessionAfterMfa");
  });

  it("keeps middleware fail-closed on the Nexus brokered session cookie", () => {
    expect(cookieRoute).toContain("APP_SESSION_COOKIE_NAME");
    expect(cookieRoute).toContain("httpOnly: true");
    expect(cookieRoute).toContain('sameSite: "lax"');
    expect(middleware).toContain("NEXUS_BROKERED_SESSION_COOKIE_NAME");
    expect(middleware).toContain("resolveHororaRequestAccess");
  });

  it("does not write a local password session from direction login", () => {
    expect(loginPage).toContain("NEXUS_PUBLIC_LOGIN_URL");
    expect(loginPage).toContain("redirect");
    expect(loginPage).not.toContain("writeBrowserSessionCookie");
    expect(loginPage).not.toContain("signInWithPassword");
  });
});
