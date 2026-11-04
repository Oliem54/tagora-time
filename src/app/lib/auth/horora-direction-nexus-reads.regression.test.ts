import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nexusHandoffBlocksEffectifsMutation } from "@/app/api/direction/effectifs/effectifs-mutation-guard.server";
import { readReliableHororaSessionDisplay } from "@/app/lib/auth/horora-session-display.shared";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function sliceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("reliable HORORA session display", () => {
  it("exposes a display name only from server app_metadata, plus the auth email", () => {
    expect(
      readReliableHororaSessionDisplay({
        email: "martin@example.com",
        app_metadata: { full_name: "Martin St-Gelais" },
      })
    ).toEqual({
      displayName: "Martin St-Gelais",
      email: "martin@example.com",
    });
    expect(
      readReliableHororaSessionDisplay({
        email: "martin@example.com",
        app_metadata: { display_name: "Martin St-Gelais" },
      }).displayName
    ).toBe("Martin St-Gelais");
  });

  it("does not accept a name from user_metadata or from a missing server field", () => {
    const injected = {
      email: "martin@example.com",
      app_metadata: { role: "admin" },
      user_metadata: { full_name: "Injected Name", display_name: "Injected Name" },
    };
    expect(readReliableHororaSessionDisplay(injected)).toEqual({
      displayName: null,
      email: "martin@example.com",
    });
    expect(readReliableHororaSessionDisplay({ email: " ", app_metadata: {} })).toEqual({
      displayName: null,
      email: null,
    });
    expect(readReliableHororaSessionDisplay(null)).toEqual({
      displayName: null,
      email: null,
    });
  });

  it("keeps session-context on the server auth user and off browser identity fields", () => {
    const route = read("src/app/api/auth/session-context/route.ts");
    const helper = read("src/app/lib/auth/horora-session-display.shared.ts");
    expect(route).toContain("readReliableHororaSessionDisplay(user)");
    expect(route).toContain('source: "nexus_handoff"');
    expect(route).not.toContain("user_metadata");
    expect(route).not.toContain("searchParams");
    expect(route).not.toContain("req.json");
    expect(helper).not.toContain("user_metadata");
    expect(helper).not.toContain("searchParams");
    expect(helper).not.toContain("cookie");
  });
});

