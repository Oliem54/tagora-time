/**
 * HORORA Premium 2027 — brand token authority.
 *
 * Sources (read-only, not modified):
 * - TOS SHA 688e750a503192b4ba87898938227f6a8cc5ab08 (TAGORA_BASE)
 * - DEC-029 / ADR-0017 / VALD-108 standard + registre des thèmes
 * - Nexus commercial catalog (HORORA accent) certified on Staging
 *
 * Tokens describe visual roles. None grant a permission or role.
 * Do not invent a hex when an official value exists.
 * Font files are not embedded (FONT_INSTALLATION_AUTHORIZED=NO).
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

/** Official TOS / Nexus / HORORA colors. */
export const HORORA_COLOR = {
  tagoraBase: "#182643",
  shell: "#1B2641",
  shellDeep: "#081029",
  surface: "#FFFFFF",
  surfaceSoft: "#F6F7ED",
  text: "#081029",
  textInverse: "#FFFFFF",
  link: "#1E488F",
  lemon: "#DBDF5B",
  lime: "#BCC320",
  sea: "#00804C",
  moss: "#74C365",
  accent: "#1F79E0",
  accentHover: "#1A64BB",
  accentSoft: "#D6E4EB",
  accentBorder: "#95BEE7",
  onAccent: "#081029",
  action: "#1A64BB",
  actionOn: "#FFFFFF",
  focus: "#154A8E",
  chartPrimary: "#1F79E0",
  chartSecondary: "#4174BA",
  secondary: "#4174BA",
  successFg: "#067647",
  successBg: "#ECFDF3",
  successBorder: "#ABEFC6",
  warningFg: "#B54708",
  warningBg: "#FFFAEB",
  warningBorder: "#FEDF89",
  dangerFg: "#B42318",
  dangerBg: "#FEF3F2",
  dangerBorder: "#FECDCA",
  infoFg: "#175CD3",
  infoBg: "#EFF8FF",
  infoBorder: "#B2DDFF",
  nexusAction: "#008247",
} as const;

/** Retired UI blues — never use as current tokens. */
export const HORORA_LEGACY_UI = {
  heroStart: "#11335F",
  heroMid: "#173D73",
  navyButton: "#173868",
  oldTagoraBlue: "#1F4E79",
  inventedCanvas: "#F6F7F9",
} as const;

export const HORORA_SURFACE_ASSET = {
  dark: HORORA_DARK_ASSET_PATH,
  light: HORORA_LIGHT_ASSET_PATH,
} as const;

export const HORORA_SIZE = {
  loginLogoMobilePx: 128,
  loginLogoTabletPx: 144,
  loginLogoDesktopPx: 160,
  headerLogoMobilePx: 72,
  headerLogoTabletPx: 88,
  headerLogoDesktopPx: 120,
  loginCardMaxWidthPx: 480,
  touchTargetMinPx: 44,
  sidebarWidthPx: 256,
  sidebarCollapsedPx: 72,
  sidebarLogoPx: 144,
  topbarHeightPx: 64,
  contentMaxPx: 1440,
  rowMinPx: 48,
} as const;

export const HORORA_RADIUS = {
  controlPx: 8,
  cardPx: 12,
  dialogPx: 16,
  pillPx: 9999,
} as const;

export const HORORA_SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

export const HORORA_SHADOW = {
  sm: "0 1px 2px rgb(8 16 41 / 0.08)",
  md: "0 8px 24px rgb(8 16 41 / 0.12)",
  lg: "0 20px 48px rgb(8 16 41 / 0.16)",
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
