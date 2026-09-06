import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_HERO = [
  "linear-gradient(180deg, #11335f",
  "linear-gradient(135deg, #081e3c",
  "linear-gradient(135deg, #102a50",
];

describe("HORORA Premium 2027 complete visual system", () => {
  it("loads the shared system after globals", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("./lib/brand/horora-system.css");
    expect(layout.indexOf("./globals.css")).toBeLessThan(
      layout.indexOf("./lib/brand/horora-system.css")
    );
  });

  it("removes the root html/body blue hero", () => {
    const globals = read("src/app/globals.css");
    const htmlIndex = globals.search(/html,\s*body/);
    expect(htmlIndex).toBeGreaterThan(-1);
    const htmlBlock = globals.slice(htmlIndex, htmlIndex + 400);
    expect(htmlBlock).toContain("var(--tagora-surface-soft");
    expect(htmlBlock).not.toContain("#11335f");
  });

  it("wires Direction, Admin and employee dashboards on the shared shell", () => {
    const direction = read("src/app/direction/dashboard/DirectionDashboardClient.tsx");
    const admin = read("src/app/admin/dashboard/AdminDashboardClient.tsx");
    const employee = read("src/app/employe/dashboard/page.tsx");
    expect(direction).toContain("HororaAppShell");
    expect(direction).toContain('workspace="direction"');
    expect(admin).toContain("HororaAppShell");
    expect(admin).toContain('workspace="admin"');
    expect(employee).toContain("HororaAppShell");
    expect(employee).toContain('workspace="employe"');
    expect(direction).toContain("signOutToSwitchAccount");
    expect(admin).toContain("signOutToSwitchAccount");
    expect(employee).toContain("signOutToSwitchAccount");
  });

  it("keeps punch handlers while using the shared employee chrome", () => {
    const punch = read("src/app/employe/horodateur/page.tsx");
    expect(punch).toContain("HororaAppShell");
    expect(punch).toContain('title="TAGORA HORORA"');
    expect(punch).toContain("async function handlePunch");
    expect(punch).toContain("useEmployeeGpsReporting");
    expect(punch).toContain("PRIMARY_PUNCH_ACTIONS");
  });

  it("redesigns the Nexus denied page without changing deny reasons", () => {
    const denied = read("src/app/auth/nexus/denied/page.tsx");
    expect(denied).toContain("TimePublicShell");
    expect(denied).toContain("HororaStateBanner");
    expect(denied).toContain("membership_missing");
    expect(denied).toContain("cross_tenant");
    expect(denied).toContain("Aucun rôle employé n’est choisi par défaut");
    expect(denied).toContain("Retour à Nexus");
    expect(denied).toContain("resolveNexusDeniedReturnUrl");
  });

  it("preserves accountant report actions and GPS isolation", () => {
    const payroll = read(
      "src/app/direction/horodateur/rapport-comptable/DirectionPayrollAccountantReportClient.tsx"
    );
    expect(payroll).toContain("Émettre");
    expect(payroll).toContain("Enregistrer le brouillon");
    expect(payroll).toContain("horora-payroll-kpi-grid");
    expect(payroll).not.toContain("latitude");
    expect(payroll).not.toContain("longitude");
  });

  it("does not reintroduce a blue hero on the shared system layer", () => {
    const system = read("src/app/lib/brand/horora-system.css");
    for (const banned of LEGACY_HERO) {
      expect(system).not.toContain(banned);
    }
    expect(system).toContain("var(--module-action-bg)");
    expect(system).toContain("var(--tagora-success-fg)");
  });
});
