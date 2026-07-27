import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");
const pageHeaderSource = readFileSync(
  join(root, "src/app/components/ui/PageHeader.tsx"),
  "utf8"
);
const badgeSource = readFileSync(
  join(root, "src/app/components/ui/UserIdentityBadge.tsx"),
  "utf8"
);

describe("authenticated header logo + account menu layering", () => {
  it("uses official logo assets from the shared PageHeader", () => {
    expect(pageHeaderSource).toContain('logoSrc = "/logo.png"');
    expect(pageHeaderSource).toContain('"/logo-header.png"');
    expect(pageHeaderSource).toContain("ui-page-header-logo-image");
    expect(pageHeaderSource).toContain('objectFit: "contain"');
  });

  it("does not paint a black plate behind the premium logo shell", () => {
    const premiumShellMatch = globalsCss.match(
      /\.ui-page-header-premium-2027\s+\.ui-page-header-logo-shell\s*\{[\s\S]*?\}/
    );
    expect(premiumShellMatch?.[0]).toBeTruthy();
    expect(premiumShellMatch?.[0]).toMatch(/background:\s*transparent/);
    expect(premiumShellMatch?.[0]).not.toMatch(/background:\s*#000000/);
  });

  it("lets the shared account menu escape the header without clipping", () => {
    expect(globalsCss).toMatch(
      /\.ui-page-header\s*\{[\s\S]*?overflow:\s*visible/
    );
    expect(globalsCss).toMatch(/\.tagora-header\s*\{[\s\S]*?overflow:\s*visible/);
    expect(globalsCss).toMatch(
      /\.ui-page-header-actions\s*\{[\s\S]*?overflow:\s*visible/
    );
  });

  it("keeps the account menu above following page content", () => {
    expect(globalsCss).toMatch(
      /\.ui-user-identity-menu\s*\{[\s\S]*?z-index:\s*50/
    );
    expect(globalsCss).toMatch(
      /\.ui-user-identity-shell\s*\{[\s\S]*?z-index:\s*40/
    );
    expect(globalsCss).toMatch(
      /\.ui-page-header-actions\s*\{[\s\S]*?z-index:\s*30/
    );
  });

  it("preserves the shared logout menu action for all authenticated roles", () => {
    expect(badgeSource).toContain('aria-label="Déconnexion"');
    expect(badgeSource).toContain("signOutToSwitchAccount");
    expect(badgeSource).toContain('role="menuitem"');
    expect(badgeSource).toContain("Sécurité du compte");
  });
});
