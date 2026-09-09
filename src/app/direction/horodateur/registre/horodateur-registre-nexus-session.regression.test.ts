import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEXUS_PUBLIC_LOGIN_URL, NEXUS_PUBLIC_MODULES_URL } from "@/app/lib/canonical-domains";
import { getLoginPathForRole } from "@/app/lib/auth/roles";
import { mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import { DEFAULT_HORORA_NEXUS_ORGANIZATION_ID, resolveNexusPortalReturnUrl } from "@/app/lib/auth/nexus-handoff-config";
import { unionRegistreScopeEmployeeIds } from "@/app/lib/horodateur-v1/registre-aggregations.shared";
import { getWeekStartDate } from "@/app/lib/horodateur-v1/rules";
import { employeeMatchesCallerOrganization } from "@/app/lib/horodateur-v1/employee-punch-eligibility.shared";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("HORORA owner Registre Nexus session", () => {
  it("loads Registre with the Nexus cookie and never requires a Supabase JWT", () => {
    const page = read(
      "src/app/direction/horodateur/registre/DirectionHorodateurRegistreClient.tsx"
    );
    const session = read("src/app/lib/auth/horora-nexus-session.client.ts");
    const api = read("src/app/api/direction/horodateur/registre/route.ts");
    const auth = read("src/app/lib/account-requests.server.ts");
    expect(page).toContain("hororaNexusSessionRequestInit");
    expect(page).toContain("redirectToNexusLoginIfUnauthenticated");
    expect(page).not.toContain("supabase.auth.getSession");
    expect(page).not.toContain("Session absente.");
    expect(page).not.toContain("Authorization");
    expect(session).toContain("credentials: \"same-origin\"");
    expect(session).toContain("headers.delete(\"Authorization\")");
    expect(session).not.toContain("supabase.auth.getSession");
    expect(api).toContain("requireDirectionHorodateurAccess");
    expect(api).toContain("organizationId: auth.organizationId");
    expect(api).not.toContain("searchParams.get(\"organizationId\")");
    expect(auth).toContain("resolveBrokeredHororaSessionFromCookies");
    expect(auth).not.toContain("getUser(token)");
  });

  it("redirects a missing Nexus session to the canonical Nexus login", () => {
    const page = read(
      "src/app/direction/horodateur/registre/DirectionHorodateurRegistreClient.tsx"
    );
    const gate = read("src/app/components/AuthGate.tsx");
    const shared = read("src/app/api/horodateur/_shared.ts");
    expect(page).toContain("redirectToNexusLoginIfUnauthenticated(res.status)");
    expect(getLoginPathForRole("admin")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(getLoginPathForRole("direction")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(gate).toContain("getLoginPathForRole(areaRole)");
    expect(shared).toContain('code: "unauthenticated"');
    expect(shared).toContain("status: 401");
  });

  it("refuses employee access to the owner Registre", () => {
    const shared = read("src/app/api/horodateur/_shared.ts");
    const layout = read("src/app/direction/layout.tsx");
    expect(shared).toContain("role === \"direction\" || role === \"admin\"");
    expect(shared).toContain('code: "forbidden"');
    expect(layout).toContain('areaRole="direction"');
    expect(mapOrganizationMembershipRoleToAppRole("employe")).toBe("employe");
    expect(mapOrganizationMembershipRoleToAppRole("organization_owner")).toBe(
      "admin"
    );
  });

  it("scopes the owner to the mapped TAGORA Internal organization only", () => {
    const api = read("src/app/api/direction/horodateur/registre/route.ts");
    const service = read("src/app/lib/horodateur-v1/registre-service.server.ts");
    expect(DEFAULT_HORORA_NEXUS_ORGANIZATION_ID).toBe("org_tagora_internal");
    expect(api).toContain("organizationId: auth.organizationId");
    expect(service).toContain("organizationId: options.organizationId");
    expect(service).toContain("profile.organizationId !== options.organizationId");
    expect(
      employeeMatchesCallerOrganization("org_tagora_internal", "org_tagora_internal")
    ).toBe(true);
    expect(
      employeeMatchesCallerOrganization("org_tagora_internal", "org_other")
    ).toBe(false);
  });

  it("keeps Yves punch visible from events even without a completed shift", () => {
    const service = read("src/app/lib/horodateur-v1/registre-service.server.ts");
    const repository = read("src/app/lib/horodateur-v1/repository.ts");
    expect(service).toContain("unionRegistreScopeEmployeeIds");
    expect(service).toContain("eventEmployeeIds: eventsAll.map");
    expect(repository).toContain("if (!employeeIds.length && !options.organizationId)");
    expect(
      unionRegistreScopeEmployeeIds({
        shiftEmployeeIds: [],
        eventEmployeeIds: [10],
        requestedEmployeeId: null,
      })
    ).toEqual([10]);
  });

  it("does not treat a missing work-session as a missing authentication session", () => {
    const page = read(
      "src/app/direction/horodateur/registre/DirectionHorodateurRegistreClient.tsx"
    );
    const live = read("src/app/direction/horodateur/DirectionHorodateurClient.tsx");
    expect(page).not.toContain("Session absente.");
    expect(page).not.toContain("workSession");
    expect(page).not.toContain("shiftId");
    expect(live).not.toContain("Session introuvable.");
    expect(live).not.toContain("supabase.auth.getSession");
    expect(live).toContain("fetchHororaNexusSession");
    expect(live).toContain("/api/direction/horodateur/exceptions/");
    expect(live).toContain("/refuse");
  });

  it("never requires an obsolete Supabase browser session for Registre or exception refuse", () => {
    const page = read(
      "src/app/direction/horodateur/registre/DirectionHorodateurRegistreClient.tsx"
    );
    const live = read("src/app/direction/horodateur/DirectionHorodateurClient.tsx");
    const auth = read("src/app/lib/account-requests.server.ts");
    expect(page).not.toContain("@/app/lib/supabase/client");
    expect(live).not.toContain("@/app/lib/supabase/client");
    expect(auth).toContain("NEXUS_BROKERED_SESSION_COOKIE_NAME");
    expect(auth).toContain('sessionSource: "nexus_handoff"');
  });

  it("hides cross-tenant data and keeps Oliem as an operating company of TAGORA Internal", () => {
    const service = read("src/app/lib/horodateur-v1/registre-service.server.ts");
    expect(service).toContain('label: "Oliem Solutions"');
    expect(service).toContain('label: "Titan Produits Industriels"');
    expect(service).toContain("listActiveEmployees");
    expect(service).toContain("listHorodateurEventsInWorkDateRange");
    expect(service).not.toContain("searchParams.get(\"organizationId\")");
  });

  it("uses the Montréal week window that contains the Yves 2026-09-08 punch", () => {
    const page = read(
      "src/app/direction/horodateur/registre/DirectionHorodateurRegistreClient.tsx"
    );
    expect(page).toContain('timeZone: "America/Toronto"');
    expect(page).toContain("getWeekStartDate");
    expect(getWeekStartDate("2026-09-08T12:00:00")).toBe("2026-09-07");
    expect(getWeekStartDate("2026-09-13T12:00:00")).toBe("2026-09-07");
    expect(getWeekStartDate("2026-09-14T12:00:00")).toBe("2026-09-14");
  });

  it("keeps a legitimate empty period distinct from an authentication error", () => {
    const page = read(
      "src/app/direction/horodateur/registre/DirectionHorodateurRegistreClient.tsx"
    );
    expect(page).toContain("!fetching && !error && (data?.employees?.length ?? 0) === 0");
    expect(page).toContain("Aucune heure trouvée pour cette période.");
    expect(page).not.toContain("Session absente.");
  });

  it("returns owners to the canonical Nexus modules URL, never the Vercel hostname", () => {
    expect(NEXUS_PUBLIC_MODULES_URL).toBe("https://app.tagora.ca/modules");
    expect(
      resolveNexusPortalReturnUrl({
        NEXUS_PORTAL_RETURN_URL: "https://tagora-nexus.vercel.app/modules",
      })
    ).toEqual({ ok: true, url: NEXUS_PUBLIC_MODULES_URL });
    expect(
      resolveNexusPortalReturnUrl({
        NEXUS_PORTAL_RETURN_URL:
          "https://tagora-nexus-oliem54s-projects.vercel.app/modules",
      })
    ).toEqual({ ok: true, url: NEXUS_PUBLIC_MODULES_URL });
    expect(
      resolveNexusPortalReturnUrl({
        NEXUS_PORTAL_RETURN_URL: "https://tagora-nexus-staging.vercel.app/modules",
      })
    ).toEqual({
      ok: true,
      url: "https://tagora-nexus-staging.vercel.app/modules",
    });
  });
});
