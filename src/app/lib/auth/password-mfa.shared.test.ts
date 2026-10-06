import { describe, expect, it } from "vitest";
import { loginPathForMissingMfaSession } from "@/app/lib/auth/password-mfa.shared";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import { NEXUS_STAGING_LOGIN_URL } from "@/app/lib/auth/horora-nexus-routing.shared";

const productionProjectEnv = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_URL: "tagora-time-example.vercel.app",
};
const stagingProjectEnv = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_URL: "tagora-time-staging-example.vercel.app",
};

describe("loginPathForMissingMfaSession", () => {
  it("redirige vers Nexus Production pour le projet Production", () => {
    expect(loginPathForMissingMfaSession("/employe/dashboard", productionProjectEnv)).toBe(
      NEXUS_PUBLIC_LOGIN_URL
    );
  });

  it("redirige vers Nexus Staging pour le projet Staging", () => {
    expect(loginPathForMissingMfaSession("/direction/dashboard", stagingProjectEnv)).toBe(
      NEXUS_STAGING_LOGIN_URL
    );
    expect(loginPathForMissingMfaSession(null, stagingProjectEnv)).toBe(NEXUS_STAGING_LOGIN_URL);
  });
});
