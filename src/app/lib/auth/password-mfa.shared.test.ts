import { describe, expect, it } from "vitest";
import { loginPathForMissingMfaSession } from "@/app/lib/auth/password-mfa.shared";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

describe("loginPathForMissingMfaSession", () => {
  it("redirige vers Nexus pour un next employé", () => {
    expect(loginPathForMissingMfaSession("/employe/dashboard")).toBe(NEXUS_PUBLIC_LOGIN_URL);
  });

  it("redirige vers Nexus par défaut", () => {
    expect(loginPathForMissingMfaSession("/direction/dashboard")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(loginPathForMissingMfaSession(null)).toBe(NEXUS_PUBLIC_LOGIN_URL);
  });
});
