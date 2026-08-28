import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HORORA_ACCESSIBLE_PRODUCT_NAME,
  HORORA_ASSET_CANVAS_PX,
  HORORA_CANONICAL_PRODUCT_NAME,
  HORORA_COLOR,
  HORORA_DARK_ASSET_PATH,
  HORORA_DARK_ASSET_SHA256,
  HORORA_DESIGN_BODY_FONT,
  HORORA_DESIGN_HEADING_FONT,
  HORORA_LEGACY_COLOR,
  HORORA_LIGHT_ASSET_PATH,
  HORORA_LIGHT_ASSET_SHA256,
  HORORA_LOGO_OBJECT_FIT,
  HORORA_RADIUS,
  HORORA_RUNTIME_FONT,
  HORORA_SIZE,
  HORORA_SURFACE_ASSET,
  HORORA_TYPE_ROLE,
  contrastRatio,
  hororaAssetForSurface,
  hororaLogoAlt,
  hororaLogoAriaLabel,
  meetsWcagAaContrast,
} from "@/app/lib/brand/horora-premium-2027";

const root = process.cwd();

const FORBIDDEN_PHASE_1_FILES = [
  "src/app/components/AuthGate.tsx",
  "src/app/lib/auth/session-context.client.ts",
  "src/app/lib/auth/roles.ts",
  "src/app/lib/auth/permissions.ts",
  "src/app/lib/auth/mfa.client.ts",
  "src/app/lib/auth/session-cookie.ts",
  "src/app/employe/login/page.tsx",
  "src/app/direction/login/page.tsx",
] as const;

const SURFACE_FILES_UNCHANGED_BY_PHASE_1 = [
  "src/app/page.tsx",
  "src/app/components/time-public/TimeEntryHub.tsx",
  "src/app/components/time-public/TimePublicShell.tsx",
  "src/app/components/time-public/TimeBrand.tsx",
  "src/app/components/time-public/TimeLoginShell.tsx",
  "src/app/components/ui/PageHeader.tsx",
  "src/app/loading.tsx",
  "src/app/error.tsx",
  "src/app/layout.tsx",
] as const;

