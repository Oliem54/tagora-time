import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isHororaLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";
import {
  buildHororaPremium2027SyntheticDemo,
  HORORA_PREMIUM_2027_CROSS_ORGANIZATION_DENIAL,
  HORORA_PREMIUM_2027_INACTIVE_MEMBERSHIP_DENIAL,
  isHororaPremium2027SyntheticDemoEnabled,
  readHororaPremium2027SyntheticDemoContext,
} from "@/app/lib/auth/horora-premium-2027-synthetic-demo.shared";
import { HORORA_SYNTHETIC_PREVIEW_PROJECT_ID } from "@/app/lib/auth/horora-synthetic-preview-project.shared";

const ENABLED = {
  vercelProjectId: HORORA_SYNTHETIC_PREVIEW_PROJECT_ID,
  vercelEnv: "preview",
  hostname: "tagora-horora-premium-2027-mock-qa.vercel.app",
  supabaseUrl: null,
  serviceRoleKeyPresent: false,
} as const;

describe("HORORA Premium 2027 synthetic demo", () => {
  it("stays closed outside the fictional preview project", () => {
    expect(isHororaPremium2027SyntheticDemoEnabled(ENABLED)).toBe(true);
    expect(
      isHororaPremium2027SyntheticDemoEnabled({
        ...ENABLED,
        vercelProjectId: "prj_61wz0EOK67aYgjXulY4Tfu1ejDeY",
      })
    ).toBe(false);
    expect(
      isHororaPremium2027SyntheticDemoEnabled({ ...ENABLED, vercelEnv: "production" })
    ).toBe(false);
    expect(
      readHororaPremium2027SyntheticDemoContext({
        ...process.env,
        VERCEL_PROJECT_ID: undefined,
        VERCEL_ENV: undefined,
      })
    ).toMatchObject({ vercelProjectId: undefined, vercelEnv: undefined });
    expect(
      isHororaLocalNexusFixtureEnabled({
        nodeEnv: "production",
        vercelEnv: "preview",
        hostname: ENABLED.hostname,
        flag: "true",
        supabaseUrl: null,
      })
    ).toBe(false);
  });

  it("shows the fictional owner directory, rights, audit, and refused write", () => {
    const demo = buildHororaPremium2027SyntheticDemo();
    expect(demo.notice).toContain("Démonstration Premium 2027");
    expect(demo.session).toBeNull();
    expect(demo.supabaseCalled).toBe(false);
    expect(demo.owner.canAdministerRoles).toBe(true);
    expect(demo.owner.directory.some((row) => row.email === "employe.autorise@example.test")).toBe(
      true
    );
    expect(demo.owner.rightsPreview.gained).toContain("Vue d'équipe");
    expect(demo.owner.rightsPreview.lost).toContain("Pointage");
    expect(demo.owner.auditSimulation).toContain("employe → direction");
    expect(demo.owner.rollbackPreview.gained).toContain("Pointage");
    expect(demo.owner.suspendedEditor).toBe(false);
    expect(demo.owner.revokedEditor).toBe(false);
    expect(demo.owner.writeAttempt).toMatchObject({ persisted: false, writes: 0 });
  });

  it("limits fictional direction to its department and blocks role administration", () => {
    const demo = buildHororaPremium2027SyntheticDemo();
    expect(demo.direction.dashboard).toContain("Livraison");
    expect(demo.direction.approvalInsideDepartment).toBe(true);
    expect(demo.direction.correctionInsideDepartment).toBe(true);
    expect(demo.direction.outsideDepartment).toBe(false);
    expect(demo.direction.outsideReason).toBe("outside_perimeter");
    expect(demo.direction.canAdministerRoles).toBe(false);
    expect(demo.direction.writeAttempt.persisted).toBe(false);
  });

  it("keeps the fictional employee on their own file", () => {
    const demo = buildHororaPremium2027SyntheticDemo();
    expect(demo.employee.dossierId).toBe(900002);
    expect(demo.employee.punches.length).toBeGreaterThan(0);
    expect(demo.employee.breaks.length).toBeGreaterThan(0);
    expect(demo.employee.hours).toContain("fictives");
    expect(demo.employee.correctionRequest).toContain("non envoyée");
    expect(demo.employee.otherDossier).toMatchObject({
      dossierId: 900001,
      allowed: false,
    });
    expect(demo.employee.writeAttempt.writes).toBe(0);
  });

  it("refuses cross-organization, inactive, and revoked cases without writing", () => {
    const demo = buildHororaPremium2027SyntheticDemo();
    expect(demo.security.crossOrganization).toBe(false);
    expect(demo.security.crossOrganizationReason).toBe("cross_organization_forbidden");
    expect(demo.security.crossOrganizationVisible).toMatchObject({
      headline: HORORA_PREMIUM_2027_CROSS_ORGANIZATION_DENIAL,
      foreignDossierAccessible: false,
      realDataLoaded: false,
    });
    expect(demo.security.inactiveMembership).toMatchObject({
      headline: HORORA_PREMIUM_2027_INACTIVE_MEMBERSHIP_DENIAL,
      status: "inactive",
      dossierAccess: false,
      featureAccess: false,
      managementAccess: false,
      editor: false,
    });
    expect(demo.security.inactiveMembership.writeAttempt.roleAfterRefusal).toBe("employe");
    expect(demo.security.simulationNotice).toContain("Aucune base ni API réelle");
    expect(demo.security.revokedSession.status).toBe("REVOKED");
    expect(demo.security.revokedSession.writeAttempt.persisted).toBe(false);
    expect(demo.security.writesAfterRefusal).toBe(0);
    expect(demo.security.roleAfterRefusal).toBe("employe");
  });

  it("keeps the demo page off the official authentication routes", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/qa/premium-2027/page.tsx"),
      "utf8"
    );
    expect(page).toContain("isHororaPremium2027SyntheticDemoEnabled");
    expect(page).toContain("notFound()");
    expect(page).toContain("Simulations de sécurité");
    expect(page).toContain("{demo.security.crossOrganizationVisible.headline}");
    expect(page).toContain("{demo.security.inactiveMembership.headline}");
    expect(page).toContain("Session révoquée");
    expect(page).not.toContain("@/app/lib/supabase/client");
    expect(page).not.toContain("HORORA_LOCAL_FIXTURE_COOKIE_NAME");
    const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(middleware).not.toContain("buildHororaPremium2027SyntheticDemo");
  });
});
