/**
 * HORORA serving-session contract after Nexus cutover.
 * Only a brokered session minted from a verified TAGORA_HANDOFF_V1
 * assertion is accepted. Legacy Supabase cookies are refused.
 */

import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

export const HORORA_SESSION_CONTRACT_VERSION = "HORORA_NEXUS_SESSION_V1" as const;
export const HORORA_SESSION_CONTRACT_PREFIX =
  `${HORORA_SESSION_CONTRACT_VERSION}.` as const;
/** Instant after which a non-Nexus HORORA cookie is invalid. */
export const HORORA_NEXUS_SESSION_CUTOVER_AT = "2026-09-08T11:00:00.000Z" as const;

export const LEGACY_HORORA_LOGIN_PATHS = [
  "/login",
  "/connexion",
  "/employe/login",
  "/direction/login",
] as const;

export type HororaSessionContractVersion = typeof HORORA_SESSION_CONTRACT_VERSION;

export type HororaBrokeredCookieParse =
  | {
      readonly ok: true;
      readonly format: "current";
      readonly contractVersion: HororaSessionContractVersion;
    }
  | {
      readonly ok: true;
      readonly format: "legacy_opaque";
      readonly contractVersion: null;
    }
  | {
      readonly ok: false;
      readonly reason: "cookie_missing" | "pre_cutover_cookie";
    };

export type HororaRequestAccessDecision =
  | { readonly action: "next" }
  | { readonly action: "redirect"; readonly location: typeof NEXUS_PUBLIC_LOGIN_URL };

export type SanitizedHororaSessionProvenance = {
  readonly source:
    | "nexus_handoff"
    | "legacy_supabase"
    | "pre_cutover_cookie"
    | "fixed_actor"
    | "none";
  readonly identity_class: "employe" | "direction" | "admin" | "unknown";
  readonly tenant_present: "yes" | "no";
  readonly issued_at: string | null;
  readonly contract_version: string | "absent";
  readonly validation: "accepted" | "refused";
  readonly reason: string;
};

function normalizePathname(pathname: string | null | undefined): string {
  const path = (pathname ?? "").split("?")[0]?.trim() ?? "";
  if (!path) return "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isLegacyHororaLoginPath(pathname: string | null | undefined): boolean {
  return (LEGACY_HORORA_LOGIN_PATHS as readonly string[]).includes(
    normalizePathname(pathname)
  );
}

export function isNexusHandoffPath(pathname: string | null | undefined): boolean {
  const path = normalizePathname(pathname);
  return path === "/auth/nexus" || path.startsWith("/auth/nexus/");
}

export function isHororaAppSessionRequiredPath(
  pathname: string | null | undefined
): boolean {
  const path = normalizePathname(pathname);
  if (isNexusHandoffPath(path)) return false;
  if (path.startsWith("/api/")) return false;
  if (isLegacyHororaLoginPath(path)) return false;
  return (
    path === "/employe" ||
    path.startsWith("/employe/") ||
    path === "/direction" ||
    path.startsWith("/direction/") ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/account" ||
    path.startsWith("/account/") ||
    path.startsWith("/auth/mfa")
  );
}

export function resolveHororaRequestAccess(input: {
  pathname: string;
  hasBrokeredSessionCookie: boolean;
}): HororaRequestAccessDecision {
  const pathname = normalizePathname(input.pathname);
  if (isNexusHandoffPath(pathname) || pathname.startsWith("/api/")) {
    return { action: "next" };
  }
  if (isLegacyHororaLoginPath(pathname)) {
    return { action: "redirect", location: NEXUS_PUBLIC_LOGIN_URL };
  }
  if (isHororaAppSessionRequiredPath(pathname) && !input.hasBrokeredSessionCookie) {
    return { action: "redirect", location: NEXUS_PUBLIC_LOGIN_URL };
  }
  return { action: "next" };
}

export function looksLikeSupabaseJwt(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const header = parts[0] ?? "";
  return header.startsWith("eyJ") || header.startsWith("eyj");
}

export function encodeBrokeredSessionCookieValue(opaqueToken: string): string {
  return `${HORORA_SESSION_CONTRACT_PREFIX}${opaqueToken}`;
}

export function parseBrokeredSessionCookieValue(
  raw: string | null | undefined
): HororaBrokeredCookieParse {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, reason: "cookie_missing" };
  if (looksLikeSupabaseJwt(value)) {
    return { ok: false, reason: "pre_cutover_cookie" };
  }
  if (value.startsWith(HORORA_SESSION_CONTRACT_PREFIX)) {
    const opaque = value.slice(HORORA_SESSION_CONTRACT_PREFIX.length);
    if (!opaque) return { ok: false, reason: "pre_cutover_cookie" };
    return {
      ok: true,
      format: "current",
      contractVersion: HORORA_SESSION_CONTRACT_VERSION,
    };
  }
  return { ok: true, format: "legacy_opaque", contractVersion: null };
}

export function storeMissReasonForParsedCookie(
  parsed: HororaBrokeredCookieParse
): "cookie_missing" | "pre_cutover_cookie" | "session_missing" {
  if (!parsed.ok) return parsed.reason;
  if (parsed.format === "legacy_opaque") return "pre_cutover_cookie";
  return "session_missing";
}

export function isIssuedBeforeSessionCutover(issuedAtIso: string | null | undefined): boolean {
  if (!issuedAtIso) return true;
  const issued = Date.parse(issuedAtIso);
  const cutover = Date.parse(HORORA_NEXUS_SESSION_CUTOVER_AT);
  if (!Number.isFinite(issued) || !Number.isFinite(cutover)) return true;
  return issued < cutover;
}

export function sanitizedHororaSessionProvenance(
  input: SanitizedHororaSessionProvenance
): SanitizedHororaSessionProvenance {
  return {
    source: input.source,
    identity_class: input.identity_class,
    tenant_present: input.tenant_present,
    issued_at: input.issued_at,
    contract_version: input.contract_version,
    validation: input.validation,
    reason: input.reason,
  };
}

export function logSanitizedHororaSessionProvenance(
  input: SanitizedHororaSessionProvenance,
  logger: (message: string, fields: Record<string, string>) => void = (message, fields) => {
    console.info(message, fields);
  }
): void {
  const fields = sanitizedHororaSessionProvenance(input);
  logger("[horora.session.provenance]", {
    source: fields.source,
    identity_class: fields.identity_class,
    tenant_present: fields.tenant_present,
    issued_at: fields.issued_at ?? "none",
    contract_version: fields.contract_version,
    validation: fields.validation,
    reason: fields.reason,
  });
}
