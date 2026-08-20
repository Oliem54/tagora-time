import { describe, expect, it } from "vitest";
import {
  buildLoginStandardRedirectPath,
  CANONICAL_PRODUCTION_HOSTNAME,
  CANONICAL_PRODUCTION_ORIGIN,
  CANONICAL_STAGING_HOSTNAME,
  CANONICAL_STAGING_ORIGIN,
  isCanonicalProductionHostname,
  isCanonicalStagingHostname,
  isLocalHostname,
  isNexusHostname,
  isVercelPreviewHostname,
  LOGIN_STANDARD_PATH,
  LOGIN_STANDARD_TARGET_PATH,
  NEXUS_PUBLIC_HOSTNAME,
  NEXUS_PUBLIC_ORIGIN,
  resolveCanonicalOriginForEnvironment,
} from "@/app/lib/canonical-domains";

describe("canonical domains DEC-015", () => {
  it("expose les origines et chemins officiels", () => {
    expect(CANONICAL_PRODUCTION_ORIGIN).toBe("https://time.tagora.ca");
    expect(CANONICAL_STAGING_ORIGIN).toBe("https://time.staging.tagora.ca");
    expect(LOGIN_STANDARD_PATH).toBe("/login");
    expect(LOGIN_STANDARD_TARGET_PATH).toBe("/");
    expect(NEXUS_PUBLIC_ORIGIN).toBe("https://app.tagora.ca");
    expect(NEXUS_PUBLIC_HOSTNAME).toBe("app.tagora.ca");
  });

  it("classifie Production / staging / local / preview / Nexus / inconnu", () => {
    expect(isCanonicalProductionHostname(CANONICAL_PRODUCTION_HOSTNAME)).toBe(true);
    expect(isCanonicalStagingHostname(CANONICAL_STAGING_HOSTNAME)).toBe(true);
    expect(isCanonicalProductionHostname(CANONICAL_STAGING_HOSTNAME)).toBe(false);
    expect(isCanonicalStagingHostname(CANONICAL_PRODUCTION_HOSTNAME)).toBe(false);

    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isVercelPreviewHostname("tagora-time-git-x.vercel.app")).toBe(true);

    expect(isNexusHostname("app.tagora.ca")).toBe(true);
    expect(isCanonicalProductionHostname("app.tagora.ca")).toBe(false);
    expect(isCanonicalStagingHostname("app.tagora.ca")).toBe(false);

    expect(isCanonicalProductionHostname("ops.tagora.ca")).toBe(false);
    expect(isCanonicalStagingHostname("ops.tagora.ca")).toBe(false);
    expect(isCanonicalProductionHostname("tagora.ca")).toBe(false);
  });

  it("résout l origine canonique selon l hôte", () => {
    expect(resolveCanonicalOriginForEnvironment("time.tagora.ca")).toBe(
      CANONICAL_PRODUCTION_ORIGIN
    );
    expect(resolveCanonicalOriginForEnvironment("time.staging.tagora.ca")).toBe(
      CANONICAL_STAGING_ORIGIN
    );
    expect(resolveCanonicalOriginForEnvironment("localhost")).toBeNull();
  });
});

describe("LOGIN_STANDARD /login redirect", () => {
  it("redirige vers le hub / sans boucle", () => {
    expect(buildLoginStandardRedirectPath()).toBe("/");
    expect(buildLoginStandardRedirectPath("")).toBe("/");
    expect(buildLoginStandardRedirectPath(new URLSearchParams())).toBe("/");
  });

  it("conserve les query params sûrs", () => {
    expect(buildLoginStandardRedirectPath("next=%2Femploye%2Fdashboard")).toBe(
      "/?next=%2Femploye%2Fdashboard"
    );
    expect(buildLoginStandardRedirectPath("?portal=direction")).toBe(
      "/?portal=direction"
    );
    expect(
      buildLoginStandardRedirectPath(new URLSearchParams({ next: "/direction/dashboard" }))
    ).toBe("/?next=%2Fdirection%2Fdashboard");
  });

  it("ne renvoie jamais /login comme cible", () => {
    const target = buildLoginStandardRedirectPath("foo=1");
    expect(target).not.toBe("/login");
    expect(target.startsWith("/login")).toBe(false);
    expect(target === "/" || target.startsWith("/?")).toBe(true);
  });

  it("laisse les routes rôle existantes distinctes du standard", () => {
    expect("/employe/login").not.toBe(LOGIN_STANDARD_PATH);
    expect("/direction/login").not.toBe(LOGIN_STANDARD_PATH);
    expect("/").toBe(LOGIN_STANDARD_TARGET_PATH);
  });
});
