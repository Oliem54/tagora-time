import { describe, expect, it } from "vitest";
import {
  NEXUS_STAGING_LOGIN_URL,
  NEXUS_STAGING_PORTAL_MODULES_URL,
  resolveHororaNexusLoginUrl,
} from "@/app/lib/auth/nexus-handoff-config";
import {
  loginPathForMissingMfaSession,
  resolveNexusHandoffLogoutUrl,
} from "@/app/lib/auth/password-mfa.shared";
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

describe("resolveNexusHandoffLogoutUrl", () => {
  it("envoie le logout Staging vers le portail Nexus Staging", () => {
    expect(resolveNexusHandoffLogoutUrl("tagora-time-staging.vercel.app")).toBe(
      NEXUS_STAGING_PORTAL_MODULES_URL
    );
    expect(resolveNexusHandoffLogoutUrl("time.staging.tagora.ca")).toBe(
      NEXUS_STAGING_PORTAL_MODULES_URL
    );
    expect(NEXUS_STAGING_PORTAL_MODULES_URL).not.toContain("/direction/login");
  });

  it("laisse Production sur le portail Nexus public", () => {
    expect(resolveNexusHandoffLogoutUrl("time.tagora.ca")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(resolveNexusHandoffLogoutUrl("time.tagora.ca")).not.toContain(
      "tagora-nexus-staging"
    );
  });
});

describe("resolveHororaNexusLoginUrl", () => {
  it("envoie HORORA Staging vers la connexion Nexus Staging", () => {
    expect(NEXUS_STAGING_LOGIN_URL).toBe(
      "https://tagora-nexus-staging.vercel.app/login?next=%2Fmodules"
    );
    expect(resolveHororaNexusLoginUrl("tagora-time-staging.vercel.app")).toBe(
      NEXUS_STAGING_LOGIN_URL
    );
    expect(resolveHororaNexusLoginUrl("time.staging.tagora.ca")).toBe(NEXUS_STAGING_LOGIN_URL);
    expect(
      resolveHororaNexusLoginUrl(
        "tagora-time-staging-37omj67aj-oliem54s-projects.vercel.app"
      )
    ).toBe(NEXUS_STAGING_LOGIN_URL);
    expect(NEXUS_STAGING_LOGIN_URL.startsWith("https://tagora-nexus-staging.vercel.app/")).toBe(
      true
    );
  });

  it("laisse Production sur app.tagora.ca/login", () => {
    expect(resolveHororaNexusLoginUrl("time.tagora.ca")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(resolveHororaNexusLoginUrl("tagora-time.vercel.app")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(resolveHororaNexusLoginUrl("tagora-time-oliem54s-projects.vercel.app")).toBe(
      NEXUS_PUBLIC_LOGIN_URL
    );
    expect(resolveHororaNexusLoginUrl(null)).toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(resolveHororaNexusLoginUrl("time.tagora.ca")).not.toContain("tagora-nexus-staging");
  });
});
