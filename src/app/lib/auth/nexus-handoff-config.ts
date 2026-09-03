/**
 * TAGORA_HANDOFF_V1 server configuration. No NEXT_PUBLIC_ secrets.
 * Audience and module key are frozen; issuer and JWKS come from env only.
 */

export const NEXUS_HANDOFF_VERSION = "TAGORA_HANDOFF_V1" as const;
export const NEXUS_HANDOFF_ALGORITHM = "ES256" as const;
export const NEXUS_HANDOFF_AUDIENCE = "tagora:time" as const;
export const NEXUS_TECHNICAL_MODULE_KEY = "tagora_time" as const;
export const HORORA_LOCAL_MODULE_KEY = "time" as const;
export const NEXUS_BROKERED_SESSION_COOKIE_NAME = "horora_nx_session" as const;
export const NEXUS_ALLOWED_ENTRY_ROLES = [
  "NEXUS_ENTRY_MEMBER",
  "NEXUS_ENTRY_OPERATOR",
] as const;
export type NexusAllowedEntryRole = (typeof NEXUS_ALLOWED_ENTRY_ROLES)[number];
export const FORBIDDEN_NEXUS_AUTHORITY_CLAIMS = [
  "module_business_role",
  "module_business_permission",
  "stock_permission",
  "mail_permission",
  "time_permission",
  "pulse_permission",
  "business_admin_authority",
  "super_admin",
  "price",
  "billing_authority",
] as const;
export const NEXUS_HANDOFF_MAX_TTL_SECONDS = 120;
export const NEXUS_HANDOFF_CLOCK_SKEW_SECONDS = 30;
export const NEXUS_RETURN_PATH = "/modules" as const;
export const NEXUS_STAGING_PORTAL_MODULES_URL =
  "https://tagora-nexus-staging.vercel.app/modules" as const;
export const NEXUS_CALLBACK_FAIL_CLOSED_PATH = "/auth/nexus/denied" as const;
export const NEXUS_PASSWORD_LOGIN_PATHS = [
  "/employe/login",
  "/direction/login",
  "/login",
] as const;

export function isNexusPasswordLoginPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").split("?")[0]?.trim() ?? "";
  return (NEXUS_PASSWORD_LOGIN_PATHS as readonly string[]).includes(path);
}

export type NexusCallbackPublicDenyReason =
  | "membership_missing"
  | "membership_ambiguous"
  | "role_mapping_denied"
  | "handoff_expired"
  | "replay"
  | "cross_tenant"
  | "handoff_missing"
  | "handoff_refused"
  | "mapping_unavailable";

export function publicNexusCallbackDenyReason(
  reason: string | null | undefined
): NexusCallbackPublicDenyReason {
  switch (reason) {
    case "membership_absent":
    case "membership_missing":
      return "membership_missing";
    case "membership_ambiguous":
      return "membership_ambiguous";
    case "membership_role_invalid":
    case "role_mapping_denied":
      return "role_mapping_denied";
    case "expired_token":
    case "handoff_expired":
    case "ttl_exceeded":
      return "handoff_expired";
    case "replay":
      return "replay";
    case "cross_tenant":
      return "cross_tenant";
    case "missing_token":
    case "missing_claim":
    case "invalid_token":
    case "handoff_missing":
      return "handoff_missing";
    case "handoff_refused":
      return "handoff_refused";
    case "mapping_unavailable":
      return "mapping_unavailable";
    default:
      return "handoff_refused";
  }
}
export const DEFAULT_HORORA_NEXUS_ORGANIZATION_ID = "org_tagora_internal" as const;

export const NEXUS_HANDOFF_ENV_KEYS = {
  jwksUrl: "NEXUS_HANDOFF_JWKS_URL",
  issuer: "NEXUS_HANDOFF_ISSUER",
  audience: "NEXUS_HANDOFF_AUDIENCE",
  moduleKey: "NEXUS_HANDOFF_EXPECTED_MODULE_KEY",
  portalReturnUrl: "NEXUS_PORTAL_RETURN_URL",
  sessionMintEnabled: "NEXUS_HORORA_SESSION_MINT_ENABLED",
  publicAppUrl: "NEXT_PUBLIC_APP_URL",
} as const;

export const HORORA_NEXUS_MAPPING_ENV_KEYS = {
  nexusActorId: "HORORA_NEXUS_ACTOR_ID",
  authUserId: "HORORA_AUTH_USER_ID",
  nexusOrganizationId: "HORORA_NEXUS_ORGANIZATION_ID",
  organizationId: "HORORA_ORGANIZATION_ID",
  employeeNexusActorId: "HORORA_NEXUS_EMPLOYEE_ACTOR_ID",
  employeeAuthUserId: "HORORA_EMPLOYEE_AUTH_USER_ID",
} as const;

export type NexusHandoffEnvSource = Readonly<Record<string, string | undefined>>;

