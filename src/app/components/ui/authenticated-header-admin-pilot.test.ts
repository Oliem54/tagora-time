import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pageHeaderSource = readFileSync(
  join(root, "src/app/components/ui/PageHeader.tsx"),
  "utf8"
);
const authHeaderSource = readFileSync(
  join(root, "src/app/components/ui/AuthenticatedPageHeader.tsx"),
  "utf8"
);
const dashboardSource = readFileSync(
  join(root, "src/app/admin/dashboard/AdminDashboardClient.tsx"),
  "utf8"
);
const commissionsSource = readFileSync(
  join(root, "src/app/admin/commissions/AdminCommissionsPageClient.tsx"),
  "utf8"
);
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");
const badgeSource = readFileSync(
  join(root, "src/app/components/ui/UserIdentityBadge.tsx"),
  "utf8"
);

describe("authenticated header admin pilot contract", () => {
  it("exposes compact and module variants on the shared PageHeader contract", () => {
    expect(pageHeaderSource).toContain('PageHeaderVariant = "default" | "compact" | "module"');
    expect(pageHeaderSource).toContain('data-header-variant={variant}');
    expect(pageHeaderSource).toContain("ui-page-header-variant-compact");
    expect(pageHeaderSource).toContain("ui-page-header-variant-module");
    expect(authHeaderSource).toContain("variant?: PageHeaderVariant");
  });

  it("keeps both admin pilots on AuthenticatedPageHeader with shared premium logo asset", () => {
    expect(dashboardSource).toContain('variant="compact"');
    expect(dashboardSource).toContain("AuthenticatedPageHeader");
    expect(commissionsSource).toContain('variant="module"');
    expect(commissionsSource).toContain("AuthenticatedPageHeader");
    expect(pageHeaderSource).toContain('"/logo-header.png"');
  });

  it("preserves compact dashboard logout button and module commissions chrome", () => {
    expect(dashboardSource).toContain("Se déconnecter");
    expect(commissionsSource).toContain('eyebrow="Administration · Finance"');
    expect(commissionsSource).toContain(
      'subtitle="Pilotage finance : montants, regles, validation et paiement."'
    );
    expect(commissionsSource).toContain("AdminCommissionsNavigation");
    expect(commissionsSource).toContain('variant="commissions"');
  });

  it("keeps shared account menu logout and non-clipping layers", () => {
    expect(badgeSource).toContain('aria-label="Déconnexion"');
    expect(badgeSource).toContain("signOutToSwitchAccount");
    expect(globalsCss).toMatch(/\.ui-page-header-variant-compact[\s\S]*?overflow:\s*visible/);
    expect(globalsCss).toMatch(/\.ui-page-header-variant-module[\s\S]*?overflow:\s*visible/);
    expect(globalsCss).toMatch(
      /\.ui-page-header-variant-compact \.ui-page-header-actions[\s\S]*?z-index:\s*30/
    );
  });

  it("does not introduce AuthGate or H4 session-context dependencies in the pilot headers", () => {
    expect(pageHeaderSource).not.toContain("AuthGate");
    expect(pageHeaderSource).not.toContain("session-context");
    expect(authHeaderSource).not.toContain("AuthGate");
    expect(authHeaderSource).not.toContain("session-context");
    expect(dashboardSource).not.toContain("AuthGate");
    expect(commissionsSource).not.toContain("AuthGate");
  });
});
