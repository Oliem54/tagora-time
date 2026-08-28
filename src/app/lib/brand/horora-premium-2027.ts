/**
 * HORORA Premium 2027 — brand token authority.
 * Tokens describe visual roles. None grant a permission or role.
 */

export const HORORA_CANONICAL_PRODUCT_NAME = "TAGORA HORORA";
export const HORORA_ACCESSIBLE_PRODUCT_NAME = "HORORA par TAGORA";

export const HORORA_DARK_ASSET_PATH = "/brand/horora/horora.png";
export const HORORA_LIGHT_ASSET_PATH = "/brand/horora/horora-light.png";

export const HORORA_DARK_ASSET_SHA256 =
  "bf6c1b1457c390768da5c40898c7941a978744c7d523cf34a60e5f6e0321c100";
export const HORORA_LIGHT_ASSET_SHA256 =
  "38f2020860f8afbd52951293e9de0486d2c2ba6ab3152237d520d079a0d9961c";

export const HORORA_ASSET_CANVAS_PX = 1080;
export const HORORA_LOGO_OBJECT_FIT = "contain" as const;

export const HORORA_COLOR = {
  tagoraBase: "#182643",
  accent: "#1F79E0",
  secondary: "#4174BA",
  action: "#1A64BB",
  actionOn: "#FFFFFF",
  focus: "#154A8E",
  surfaceLight: "#FFFFFF",
} as const;

export const HORORA_LEGACY_COLOR = {
  base: "#1B2641",
  lightSurface: "#F6F7ED",
} as const;

export const HORORA_SURFACE_ASSET = {
  dark: HORORA_DARK_ASSET_PATH,
  light: HORORA_LIGHT_ASSET_PATH,
} as const;

export const HORORA_SIZE = {
  loginLogoMobilePx: 128,
  loginLogoTabletPx: 144,
  loginLogoDesktopPx: 160,
  headerLogoMobilePx: 48,
  headerLogoTabletPx: 56,
  headerLogoDesktopPx: 64,
  loginCardMaxWidthPx: 480,
  touchTargetMinPx: 44,
} as const;

export const HORORA_RADIUS = {
  controlPx: 8,
  cardPx: 12,
} as const;

export const HORORA_SPACE = {
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
} as const;

export const HORORA_SHADOW = {
  sm: "0 1px 2px rgb(24 38 67 / 0.08)",
  md: "0 8px 24px rgb(24 38 67 / 0.12)",
} as const;

export const HORORA_TYPE_ROLE = {
  body: "body",
  heading: "heading",
  label: "label",
  small: "small",
  code: "code",
} as const;

export const HORORA_RUNTIME_FONT = "Geist";
export const HORORA_DESIGN_BODY_FONT = "Avenir Next";
export const HORORA_DESIGN_HEADING_FONT = "JHC Notion";

export const HORORA_LOGO_A11Y = {
  accessibleName: HORORA_ACCESSIBLE_PRODUCT_NAME,
  decorativeAlt: "",
  uniqueAnnouncement: true,
  focusRing: HORORA_COLOR.focus,
} as const;

export function hororaAssetForSurface(surface: "dark" | "light"): string {
  return HORORA_SURFACE_ASSET[surface];
}

export function hororaLogoAlt(options: {
  nameAlreadyVisible: boolean;
}): string {
  return options.nameAlreadyVisible ? HORORA_LOGO_A11Y.decorativeAlt : HORORA_ACCESSIBLE_PRODUCT_NAME;
}

export function hororaLogoAriaLabel(options: {
  logoIsSoleIdentity: boolean;
}): string | undefined {
  return options.logoIsSoleIdentity ? HORORA_ACCESSIBLE_PRODUCT_NAME : undefined;
}

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    throw new Error("Invalid hex color");
  }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAaContrast(
  foreground: string,
  background: string,
  options?: { largeText?: boolean }
): boolean {
  const minimum = options?.largeText ? 3 : 4.5;
  return contrastRatio(foreground, background) >= minimum;
}