export type NexusHandoffConfig = {
  readonly issuer: string;
  readonly audience: typeof NEXUS_HANDOFF_AUDIENCE;
  readonly jwksUrl: string;
  readonly expectedModuleKey: typeof NEXUS_TECHNICAL_MODULE_KEY;
  readonly clockToleranceSeconds: typeof NEXUS_HANDOFF_CLOCK_SKEW_SECONDS;
  readonly maxTtlSeconds: typeof NEXUS_HANDOFF_MAX_TTL_SECONDS;
};

export type NexusHandoffConfigResult =
  | { readonly ok: true; readonly config: NexusHandoffConfig }
  | { readonly ok: false; readonly reason: "missing_configuration" | "invalid_configuration" };

export type NexusReturnDenyReason =
  | "missing_configuration"
  | "invalid_configuration"
  | "open_redirect";

export type NexusReturnResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: NexusReturnDenyReason };

function readRaw(env: NexusHandoffEnvSource, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" ? value : undefined;
}

function isStrictHttpsAbsoluteUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username !== "" || parsed.password !== "") return false;
  if (parsed.hash !== "") return false;
  return Boolean(parsed.hostname);
}

export function readNexusHandoffConfig(
  env: NexusHandoffEnvSource = process.env
): NexusHandoffConfigResult {
  if (!env || typeof env !== "object") {
    return { ok: false, reason: "invalid_configuration" };
  }

  const issuer = readRaw(env, NEXUS_HANDOFF_ENV_KEYS.issuer)?.trim() ?? "";
  const jwksUrl = readRaw(env, NEXUS_HANDOFF_ENV_KEYS.jwksUrl)?.trim() ?? "";
  const audience = readRaw(env, NEXUS_HANDOFF_ENV_KEYS.audience)?.trim() ?? "";
  const moduleKey = readRaw(env, NEXUS_HANDOFF_ENV_KEYS.moduleKey)?.trim() ?? "";

  if (!issuer || !jwksUrl || !audience || !moduleKey) {
    return { ok: false, reason: "missing_configuration" };
  }
  if (!isStrictHttpsAbsoluteUrl(issuer) || !isStrictHttpsAbsoluteUrl(jwksUrl)) {
    return { ok: false, reason: "invalid_configuration" };
  }
  if (audience !== NEXUS_HANDOFF_AUDIENCE) {
    return { ok: false, reason: "invalid_configuration" };
  }
  if (moduleKey !== NEXUS_TECHNICAL_MODULE_KEY) {
    return { ok: false, reason: "invalid_configuration" };
  }

  return {
    ok: true,
    config: Object.freeze({
      issuer,
      audience: NEXUS_HANDOFF_AUDIENCE,
      jwksUrl,
      expectedModuleKey: NEXUS_TECHNICAL_MODULE_KEY,
      clockToleranceSeconds: NEXUS_HANDOFF_CLOCK_SKEW_SECONDS,
      maxTtlSeconds: NEXUS_HANDOFF_MAX_TTL_SECONDS,
    }),
  };
}

export function isNexusHororaSessionMintEnabled(
  env: NexusHandoffEnvSource = process.env
): boolean {
  const raw = readRaw(env, NEXUS_HANDOFF_ENV_KEYS.sessionMintEnabled);
  return raw?.trim().toLowerCase() === "true";
}

function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export function resolveNexusPortalReturnUrl(
  env: NexusHandoffEnvSource = process.env
): NexusReturnResult {
  const raw = env[NEXUS_HANDOFF_ENV_KEYS.portalReturnUrl];
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "missing_configuration" };
  }

  const trimmed = raw.trim();
  if (
    trimmed.startsWith("//") ||
    /^javascript:/i.test(trimmed) ||
    /^data:/i.test(trimmed) ||
    /^vbscript:/i.test(trimmed)
  ) {
    return { ok: false, reason: "open_redirect" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid_configuration" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "invalid_configuration" };
  }
  if (parsed.hash) {
    return { ok: false, reason: "invalid_configuration" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "invalid_configuration" };
  }
  if (!parsed.hostname) {
    return { ok: false, reason: "invalid_configuration" };
  }

  const pathname = decodePathname(parsed.pathname).replace(/\/+$/, "") || "/";
  if (pathname.includes("//") || pathname !== NEXUS_RETURN_PATH) {
    return { ok: false, reason: "invalid_configuration" };
  }

  parsed.pathname = NEXUS_RETURN_PATH;
  parsed.hash = "";
  return { ok: true, url: parsed.toString() };
}

export function resolveNexusDeniedReturnUrl(
  env: NexusHandoffEnvSource = process.env
): string {
  const portal = resolveNexusPortalReturnUrl(env);
  if (portal.ok) return portal.url;
  return NEXUS_STAGING_PORTAL_MODULES_URL;
}
