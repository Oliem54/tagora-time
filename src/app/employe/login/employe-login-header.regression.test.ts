import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const PAGE = "src/app/employe/login/page.tsx";
const LAYOUT = "src/app/employe/login/layout.tsx";
const CSS = "src/app/employe/login/employe-login.module.css";
const BRAND = "src/app/components/time-public/TimeBrand.tsx";

describe("HORORA employee login header — visual only", () => {
  it("centre horora.png et retire les textes adjacents visibles", () => {
    const page = readSrc(PAGE);
    const layout = readSrc(LAYOUT);
    const css = readSrc(CSS);
    const brand = readSrc(BRAND);
    expect(page).toContain("showWordmark={false}");
    expect(page).toContain('logoSrc="/brand/horora/horora.png"');
    expect(page).not.toContain("Pointage et heures");
    expect(layout).toContain("employe-login.module.css");
    expect(css).toContain("justify-content: center");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain("max-width: 480px");
    expect(brand).toContain('"TAGORA HORORA — Accueil"');
    expect(brand).toContain('alt={showWordmark ? "TAGORA HORORA" : ""}');
    expect(brand).toContain('showWordmark ? "TAGORA HORORA — Accueil" : "TAGORA HORORA"');
    expect(existsSync(join(root, "public/brand/horora/horora.png"))).toBe(true);
  });

  it("préserve Auth, badge, titre, champs et CTA", () => {
    const page = readSrc(PAGE);
    expect(page).toContain("signInWithPassword");
    expect(page).toContain("writeBrowserSessionCookie");
    expect(page).toContain('roleLabel="Employé"');
    expect(page).toContain('title="Connexion employé"');
    expect(page).toContain("TimeLoginForm");
    expect(page).toContain("TimeRoleSwitchLink");
    expect(page).not.toContain("globals.css");
    expect(page).not.toContain("TAGORA Nexus");
  });
});
