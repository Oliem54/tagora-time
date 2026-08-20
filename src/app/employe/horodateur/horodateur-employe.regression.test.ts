import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const PAGE = "src/app/employe/horodateur/page.tsx";
const LAYOUT = "src/app/employe/horodateur/layout.tsx";
const QR = "src/app/employe/horodateur/qr/EmployeHorodateurQrClient.tsx";
const CSS = "src/app/employe/horodateur/horodateur-employe.module.css";

describe("HORORA M3 Horodateur Employé — visual pilot", () => {
  it("affiche TAGORA HORORA et le logo local", () => {
    const page = readSrc(PAGE);
    const layout = readSrc(LAYOUT);
    const qr = readSrc(QR);
    expect(page).toContain('title="TAGORA HORORA"');
    expect(page).toContain('subtitle="Horodateur employé"');
    expect(page).toContain('logoSrc="/brand/horora/horora.png"');
    expect(page).toContain('logoAlt=""');
    expect(layout).toContain("TAGORA HORORA");
    expect(qr).toContain('title="TAGORA HORORA"');
    expect(qr).toContain('logoSrc="/brand/horora/horora.png"');
    expect(existsSync(join(root, "public/brand/horora/horora.png"))).toBe(true);
  });

  it("retire TAGORA Time des surfaces QR visibles ciblées", () => {
    const qr = readSrc(QR);
    expect(qr).not.toContain("TAGORA Time");
    expect(qr).not.toContain("Tagora Time");
    expect(qr).toContain("session TAGORA HORORA");
  });

  it("scope les tokens HORORA officiels hors globals.css", () => {
    const css = readSrc(CSS);
    const layout = readSrc(LAYOUT);
    const page = readSrc(PAGE);
    const qr = readSrc(QR);
    expect(css).toContain("--heh-accent: #1f79e0");
    expect(css).toContain("--heh-secondary: #4174ba");
    expect(css).toContain("--heh-action: #1a64bb");
    expect(css).toContain("--heh-action-on: #ffffff");
    expect(css).toContain("--heh-focus: #154a8e");
    expect(css).toContain("--heh-shell: #1b2641");
    expect(css).toContain("--heh-deep: #081029");
    expect(css).toContain("--heh-surface: #ffffff");
    expect(css).toContain("--heh-soft: #f6f7ed");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("outline: 2px solid var(--heh-focus)");
    expect(css).toContain("object-fit: contain");
    expect(layout).toContain("horodateur-employe.module.css");
    expect(page).not.toContain("globals.css");
    expect(qr).not.toContain("globals.css");
    expect(layout).not.toContain("globals.css");
  });

  it("préserve les handlers punch/GPS/QR et n’ajoute pas Login/Nexus", () => {
    const page = readSrc(PAGE);
    const qr = readSrc(QR);
    expect(page).toContain("const loadData = useCallback");
    expect(page).toContain("const refreshDataIfStale = useCallback");
    expect(page).toContain("async function handleRetryPunchLocation");
    expect(page).toContain("async function handlePunch");
    expect(page).toContain("async function handleLatePunchNow");
    expect(page).toContain("async function handlePrimaryPunch");
    expect(page).toContain("async function handleCorrectionSubmit");
    expect(page).toContain("useEmployeeGpsReporting");
    expect(page).toContain("PRIMARY_PUNCH_ACTIONS");
    expect(page).toContain("SECONDARY_PUNCH_ACTIONS");
    expect(qr).toContain("async function postPunch");
    expect(qr).toContain("const loadPublic = useCallback");
    expect(qr).toContain("const loadContext = useCallback");
    expect(page).not.toContain("TAGORA Nexus");
    expect(qr).not.toContain("TAGORA Nexus");
    expect(page).not.toContain("time-public");
    expect(qr).not.toContain("time-public");
    expect(page).toContain('router.push("/employe/login")');
    expect(qr).toContain('router.push("/employe/login")');
  });
});