function readPngSize(relativePath: string): { width: number; height: number } {
  const buffer = readFileSync(join(root, relativePath));
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function sha256File(relativePath: string): string {
  return createHash("sha256").update(readFileSync(join(root, relativePath))).digest("hex");
}

describe("HORORA Premium 2027 — Phase 1 tokens and assets", () => {
  it("expose the official names and asset mapping", () => {
    expect(HORORA_CANONICAL_PRODUCT_NAME).toBe("TAGORA HORORA");
    expect(HORORA_ACCESSIBLE_PRODUCT_NAME).toBe("HORORA par TAGORA");
    expect(HORORA_DARK_ASSET_PATH).toBe("/brand/horora/horora.png");
    expect(HORORA_LIGHT_ASSET_PATH).toBe("/brand/horora/horora-light.png");
    expect(hororaAssetForSurface("dark")).toBe(HORORA_SURFACE_ASSET.dark);
    expect(hororaAssetForSurface("light")).toBe(HORORA_SURFACE_ASSET.light);
    expect(HORORA_LOGO_OBJECT_FIT).toBe("contain");
  });

  it("keeps official PNG hashes and 1080 canvas", () => {
    const darkRel = "public/brand/horora/horora.png";
    const lightRel = "public/brand/horora/horora-light.png";
    expect(existsSync(join(root, darkRel))).toBe(true);
    expect(existsSync(join(root, lightRel))).toBe(true);
    expect(sha256File(darkRel)).toBe(HORORA_DARK_ASSET_SHA256);
    expect(sha256File(lightRel)).toBe(HORORA_LIGHT_ASSET_SHA256);
    expect(readPngSize(darkRel)).toEqual({
      width: HORORA_ASSET_CANVAS_PX,
      height: HORORA_ASSET_CANVAS_PX,
    });
    expect(readPngSize(lightRel)).toEqual({
      width: HORORA_ASSET_CANVAS_PX,
      height: HORORA_ASSET_CANVAS_PX,
    });
  });

  it("defines official colors without treating legacy values as current", () => {
    expect(HORORA_COLOR.tagoraBase).toBe("#182643");
    expect(HORORA_COLOR.accent).toBe("#1F79E0");
    expect(HORORA_COLOR.secondary).toBe("#4174BA");
    expect(HORORA_COLOR.action).toBe("#1A64BB");
    expect(HORORA_COLOR.actionOn).toBe("#FFFFFF");
    expect(HORORA_COLOR.focus).toBe("#154A8E");
    expect(HORORA_COLOR.surfaceLight).toBe("#FFFFFF");
    expect(HORORA_COLOR.canvas).toBe("#F6F7F9");
    expect(HORORA_COLOR.canvasMuted).toBe("#EEF0F4");
    expect(HORORA_COLOR.sidebar).toBe("#F4F5F8");
    expect(HORORA_COLOR.neutralMuted).toBe("#5C6570");
    expect(HORORA_COLOR.neutralBorder).toBe("#E3E6EC");
    expect(HORORA_LEGACY_COLOR.base).toBe("#1B2641");
    expect(HORORA_LEGACY_COLOR.lightSurface).toBe("#F6F7ED");
    expect(HORORA_COLOR.tagoraBase).not.toBe(HORORA_LEGACY_COLOR.base);
  });

  it("defines foundation sizes, card width, touch target and radius", () => {
    expect(HORORA_SIZE.loginLogoMobilePx).toBe(128);
    expect(HORORA_SIZE.loginLogoTabletPx).toBe(144);
    expect(HORORA_SIZE.loginLogoDesktopPx).toBe(160);
    expect(HORORA_SIZE.headerLogoMobilePx).toBe(48);
    expect(HORORA_SIZE.headerLogoTabletPx).toBe(56);
    expect(HORORA_SIZE.headerLogoDesktopPx).toBe(64);
    expect(HORORA_SIZE.loginCardMaxWidthPx).toBe(480);
    expect(HORORA_SIZE.touchTargetMinPx).toBe(44);
    expect(HORORA_SIZE.sidebarWidthPx).toBe(232);
    expect(HORORA_SIZE.sidebarLogoPx).toBe(32);
    expect(HORORA_SIZE.topbarHeightPx).toBe(52);
    expect(HORORA_RADIUS.controlPx).toBe(8);
    expect(HORORA_RADIUS.cardPx).toBe(12);
  });

  it("keeps Geist as runtime font and does not import licensed families", () => {
    expect(HORORA_RUNTIME_FONT).toBe("Geist");
    expect(HORORA_DESIGN_BODY_FONT).toBe("Avenir Next");
    expect(HORORA_DESIGN_HEADING_FONT).toBe("JHC Notion");
    expect(HORORA_TYPE_ROLE.body).toBe("body");
    const authority = readFileSync(
      join(root, "src/app/lib/brand/horora-premium-2027.ts"),
      "utf8"
    );
    const css = readFileSync(
      join(root, "src/app/lib/brand/horora-premium-2027.css"),
      "utf8"
    );
    expect(authority).not.toMatch(/@font-face\s*\{/);
    expect(css).not.toMatch(/@font-face\s*\{/);
    expect(authority).not.toMatch(/Avenir Next Regular|JHCNotion|\.otf|\.woff2/);
    expect(css).not.toMatch(/Avenir|JHCNotion|\.otf|\.woff2/);
    const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("from \"next/font/google\"");
    expect(layout).toContain("Geist");
  });

  it("defines a unique accessible logo name without double announcement", () => {
    expect(hororaLogoAlt({ nameAlreadyVisible: true })).toBe("");
    expect(hororaLogoAlt({ nameAlreadyVisible: false })).toBe(
      HORORA_ACCESSIBLE_PRODUCT_NAME
    );
    expect(hororaLogoAriaLabel({ logoIsSoleIdentity: true })).toBe(
      HORORA_ACCESSIBLE_PRODUCT_NAME
    );
    expect(hororaLogoAriaLabel({ logoIsSoleIdentity: false })).toBeUndefined();
  });

  it("meets WCAG 2.2 AA for official action and body-on-light pairs", () => {
    expect(
      meetsWcagAaContrast(HORORA_COLOR.actionOn, HORORA_COLOR.action)
    ).toBe(true);
    expect(
      meetsWcagAaContrast(HORORA_COLOR.tagoraBase, HORORA_COLOR.surfaceLight)
    ).toBe(true);
    expect(contrastRatio(HORORA_COLOR.actionOn, HORORA_COLOR.action)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("keeps CSS variables aligned with the TypeScript authority", () => {
    const css = readFileSync(
      join(root, "src/app/lib/brand/horora-premium-2027.css"),
      "utf8"
    );
    expect(css).toContain("--horora-color-tagora-base: #182643");
    expect(css).toContain("--horora-color-accent: #1f79e0");
    expect(css).toContain("--horora-color-secondary: #4174ba");
    expect(css).toContain("--horora-color-action: #1a64bb");
    expect(css).toContain("--horora-color-action-on: #ffffff");
    expect(css).toContain("--horora-color-focus: #154a8e");
    expect(css).toContain("--horora-color-surface-light: #ffffff");
    expect(css).toContain("--horora-color-canvas: #f6f7f9");
    expect(css).toContain("--horora-color-sidebar: #f4f5f8");
    expect(css).toContain("--horora-color-neutral-muted: #5c6570");
    expect(css).toContain("--horora-color-neutral-border: #e3e6ec");
    expect(css).toContain("--horora-size-login-logo-mobile: 128px");
    expect(css).toContain("--horora-size-login-logo-tablet: 144px");
    expect(css).toContain("--horora-size-login-logo-desktop: 160px");
    expect(css).toContain("--horora-size-header-logo-mobile: 48px");
    expect(css).toContain("--horora-size-header-logo-tablet: 56px");
    expect(css).toContain("--horora-size-header-logo-desktop: 64px");
    expect(css).toContain("--horora-size-login-card-max: 480px");
    expect(css).toContain("--horora-size-touch-target-min: 44px");
    expect(css).toContain("--horora-size-sidebar-width: 232px");
    expect(css).toContain("--horora-size-sidebar-logo: 32px");
    expect(css).toContain("--horora-size-topbar-height: 52px");
    expect(css).toContain("--horora-logo-object-fit: contain");
    expect(css).not.toContain("@import");
  });

  it("does not wire tokens into Auth, login handlers or public Time surfaces", () => {
    const tokenImport = "horora-premium-2027";
    for (const relative of [...FORBIDDEN_PHASE_1_FILES, ...SURFACE_FILES_UNCHANGED_BY_PHASE_1]) {
      const source = readFileSync(join(root, relative), "utf8");
      expect(source).not.toContain(tokenImport);
    }
  });
});
