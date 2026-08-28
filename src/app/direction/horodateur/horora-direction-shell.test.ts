import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("HORORA Premium 2027 direction shell structure", () => {
  it("replaces the hero header with a compact sidebar and topbar", () => {
    const shell = read(
      "src/app/direction/horodateur/HorodateurDirectionPageShell.tsx"
    );
    expect(shell).toContain("horora-direction-sidebar");
    expect(shell).toContain("horora-direction-topbar");
    expect(shell).toContain("Fil d'Ariane");
    expect(shell).toContain("horora-direction-workspace");
    expect(shell).not.toContain("AuthenticatedPageHeader");
    expect(shell).not.toContain("tagora-app-shell");
    expect(shell).not.toContain("ui-page-header-premium-2027");
    expect(shell).not.toContain("Horodateur direction");
  });

  it("keeps module destinations in a vertical sidebar", () => {
    const nav = read(
      "src/app/direction/horodateur/HorodateurDirectionModuleNav.tsx"
    );
    expect(nav).toContain('variant = "sidebar"');
    expect(nav).toContain("Horodateur live");
    expect(nav).toContain("Registre");
    expect(nav).toContain("Quarts passés");
    expect(nav).toContain("Rapport comptable");
    expect(nav).toContain("Tableau de bord");
  });

  it("rebuilds payroll filters, KPIs, table and action hierarchy", () => {
    const client = read(
      "src/app/direction/horodateur/rapport-comptable/DirectionPayrollAccountantReportClient.tsx"
    );
    expect(client).toContain("horora-payroll-filterbar");
    expect(client).toContain("horora-payroll-kpi-grid");
    expect(client).toContain("horora-payroll-kpi-label");
    expect(client).toContain("horora-payroll-kpi-value");
    expect(client).toContain("horora-payroll-table");
    expect(client).toContain("horora-btn-primary");
    expect(client).toContain("Émettre");
    expect(client).toContain("Enregistrer le brouillon");
    expect(client).toContain("Régulier");
    expect(client).toContain("Incomplet");
    expect(client).toContain("formatPayrollTimeFrCa");
    expect(client).not.toContain("tagora-field");
    expect(client).not.toContain("ui-button-primary");
    expect(client).not.toContain("Employés{");
  });

  it("uses Premium 2027 canvas tokens instead of a dark TAGORA shell", () => {
    const css = read(
      "src/app/direction/horodateur/horora-direction-shell.css"
    );
    expect(css).toContain("--horora-color-canvas");
    expect(css).toContain("--horora-size-sidebar-width");
    expect(css).toContain("horora-payroll-filterbar");
    expect(css).toContain("horora-payroll-kpi");
    expect(css).not.toContain("linear-gradient(135deg");
    expect(css).not.toContain("#11335f");
  });
});
