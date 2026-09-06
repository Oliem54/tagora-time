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
  HORORA_LEGACY_UI,
  HORORA_LIGHT_ASSET_PATH,
  HORORA_LIGHT_ASSET_SHA256,
  HORORA_LOGO_OBJECT_FIT,
  HORORA_RADIUS,
  HORORA_RUNTIME_FONT,
  HORORA_SHADOW,
  HORORA_SIZE,
  HORORA_SPACE,
  HORORA_SURFACE_ASSET,
  HORORA_TYPE_ROLE,
  contrastRatio,
  hororaAssetForSurface,
  hororaLogoAlt,
  hororaLogoAriaLabel,
  meetsWcagAaContrast,
} from "@/app/lib/brand/horora-premium-2027";

const root = process.cwd();

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

describe("HORORA Premium 2027 — official visual tokens", () => {
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

  it("uses TOS / registre values instead of invented canvases", () => {
    expect(HORORA_COLOR.tagoraBase).toBe("#182643");
    expect(HORORA_COLOR.shell).toBe("#1B2641");
    expect(HORORA_COLOR.shellDeep).toBe("#081029");
    expect(HORORA_COLOR.surfaceSoft).toBe("#F6F7ED");
    expect(HORORA_COLOR.surface).toBe("#FFFFFF");
    expect(HORORA_COLOR.text).toBe("#081029");
    expect(HORORA_COLOR.link).toBe("#1E488F");
    expect(HORORA_COLOR.accent).toBe("#1F79E0");
    expect(HORORA_COLOR.secondary).toBe("#4174BA");
    expect(HORORA_COLOR.action).toBe("#1A64BB");
    expect(HORORA_COLOR.actionOn).toBe("#FFFFFF");
    expect(HORORA_COLOR.focus).toBe("#154A8E");
    expect(HORORA_COLOR.accentSoft).toBe("#D6E4EB");
    expect(HORORA_COLOR.accentBorder).toBe("#95BEE7");
    expect(HORORA_COLOR.successFg).toBe("#067647");
    expect(HORORA_COLOR.warningFg).toBe("#B54708");
    expect(HORORA_COLOR.dangerFg).toBe("#B42318");
    expect(HORORA_COLOR.infoFg).toBe("#175CD3");
    expect(HORORA_COLOR.nexusAction).toBe("#008247");
    expect(HORORA_LEGACY_UI.inventedCanvas).toBe("#F6F7F9");
    expect(HORORA_COLOR.surfaceSoft).not.toBe(HORORA_LEGACY_UI.inventedCanvas);
    expect(HORORA_COLOR.shell).not.toBe(HORORA_LEGACY_UI.heroStart);
  });

  it("defines official sizes, radius, space and shadow", () => {
    expect(HORORA_SIZE.loginLogoMobilePx).toBe(128);
    expect(HORORA_SIZE.loginLogoTabletPx).toBe(144);
    expect(HORORA_SIZE.loginLogoDesktopPx).toBe(160);
    expect(HORORA_SIZE.touchTargetMinPx).toBe(44);
    expect(HORORA_SIZE.sidebarWidthPx).toBe(256);
    expect(HORORA_SIZE.sidebarCollapsedPx).toBe(72);
    expect(HORORA_SIZE.sidebarLogoPx).toBe(48);
    expect(HORORA_SIZE.topbarHeightPx).toBe(64);
    expect(HORORA_SIZE.contentMaxPx).toBe(1440);
    expect(HORORA_SIZE.rowMinPx).toBe(48);
    expect(HORORA_RADIUS.controlPx).toBe(8);
    expect(HORORA_RADIUS.cardPx).toBe(12);
    expect(HORORA_RADIUS.dialogPx).toBe(16);
    expect(HORORA_SPACE[4]).toBe(16);
    expect(HORORA_SPACE[5]).toBe(24);
    expect(HORORA_SHADOW.sm).toContain("8 16 41");
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
      meetsWcagAaContrast(HORORA_COLOR.text, HORORA_COLOR.surface)
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
    expect(css).toContain("--tagora-shell: #1b2641");
    expect(css).toContain("--tagora-surface-soft: #f6f7ed");
    expect(css).toContain("--module-accent: #1f79e0");
    expect(css).toContain("--module-action-bg: #1a64bb");
    expect(css).toContain("--horora-size-sidebar-width: 256px");
    expect(css).toContain("--horora-size-topbar-height: 64px");
    expect(css).toContain("--horora-radius-control: 8px");
    expect(css).not.toContain("@import");
  });
});