describe("Direction Nexus handoff reads", () => {
  it("lets a nexus_handoff direction/admin session read Employés without a Supabase browser JWT", () => {
    const page = read("src/app/direction/ressources/employes/page.tsx");
    const load = sliceBetween(page, "const fetchEmployes", "async function callActivation");
    const api = read("src/app/api/direction/ressources/employes/route.ts");
    expect(load).toContain("hororaNexusSessionRequestInit");
    expect(load).not.toContain("supabase.auth.getSession");
    expect(load).not.toContain("Authorization");
    expect(load).not.toContain("Session expirée. Reconnectez-vous.");
    expect(api).toContain("getAuthenticatedRequestUser");
    expect(api).toContain('role !== "direction" && role !== "admin"');
    expect(api).toContain("jsonError(401");
    expect(api).toContain("jsonError(403");
  });

  it("lets a nexus_handoff direction/admin session read Effectifs without a Supabase browser JWT", () => {
    const page = read("src/app/direction/effectifs/DirectionEffectifsClient.tsx");
    const load = sliceBetween(page, "const loadEffectifs", "const loadLivePresence");
    const live = sliceBetween(page, "const loadLivePresence", "useEffect(() => {\n    if (accessLoading || user)");
    const api = read("src/app/api/direction/effectifs/route.ts");
    expect(load).toContain("hororaNexusSessionRequestInit");
    expect(load).not.toContain("supabase.auth.getSession");
    expect(load).not.toContain("Session expirée. Reconnectez-vous.");
    expect(live).toContain("hororaNexusSessionRequestInit");
    expect(live).not.toContain("supabase.auth.getSession");
    expect(api).toContain("getAuthenticatedRequestUser");
    expect(api).toContain('error: "Non authentifié."');
    expect(api).toContain("{ status: 401 }");
  });

  it("loads the employee profile and long-leave list from the Nexus cookie", () => {
    const profile = read(
      "src/app/direction/ressources/employes/EmployeeProfilePageClient.tsx"
    );
    const leave = read("src/app/direction/ressources/employes/EmployeeLongLeaveSection.tsx");
    const profileLoad = sliceBetween(profile, "const loadEmployeProfile", "useEffect(() => {");
    const leaveLoad = sliceBetween(leave, "const load = useCallback", "useEffect(() => {");
    const profileApi = read("src/app/api/direction/ressources/employes/[id]/route.ts");
    expect(profileLoad).toContain("hororaNexusSessionRequestInit");
    expect(profileLoad).not.toContain("supabase.auth.getSession");
    expect(leaveLoad).toContain("hororaNexusSessionRequestInit");
    expect(leaveLoad).not.toContain("supabase.auth.getSession");
    expect(profileApi).toContain('role !== "direction" && role !== "admin"');
    expect(profileApi).toContain("jsonError(401");
    expect(profileApi).toContain("jsonError(403");
  });

  it("loads the fleet from the Nexus cookie", () => {
    const page = read("src/app/direction/ressources/vehicules/page.tsx");
    const load = sliceBetween(page, "const fetchFleet", "useEffect(() => {");
    const api = read("src/app/api/direction/ressources/fleet/route.ts");
    expect(load).toContain("hororaNexusSessionRequestInit");
    expect(load).not.toContain("supabase.auth.getSession");
    expect(load).not.toContain("Session expirée");
    expect(api).toContain("getAuthenticatedRequestUser");
    expect(api).toContain('role !== "direction" && role !== "admin"');
    expect(api).toContain("forbidden()");
  });

  it("refuses a missing session and a non-direction role on the direction read APIs", () => {
    const employes = read("src/app/api/direction/ressources/employes/route.ts");
    const profile = read("src/app/api/direction/ressources/employes/[id]/route.ts");
    const fleet = read("src/app/api/direction/ressources/fleet/route.ts");
    const effectifs = read("src/app/api/direction/effectifs/route.ts");
    for (const source of [employes, profile, fleet]) {
      expect(source).toContain('role !== "direction" && role !== "admin"');
    }
    expect(employes).toContain("jsonError(401");
    expect(profile).toContain("jsonError(401");
    expect(fleet).toContain("if (!user || (role !== \"direction\" && role !== \"admin\"))");
    expect(effectifs).toContain("if (!user)");
    expect(effectifs).toContain("{ status: 401 }");
  });

  it("does not authorize business writes from the Nexus browser session", () => {
    const employes = read("src/app/direction/ressources/employes/page.tsx");
    const profile = read(
      "src/app/direction/ressources/employes/EmployeeProfilePageClient.tsx"
    );
    const leave = read("src/app/direction/ressources/employes/EmployeeLongLeaveSection.tsx");
    const fleet = read("src/app/direction/ressources/vehicules/page.tsx");
    const effectifs = read("src/app/direction/effectifs/DirectionEffectifsClient.tsx");

    const activation = sliceBetween(employes, "async function callActivation", "function handleDeactivate");
    const archive = sliceBetween(employes, "async function handleArchiveDelete", "const isActiveRow");
    const profileSave = sliceBetween(profile, "setSaving(true);", "async function getSessionToken");
    const leaveCreate = sliceBetween(leave, "async function submitCreate", "async function patchPeriod");
    const fleetHeaders = sliceBetween(fleet, "const authHeaders", "const fetchFleet");
    const fleetSave = sliceBetween(fleet, "async function handleSubmit", "async function handleDelete");
    const effectifsHeaders = sliceBetween(
      effectifs,
      "async function authJsonHeaders",
      "async function handleCreateWindow"
    );
    const effectifsCreate = sliceBetween(
      effectifs,
      "async function handleCreateWindow",
      "async function handleDeleteCalendarException"
    );

    for (const write of [activation, archive, profileSave, leaveCreate, fleetHeaders, effectifsHeaders]) {
      expect(write).toContain("supabase.auth.getSession");
      expect(write).not.toContain("hororaNexusSessionRequestInit");
    }
    expect(fleetSave).toContain("authHeaders()");
    expect(fleetSave).not.toContain("hororaNexusSessionRequestInit");
    expect(fleetSave).toContain("if (!headers)");
    expect(effectifsCreate).toContain("fetchEffectifsMutation");
    expect(effectifsCreate).toContain("if (!res)");
    expect(effectifsCreate).not.toContain("hororaNexusSessionRequestInit");
    expect(effectifsCreate).not.toContain("await fetch(");
  });

  it("blocks an empty Supabase bearer before any Effectifs mutation fetch", () => {
    const page = read("src/app/direction/effectifs/DirectionEffectifsClient.tsx");
    const helper = sliceBetween(
      page,
      "async function fetchEffectifsMutation",
      "function refuseEffectifsMutationWithoutSupabaseToken"
    );
    const headers = sliceBetween(page, "async function authJsonHeaders", "async function fetchEffectifsMutation");
    expect(headers).toContain("if (!token) return null");
    expect(helper.indexOf("if (!headers) return null")).toBeGreaterThan(-1);
    expect(helper.indexOf("if (!headers) return null")).toBeLessThan(helper.indexOf("return fetch("));
    expect(helper).toContain('credentials: "omit"');
    expect(helper).not.toContain("hororaNexusSessionRequestInit");
    expect(page.split("fetchEffectifsMutation(").length - 1).toBeGreaterThanOrEqual(11);
  });

  it("refuses Effectifs writes from a nexus_handoff cookie and keeps the read open", () => {
    expect(nexusHandoffBlocksEffectifsMutation("nexus_handoff")).toBe(true);
    expect(nexusHandoffBlocksEffectifsMutation("local_nexus_fixture")).toBe(false);
    expect(nexusHandoffBlocksEffectifsMutation(null)).toBe(false);

    const route = read("src/app/api/direction/effectifs/route.ts");
    const readPart = sliceBetween(route, "export async function GET", "export async function POST");
    const writePart = route.slice(route.indexOf("export async function POST"));
    expect(readPart).not.toContain("nexusHandoffEffectifsMutationResponse(");
    expect(readPart).toContain("if (!user)");
    expect(writePart).toContain("nexusHandoffEffectifsMutationResponse(sessionSource)");

    const mutationFiles = [
      "src/app/api/direction/effectifs/route.ts",
      "src/app/api/direction/effectifs/[id]/route.ts",
      "src/app/api/direction/effectifs/calendar-exceptions/route.ts",
      "src/app/api/direction/effectifs/calendar-exceptions/[id]/route.ts",
      "src/app/api/direction/effectifs/schedule-requests/[id]/route.ts",
      "src/app/api/direction/effectifs/regular-closed-days/route.ts",
      "src/app/api/direction/effectifs/departments/route.ts",
      "src/app/api/direction/effectifs/departments/[id]/route.ts",
    ];
    for (const file of mutationFiles) {
      expect(read(file)).toContain("nexusHandoffEffectifsMutationResponse(sessionSource)");
    }
    const departments = read("src/app/api/direction/effectifs/departments/route.ts");
    const departmentRead = sliceBetween(
      departments,
      "export async function GET",
      "export async function POST"
    );
    expect(departmentRead).not.toContain("nexusHandoffEffectifsMutationResponse(");
  });
});
