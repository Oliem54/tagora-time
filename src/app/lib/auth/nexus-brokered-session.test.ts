import { describe, expect, it } from "vitest";
import {
  NEXUS_BROKERED_SESSION_COOKIE_NAME,
  authorizedHororaPathForRole,
  cookieHeaderContainsDomain,
  createBrokeredHororaSession,
  createMemoryBrokeredSessionStore,
  generateOpaqueSessionToken,
  hashOpaqueSessionToken,
  resolveBrokeredHororaSessionFromCookies,
  revokeBrokeredHororaSessionFromCookies,
  serializeBrokeredSessionCookie,
  serializeClearedBrokeredSessionCookie,
  type NexusBrokeredRevalidationLookups,
} from "@/app/lib/auth/nexus-brokered-session";
import type { NexusResolvedBinding } from "@/app/lib/auth/nexus-identity-mapping.server";
import { getDashboardPathForRole } from "@/app/lib/auth/roles";

const BINDING: NexusResolvedBinding = {
  nexusActorId: "actor-1",
  nexusOrganizationId: "nexus-org-1",
  nexusMembershipId: "mem-nexus-1",
  authUserId: "11111111-1111-4111-8111-111111111111",
  organizationId: "33333333-3333-4333-8333-333333333333",
  membershipId: "44444444-4444-4444-8444-444444444444",
  membershipRole: "organization_admin",
  role: "admin",
};

function lookups(
  overrides: Partial<{
    status: string;
    organizationId: string;
    authUserId: string;
    orgStatus: string;
    authExists: boolean;
    role: string;
  }> = {}
): NexusBrokeredRevalidationLookups {
  return {
    async authUserExists(id) {
      if (overrides.authExists === false) return false;
      return id === BINDING.authUserId;
    },
    async findMembershipById(id) {
      if (id !== BINDING.membershipId) return null;
      return {
        id: BINDING.membershipId,
        organization_id: overrides.organizationId ?? BINDING.organizationId,
        role: overrides.role ?? "organization_admin",
        status: overrides.status ?? "active",
        is_default: true,
        user_id: overrides.authUserId ?? BINDING.authUserId,
      };
    },
    async findOrganizationById() {
      return {
        id: overrides.organizationId ?? BINDING.organizationId,
        status: overrides.orgStatus ?? "active",
        deleted_at: null,
      };
    },
  };
}

function cookieReader(header: string) {
  const match = header.match(new RegExp(`${NEXUS_BROKERED_SESSION_COOKIE_NAME}=([^;]*)`));
  const token = match?.[1] ?? "";
  return {
    get(name: string) {
      return name === NEXUS_BROKERED_SESSION_COOKIE_NAME ? token : undefined;
    },
  };
}

describe("brokered HORORA opaque session", () => {
  it("redirects by local membership AppRole", () => {
    expect(authorizedHororaPathForRole("employe")).toBe("/employe/dashboard");
    expect(authorizedHororaPathForRole("admin")).toBe("/admin/dashboard");
    expect(authorizedHororaPathForRole("direction")).toBe("/direction/dashboard");
    expect(getDashboardPathForRole("employe")).toBe("/employe/dashboard");
  });

  it("creates a session only after ALLOW and never stores the raw token", async () => {
    const store = createMemoryBrokeredSessionStore();
    const created = await createBrokeredHororaSession(BINDING, {
      store,
      environment: "production",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.redirectPath).toBe("/admin/dashboard");
    expect(created.cookieHeader).toContain("HttpOnly");
    expect(created.cookieHeader).toContain("Secure");
    expect(created.cookieHeader).toContain("SameSite=Lax");
    expect(cookieHeaderContainsDomain(created.cookieHeader)).toBe(false);
    const token = cookieReader(created.cookieHeader).get(NEXUS_BROKERED_SESSION_COOKIE_NAME) ?? "";
    const hash = await hashOpaqueSessionToken(token);
    const row = await store.findByTokenHash(hash);
    expect(row?.tokenHash).toBe(hash);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("redirects employe and direction bindings to their dashboards", async () => {
    const store = createMemoryBrokeredSessionStore();
    const employe = await createBrokeredHororaSession(
      { ...BINDING, role: "employe", membershipRole: "employe" },
      { store, environment: "local" }
    );
    expect(employe.ok).toBe(true);
    if (employe.ok) expect(employe.redirectPath).toBe("/employe/dashboard");

    const direction = await createBrokeredHororaSession(
      { ...BINDING, role: "direction", membershipRole: "direction" },
      { store, environment: "local" }
    );
    expect(direction.ok).toBe(true);
    if (direction.ok) expect(direction.redirectPath).toBe("/direction/dashboard");
  });

  it("uses a cryptographically random opaque token", () => {
    expect(generateOpaqueSessionToken()).not.toBe(generateOpaqueSessionToken());
  });

  it("sets HttpOnly / Secure-in-production / Lax / Path=/ and no Domain", () => {
    const local = serializeBrokeredSessionCookie({
      token: "abc",
      maxAgeSeconds: 60,
      environment: "local",
    });
    const prod = serializeBrokeredSessionCookie({
      token: "abc",
      maxAgeSeconds: 60,
      environment: "production",
    });
    expect(local).toContain("HttpOnly");
    expect(local).not.toContain("Secure");
    expect(prod).toContain("Secure");
    expect(serializeClearedBrokeredSessionCookie("production")).toContain("Max-Age=0");
  });

  it("revalidates membership and denies expired, revoked, and cross-tenant", async () => {
    const store = createMemoryBrokeredSessionStore();
    const created = await createBrokeredHororaSession(BINDING, { store, environment: "local" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const cookies = cookieReader(created.cookieHeader);

    const ok = await resolveBrokeredHororaSessionFromCookies(cookies, {
      store,
      lookups: lookups(),
    });
    expect(ok.ok).toBe(true);

    const expired = await resolveBrokeredHororaSessionFromCookies(cookies, {
      store,
      lookups: lookups(),
      now: new Date(Date.now() + 2 * 3600 * 1000),
    });
    expect(expired).toEqual({ ok: false, reason: "session_expired" });

    await revokeBrokeredHororaSessionFromCookies(cookies, { store });
    const revoked = await resolveBrokeredHororaSessionFromCookies(cookies, {
      store,
      lookups: lookups(),
    });
    expect(revoked).toEqual({ ok: false, reason: "session_revoked" });

    const created2 = await createBrokeredHororaSession(BINDING, { store, environment: "local" });
    expect(created2.ok).toBe(true);
    if (!created2.ok) return;
    const cookies2 = cookieReader(created2.cookieHeader);
    const cross = await resolveBrokeredHororaSessionFromCookies(cookies2, {
      store,
      lookups: lookups({ organizationId: "55555555-5555-4555-8555-555555555555" }),
    });
    expect(cross).toEqual({ ok: false, reason: "cross_tenant" });
  });
});
