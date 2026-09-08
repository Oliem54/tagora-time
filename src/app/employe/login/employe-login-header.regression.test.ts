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
    const layout = readSrc(LAYOUT);
    const css = readSrc(CSS);
    const brand = readSrc(BRAND);
    expect(layout).toContain("employe-login.module.css");
    expect(css).toContain("justify-content: center");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain("max-width: 480px");
    expect(brand).toContain('"TAGORA HORORA — Accueil"');
    expect(brand).toContain('alt={showWordmark ? "TAGORA HORORA" : ""}');
    expect(brand).toContain('showWordmark ? "TAGORA HORORA — Accueil" : "TAGORA HORORA"');
    expect(existsSync(join(root, "public/brand/horora/horora.png"))).toBe(true);
  });

  it("redirige la connexion employé vers Nexus sans mot de passe local", () => {
    const page = readSrc(PAGE);
    expect(page).toContain("NEXUS_PUBLIC_LOGIN_URL");
    expect(page).toContain("redirect");
    expect(page).not.toContain("signInWithPassword");
    expect(page).not.toContain("writeBrowserSessionCookie");
    expect(page).not.toContain("TimeLoginForm");
  });
});
