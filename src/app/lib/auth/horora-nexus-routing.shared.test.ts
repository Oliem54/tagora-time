import { describe, expect, it } from "vitest";
import { NEXUS_PUBLIC_LOGIN_URL, NEXUS_PUBLIC_MODULES_URL } from "@/app/lib/canonical-domains";
import {
  NEXUS_STAGING_PORTAL_MODULES_URL,
  resolveNexusDeniedReturnUrl,
} from "@/app/lib/auth/nexus-handoff-config";
import { resolveHororaRequestAccess } from "@/app/lib/auth/horora-session-contract";
import {
  HORORA_UNKNOWN_LOGIN_PATH,
  NEXUS_STAGING_LOGIN_URL,
  NEXUS_STAGING_MODULES_URL,
  hororaNexusLoginRedirectTarget,
  readHororaServingProject,
  resolveHororaNexusLoginDestination,
  resolveHororaNexusModulesDestination,
} from "@/app/lib/auth/horora-nexus-routing.shared";

const stagingEnv = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_URL: "tagora-time-staging-example.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "tagora-time-staging.vercel.app",
  NEXUS_PORTAL_RETURN_URL: "https://app.tagora.ca/modules",
  HOST: "app.tagora.ca",
};

const productionEnv = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_URL: "tagora-time-example.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "tagora-time-oliem54s-projects.vercel.app",
  NEXUS_PORTAL_RETURN_URL: "https://tagora-nexus-staging.vercel.app/modules",
  HOST: "tagora-nexus-staging.vercel.app",
};

describe("HORORA Nexus login routing", () => {
  it("sends the Staging Vercel project to Nexus Staging even when VERCEL_ENV is production", () => {
    expect(readHororaServingProject(stagingEnv)).toBe("staging");
    expect(resolveHororaNexusLoginDestination(stagingEnv)).toEqual({
      ok: true,
      project: "staging",
      url: NEXUS_STAGING_LOGIN_URL,
    });
    expect(resolveHororaNexusModulesDestination(stagingEnv)).toEqual({
      ok: true,
      project: "staging",
      url: NEXUS_STAGING_PORTAL_MODULES_URL,
    });
    expect(NEXUS_STAGING_LOGIN_URL).toBe("https://tagora-nexus-staging.vercel.app/login");
    expect(NEXUS_STAGING_MODULES_URL).toBe(NEXUS_STAGING_PORTAL_MODULES_URL);
    expect(hororaNexusLoginRedirectTarget(stagingEnv)).toBe(NEXUS_STAGING_LOGIN_URL);
    expect(hororaNexusLoginRedirectTarget(stagingEnv)).not.toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(
      resolveHororaRequestAccess({
        pathname: "/employe/dashboard",
        hasBrokeredSessionCookie: false,
        env: stagingEnv,
      })
    ).toEqual({ action: "redirect", location: NEXUS_STAGING_LOGIN_URL });
    expect(resolveNexusDeniedReturnUrl(stagingEnv)).toBe(NEXUS_STAGING_MODULES_URL);
  });

  it("keeps the Production Vercel project on Nexus Production", () => {
    expect(readHororaServingProject(productionEnv)).toBe("production");
    expect(resolveHororaNexusLoginDestination(productionEnv)).toEqual({
      ok: true,
      project: "production",
      url: NEXUS_PUBLIC_LOGIN_URL,
    });
    expect(resolveHororaNexusModulesDestination(productionEnv)).toEqual({
      ok: true,
      project: "production",
      url: NEXUS_PUBLIC_MODULES_URL,
    });
  });

  it("recognizes local development without sending it to either Nexus", () => {
    const localEnv = { NODE_ENV: "development" };
    expect(readHororaServingProject(localEnv)).toBe("local");
    expect(resolveHororaNexusLoginDestination(localEnv)).toEqual({
      ok: false,
      project: "local",
    });
    expect(hororaNexusLoginRedirectTarget(localEnv)).toBe(HORORA_UNKNOWN_LOGIN_PATH);
  });

  it("fails closed when the Vercel project is unknown", () => {
    const unknownEnv = { VERCEL: "1", VERCEL_ENV: "production" };
    expect(readHororaServingProject(unknownEnv)).toBe("unknown");
    expect(resolveHororaNexusLoginDestination(unknownEnv).ok).toBe(false);
    expect(resolveHororaNexusModulesDestination(unknownEnv).ok).toBe(false);
    expect(hororaNexusLoginRedirectTarget(unknownEnv)).toBe(HORORA_UNKNOWN_LOGIN_PATH);
    expect(hororaNexusLoginRedirectTarget({})).not.toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(hororaNexusLoginRedirectTarget({})).not.toBe(NEXUS_STAGING_LOGIN_URL);
    expect(
      resolveHororaRequestAccess({
        pathname: "/direction/dashboard",
        hasBrokeredSessionCookie: false,
        env: unknownEnv,
      })
    ).toEqual({ action: "deny" });
    expect(resolveNexusDeniedReturnUrl(unknownEnv)).toBeNull();
    expect(resolveNexusDeniedReturnUrl({ NODE_ENV: "development" })).toBeNull();
  });
});
