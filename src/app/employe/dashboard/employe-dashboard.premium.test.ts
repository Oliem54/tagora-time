import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("HORORA employee dashboard Premium 2027", () => {
  it("keeps the official lockup as the sole sidebar identity", () => {
    const shell = read("src/app/components/horora/HororaAppShell.tsx");
    const css = read("src/app/direction/horodateur/horora-direction-shell.css");
    expect(shell).toContain("HORORA_LIGHT_ASSET_PATH");
    expect(shell).toContain("logoIsSoleIdentity: true");
    expect(shell).not.toContain("horora-direction-sidebar-product");
    expect(css).toContain("--horora-size-sidebar-logo");
    expect(css).not.toContain("horora-direction-sidebar-product");
  });

  it("presents a welcome header, primary punch action and Accès grid", () => {
    const page = read("src/app/employe/dashboard/page.tsx");
    const welcome = read("src/app/components/horora/EmployeDashboardWelcome.tsx");
    const css = read("src/app/employe/dashboard/employe-dashboard.css");
    expect(page).toContain("EmployeDashboardWelcome");
    expect(page).toContain('title="Accès"');
    expect(page).not.toContain('title="Acces"');
    expect(page).toContain('label="Pointer"');
    expect(page).toContain('label="Ouvrir"');
    expect(page).toContain('label="Gérer"');
    expect(page).toContain("employe-dashboard-module-grid");
    expect(page).toContain('router.push("/employe/horodateur")');
    expect(page).toContain('router.push("/employe/terrain")');
    expect(page).toContain("signOutToSwitchAccount");
    expect(welcome).toContain("formatEmployeeWelcome");
    expect(welcome).toContain("Pointer");
    expect(css).toContain("repeat(3, minmax(0, 1fr))");
    expect(css).toContain("repeat(2, minmax(0, 1fr))");
  });

  it("does not change punch event types or invent employee data", () => {
    const card = read("src/app/components/horodateur/HorodateurEmployeeCard.tsx");
    const hook = read("src/app/hooks/useEmployeePunchSnapshot.ts");
    const status = read("src/app/lib/employee-punch-status.shared.ts");
    const welcome = read("src/app/components/horora/EmployeDashboardWelcome.tsx");
    expect(hook).toContain('eventType: "punch_out"');
    expect(hook).toContain('eventType: "punch_in"');
    expect(card).toContain('submitPunch("break_start")');
    expect(card).toContain('submitPunch("break_end")');
    expect(card).toContain('submitPunch("meal_start")');
    expect(card).toContain('submitPunch("meal_end")');
    expect(hook).toContain("/api/horodateur/punch");
    expect(status).toContain("Does not invent");
    expect(welcome).toContain("readSessionFullName");
    expect(welcome).not.toContain("user.email");
  });

  it("hides the Améliorations widget on the employee dashboard", () => {
    const fab = read("src/app/components/AuthenticatedImprovementsFab.tsx");
    expect(fab).toContain('pathname === "/employe/dashboard"');
    expect(fab).toContain("Améliorations");
    expect(fab).toContain("Accéder");
  });
});
