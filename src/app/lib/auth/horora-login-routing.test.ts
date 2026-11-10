import { describe, expect, it } from "vitest";
import {
  HORORA_LOGIN_DENIED_PATH,
  HORORA_PRODUCTION_VERCEL_PROJECT_ID,
  HORORA_STAGING_VERCEL_PROJECT_ID,
  NEXUS_PUBLIC_LOGIN_URL,
  NEXUS_STAGING_LOGIN_URL,
  resolveHororaNexusLoginTarget,
} from "@/app/lib/canonical-domains";
import { resolveHororaRequestAccess } from "@/app/lib/auth/horora-session-contract";
import { getLoginPathForRole } from "@/app/lib/auth/roles";
import { loginPathForMissingMfaSession } from "@/app/lib/auth/password-mfa.shared";
import {
  cookieHeaderContainsDomain,
  serializeBrokeredSessionCookie,
} from "@/app/lib/auth/nexus-brokered-session";

const PRODUCTION = {
  hostname: "time.tagora.ca",
  vercelEnv: "production",
  vercelProjectId: HORORA_PRODUCTION_VERCEL_PROJECT_ID,
} as const;

const STAGING_ALIAS = {
  hostname: "tagora-time-staging.vercel.app",
  vercelEnv: "production",
  vercelProjectId: HORORA_STAGING_VERCEL_PROJECT_ID,
} as const;

const STAGING_PREVIEW = {
  hostname: "tagora-time-staging-i1s447br7-oliem54s-projects.vercel.app",
  vercelEnv: "preview",
  vercelProjectId: HORORA_STAGING_VERCEL_PROJECT_ID,
} as const;

describe("HORORA Nexus login routing", () => {
  it("keeps Production on the Production Nexus login", () => {
    expect(resolveHororaNexusLoginTarget(PRODUCTION)).toEqual({
      action: "redirect",
      environment: "production",
      location: NEXUS_PUBLIC_LOGIN_URL,
    });
    expect(
      resolveHororaRequestAccess({
        pathname: "/admin/utilisateurs",
        hasBrokeredSessionCookie: false,
        ...PRODUCTION,
      })
    ).toEqual({ action: "redirect", location: "https://app.tagora.ca/login" });
  });

  it("sends the Staging alias to Nexus Staging", () => {
    expect(resolveHororaNexusLoginTarget(STAGING_ALIAS)).toEqual({
      action: "redirect",
      environment: "staging",
      location: NEXUS_STAGING_LOGIN_URL,
    });
    expect(NEXUS_STAGING_LOGIN_URL).toBe("https://tagora-nexus-staging.vercel.app/login");
  });

  it("sends a tagora-time-staging preview to Nexus Staging", () => {
    expect(resolveHororaNexusLoginTarget(STAGING_PREVIEW)).toEqual({
      action: "redirect",
      environment: "staging",
      location: NEXUS_STAGING_LOGIN_URL,
    });
    expect(getLoginPathForRole("admin", STAGING_PREVIEW.hostname)).toBe(NEXUS_STAGING_LOGIN_URL);
    expect(loginPathForMissingMfaSession("/admin/utilisateurs", STAGING_PREVIEW.hostname)).toBe(
      NEXUS_STAGING_LOGIN_URL
    );
  });

  it("denies an unknown host without a Production redirect", () => {
    for (const hostname of [
      "localhost",
      "time.staging.tagora.ca",
      "tagora-time-j00xn10sc-oliem54s-projects.vercel.app",
      "evil.example",
      null,
    ]) {
      const decision = resolveHororaNexusLoginTarget({ hostname });
      expect(decision.action).toBe("deny");
      if (decision.action === "deny") {
        expect(decision.reason).toBe("unknown_host");
      }
      expect(
        resolveHororaRequestAccess({
          pathname: "/admin/utilisateurs",
          hasBrokeredSessionCookie: false,
          hostname,
        })
      ).toMatchObject({ action: "deny" });
    }
    expect(getLoginPathForRole("employe", "evil.example")).toBe(HORORA_LOGIN_DENIED_PATH);
    expect(getLoginPathForRole("employe", "evil.example")).not.toBe(NEXUS_PUBLIC_LOGIN_URL);
  });

  it("denies a contradictory host and project", () => {
    expect(
      resolveHororaNexusLoginTarget({
        hostname: "time.tagora.ca",
        vercelEnv: "preview",
        vercelProjectId: HORORA_STAGING_VERCEL_PROJECT_ID,
      }).action
    ).toBe("deny");
    expect(
      resolveHororaNexusLoginTarget({
        hostname: "tagora-time-staging.vercel.app",
        vercelEnv: "production",
        vercelProjectId: HORORA_PRODUCTION_VERCEL_PROJECT_ID,
      })
    ).toMatchObject({ action: "deny", reason: "contradictory_environment" });
    expect(
      resolveHororaNexusLoginTarget({
        hostname: "tagora-time-staging-preview.vercel.app",
        vercelEnv: "preview",
        vercelProjectId: HORORA_PRODUCTION_VERCEL_PROJECT_ID,
      }).action
    ).toBe("deny");
  });

  it("keeps an authenticated app path open and still refuses a legacy login", () => {
    expect(
      resolveHororaRequestAccess({
        pathname: "/admin/utilisateurs",
        hasBrokeredSessionCookie: true,
        ...STAGING_ALIAS,
      })
    ).toEqual({ action: "next" });
    expect(
      resolveHororaRequestAccess({
        pathname: "/employe/login",
        hasBrokeredSessionCookie: true,
        ...STAGING_ALIAS,
      })
    ).toEqual({ action: "redirect", location: NEXUS_STAGING_LOGIN_URL });
    expect(
      resolveHororaRequestAccess({
        pathname: "/api/admin/utilisateurs/directory",
        hasBrokeredSessionCookie: false,
        hostname: "evil.example",
      })
    ).toEqual({ action: "next" });
  });

  it("keeps the brokered session cookie host-only", () => {
    const header = serializeBrokeredSessionCookie({
      token: "opaque-session",
      maxAgeSeconds: 60,
      environment: "staging",
    });
    expect(header).toContain("horora_nx_session=");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(cookieHeaderContainsDomain(header)).toBe(false);
  });
});
