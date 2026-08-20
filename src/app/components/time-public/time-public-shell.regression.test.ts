import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

/** Textes interdits sur les routes actives du shell HORORA M2. */
const FORBIDDEN_ACTIVE_UI = [
  "TAGORA Time",
  "Tagora Time",
  "Contrôlez vos opérations",
  "Controlez vos operations",
  "Automatisez votre commerce",
  "Accédez à l'environnement TAGORA",
  "Accedez a l environnement TAGORA",
  "Demander une démo",
  "Demander une demo",
  "Étiquettes électroniques",
  "Etiquettes electroniques",
  'title="Cockpit"',
  'title="Portail"',
  "MarketingHomePage",
  'src="/logo.png"',
] as const;

const ACTIVE_ROUTE_FILES = [
  "src/app/page.tsx",
  "src/app/employe/login/page.tsx",
  "src/app/direction/login/page.tsx",
  "src/app/components/time-public/TimeEntryHub.tsx",
  "src/app/components/time-public/TimeLoginShell.tsx",
  "src/app/components/time-public/TimeLoginForm.tsx",
  "src/app/components/time-public/TimeBrand.tsx",
  "src/app/layout.tsx",
  "src/app/employe/login/layout.tsx",
  "src/app/direction/login/layout.tsx",
] as const;

describe("HORORA M2 public shell — active routes", () => {
  it("root utilise TimeEntryHub et métadonnées HORORA", () => {
    const page = readSrc("src/app/page.tsx");
    const layout = readSrc("src/app/layout.tsx");
    expect(page).toContain("TimeEntryHub");
    expect(page).not.toContain("MarketingHomePage");
    expect(page).toContain("TAGORA HORORA");
    expect(layout).toContain('default: "TAGORA HORORA"');
    expect(layout).toContain("%s | TAGORA HORORA");
  });

  it("hub expose HORORA, Employé et Direction", () => {
    const hub = readSrc("src/app/components/time-public/TimeEntryHub.tsx");
    expect(hub).toContain('href="/employe/login"');
    expect(hub).toContain('href="/direction/login"');
    expect(hub).toContain("Employé");
    expect(hub).toContain("Direction");
    expect(hub).toContain("gérer les opérations");
    expect(hub).not.toContain("TAGORA Time");
  });

  it("TimeBrand utilise les assets HORORA officiels (≥120, pas logo.png)", () => {
    const brand = readSrc("src/app/components/time-public/TimeBrand.tsx");
    expect(brand).toContain("/brand/horora/horora-light.png");
    expect(brand).toContain("/brand/horora/horora.png");
    expect(brand).toContain("TAGORA HORORA");
    expect(brand).not.toContain("/logo.png");
    expect(brand).toMatch(/desktop:\s*176/);
    expect(brand).toMatch(/mobile:\s*144/);
    expect(brand).toMatch(/desktop:\s*128/);
    expect(brand).toMatch(/mobile:\s*120/);
  });

  it("assets PNG HORORA existent dans public/brand/horora", () => {
    expect(existsSync(join(root, "public/brand/horora/horora.png"))).toBe(true);
    expect(existsSync(join(root, "public/brand/horora/horora-light.png"))).toBe(true);
  });

  it("tokens HORORA/TOS et bouton action dans le bloc time-public", () => {
    const css = readSrc("src/app/globals.css");
    const blockStart = css.indexOf("TAGORA HORORA — shell public");
    expect(blockStart).toBeGreaterThan(-1);
    const block = css.slice(blockStart);
    expect(block).toContain("--module-accent: #1f79e0");
    expect(block).toContain("--module-action-bg: #1a64bb");
    expect(block).toContain("--module-action-on: #ffffff");
    expect(block).toContain("--module-focus-ring: #154a8e");
    expect(block).toContain("--tagora-surface-soft: #f6f7ed");
    expect(block).toContain("background: var(--module-action-bg)");
    expect(block).toContain("color: var(--module-action-on)");
    expect(block).toContain("outline: 2px solid var(--module-focus-ring)");
  });

  it("logins préservent les handlers auth et le shell HORORA", () => {
    const employee = readSrc("src/app/employe/login/page.tsx");
    const direction = readSrc("src/app/direction/login/page.tsx");

    expect(employee).toContain("TimeLoginShell");
    expect(employee).toContain("signInWithPassword");
    expect(employee).toContain("writeBrowserSessionCookie");
    expect(employee).toContain("/api/account-requests/sync-activation");
    expect(employee).toContain('role !== "employe"');
    expect(employee).toContain("hasPasswordChangeRequired");
    expect(employee).toContain("TAGORA HORORA");
    expect(employee).not.toContain("ModuleTile");
    expect(employee).not.toContain("Portail");
    expect(employee).not.toContain("TAGORA Time");

    expect(direction).toContain("TimeLoginShell");
    expect(direction).toContain("signInWithPasswordWithTimeout");
    expect(direction).toContain("resolvePostLoginNavigationPath");
    expect(direction).toContain('role !== "direction" && role !== "admin"');
    expect(direction).toContain("TAGORA HORORA");
    expect(direction).not.toContain("ModuleTile");
    expect(direction).not.toContain("Cockpit");
    expect(direction).not.toContain("TAGORA Time");
  });

  it("diagnostic Direction est double-gated (dev + flag explicite)", () => {
    const direction = readSrc("src/app/direction/login/page.tsx");
    expect(direction).toContain('NEXT_PUBLIC_SHOW_LOGIN_DIAG === "1"');
    expect(direction).toContain("showLoginDiag");
    expect(direction).toContain("isDev && process.env.NEXT_PUBLIC_SHOW_LOGIN_DIAG");
    expect(direction).toContain('NODE_ENV === "development"');
  });

  it("n’embarque pas l’ancien faux site ni TAGORA Time sur les routes actives", () => {
    for (const file of ACTIVE_ROUTE_FILES) {
      const source = readSrc(file);
      for (const banned of FORBIDDEN_ACTIVE_UI) {
        expect(source, `${file} doit exclure « ${banned} »`).not.toContain(banned);
      }
    }
  });
});
