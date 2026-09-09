import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  composePermissionsForEffectiveRole,
  hasUserPermission,
} from "@/app/lib/auth/permissions";
import type { User } from "@supabase/supabase-js";
import {
  employeePunchEventRequiresGeolocation,
  messageForPunchGeolocationFailure,
  primaryRecoveryActionForPunchGeolocationFailure,
  PUNCH_GEOLOCATION_OPEN_SETTINGS_LABEL,
  PUNCH_GEOLOCATION_RETRY_LABEL,
} from "@/app/lib/employee-punch-geolocation.client";
import { evaluateWebPunchGpsCoordinates } from "@/app/lib/horodateur-web-punch-gps.shared";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import { getLoginPathForRole } from "@/app/lib/auth/roles";
import { employeeMatchesCallerOrganization } from "@/app/lib/horodateur-v1/employee-punch-eligibility.shared";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function makeUser(permissions: string[] = []): User {
  return {
    id: "user-test",
    app_metadata: { role: "employe", permissions },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

describe("HORORA employee punch unblock", () => {
  it("lets an employe with a valid Nexus role request geolocation without JWT modules", () => {
    expect(hasUserPermission(makeUser([]), "terrain", "employe")).toBe(true);
    expect(employeePunchEventRequiresGeolocation("punch_in")).toBe(true);
    expect(employeePunchEventRequiresGeolocation("punch_out")).toBe(true);
    expect(employeePunchEventRequiresGeolocation("break_start")).toBe(false);
  });

  it("does not disable Pointer before a geolocation request", () => {
    const welcome = read("src/app/components/horora/EmployeDashboardWelcome.tsx");
    expect(welcome).toContain("const canOpenPunch = punch.enabled");
    expect(welcome).not.toContain("status !== \"indisponible\"");
    expect(welcome).not.toContain("Boolean(punch.snapshot)");
  });

  it("maps denied geolocation to the browser-settings recovery action", () => {
    expect(primaryRecoveryActionForPunchGeolocationFailure("permission_denied")).toBe(
      "settings"
    );
    expect(messageForPunchGeolocationFailure("permission_denied")).toContain(
      PUNCH_GEOLOCATION_OPEN_SETTINGS_LABEL
    );
    expect(messageForPunchGeolocationFailure("permission_denied")).toContain(
      PUNCH_GEOLOCATION_RETRY_LABEL
    );
  });

  it("keeps unavailable and timeout fail-closed with retry as the primary action", () => {
    expect(primaryRecoveryActionForPunchGeolocationFailure("timeout")).toBe("retry");
    expect(primaryRecoveryActionForPunchGeolocationFailure("position_unavailable")).toBe(
      "retry"
    );
    expect(messageForPunchGeolocationFailure("timeout")).toContain("localisation Windows");
    expect(messageForPunchGeolocationFailure("position_unavailable")).toContain(
      "localisation Windows"
    );
    expect(evaluateWebPunchGpsCoordinates(null, null)).toMatchObject({
      ok: false,
      code: "GPS_REQUIRED",
    });
  });

  it("reports a missing business permission distinctly from browser geolocation", () => {
    const card = read("src/app/components/horodateur/HorodateurEmployeeCard.tsx");
    const hook = read("src/app/hooks/useEmployeePunchSnapshot.ts");
    expect(card).toContain("La permission terrain est requise pour utiliser l");
    expect(hook).toContain("EMPLOYEE_PUNCH_BUSINESS_PERMISSION_MESSAGE");
    expect(hook).toContain("permission_denied");
    expect(messageForPunchGeolocationFailure("permission_denied")).not.toContain(
      "permission terrain"
    );
    expect(
      composePermissionsForEffectiveRole("direction", []).includes("terrain")
    ).toBe(false);
  });

  it("persists a valid punch once and ignores a duplicate in-flight click", () => {
    const hook = read("src/app/hooks/useEmployeePunchSnapshot.ts");
    const page = read("src/app/employe/horodateur/page.tsx");
    expect(hook).toContain("if (submitLockRef.current)");
    expect(hook).toContain("alreadySubmitted");
    expect(hook).toContain("Pointage enregistré.");
    expect(page).toContain("payload.alreadySubmitted === true");
  });

  it("reloads punch state from the snapshot API after refresh", () => {
    const hook = read("src/app/hooks/useEmployeePunchSnapshot.ts");
    expect(hook).toContain("/api/horodateur/punch");
    expect(hook).toContain("void loadSnapshot()");
    expect(hook).toContain("setSnapshot(normalizeDashboardSnapshot");
  });

  it("does not grant admin or direction rights to an entitled employe", () => {
    const user = makeUser([]);
    expect(hasUserPermission(user, "terrain", "employe")).toBe(true);
    expect(hasUserPermission(user, "admin_finance", "employe")).toBe(false);
    expect(hasUserPermission(user, "horodateur_payroll_manage", "employe")).toBe(
      false
    );
    expect(composePermissionsForEffectiveRole("employe", [])).toEqual(["terrain"]);
  });

  it("redirects unauthenticated or legacy sessions to Nexus", () => {
    expect(getLoginPathForRole("employe")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    const hook = read("src/app/hooks/useEmployeePunchSnapshot.ts");
    const login = read("src/app/employe/login/page.tsx");
    expect(hook).toContain("NEXUS_PUBLIC_LOGIN_URL");
    expect(hook).toContain("response.status === 401");
    expect(login).toContain("NEXUS_PUBLIC_LOGIN_URL");
  });

  it("keeps Martin and Yves punch snapshots isolated by auth user id", () => {
    const service = read("src/app/lib/horodateur-v1/service.ts");
    expect(service).toContain(
      "export async function getEmployeeDashboardSnapshotByAuthUserId"
    );
    expect(service).toContain("resolveEmployeeByAuthUserId(authUserId)");
    expect(
      employeeMatchesCallerOrganization(
        "11111111-1111-4111-8111-111111111111",
        "11111111-1111-4111-8111-111111111111"
      )
    ).toBe(true);
    expect(
      employeeMatchesCallerOrganization(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222"
      )
    ).toBe(false);
  });

  it("never invents fallback coordinates for a punch", () => {
    const geo = read("src/app/lib/employee-punch-geolocation.client.ts");
    const hook = read("src/app/hooks/useEmployeePunchSnapshot.ts");
    expect(geo).not.toContain("fallbackCoordinates");
    expect(geo).not.toContain("DEFAULT_LAT");
    expect(hook).toContain("if (!gpsResult.ok)");
    expect(hook).toContain("body.latitude = gpsResult.latitude");
    expect(hook).not.toContain("latitude = 0");
    expect(hook).not.toContain("longitude = 0");
  });

  it("authenticates employee punch through the Nexus cookie, not a Supabase JWT", () => {
    const session = read("src/app/lib/employee-punch-session.client.ts");
    const shared = read("src/app/lib/auth/horora-nexus-session.client.ts");
    const hook = read("src/app/hooks/useEmployeePunchSnapshot.ts");
    const page = read("src/app/employe/horodateur/page.tsx");
    expect(session).toContain("hororaNexusSessionRequestInit");
    expect(shared).toContain('credentials: "same-origin"');
    expect(hook).toContain("employeePunchRequestInit");
    expect(hook).not.toContain("supabase.auth.getSession");
    expect(page).toContain("employeePunchRequestInit");
    expect(page).not.toContain("supabase.auth.getSession");
  });
});
