/**
 * PostgREST role for HORORA mapping tables.
 *
 * sb_secret keys are not JWTs. supabase-js still sets
 * Authorization: Bearer <sb_secret> before the custom fetch runs.
 * The gateway then fails the JWT parse and leaves the request on anon.
 * Anon has no grant on the mapping tables, so SELECT is permission denied
 * even though service_role itself is granted.
 *
 * Secret keys must travel on apikey only, with a non-browser User-Agent.
 * A browser User-Agent makes the gateway refuse to elevate the secret key.
 * Legacy service_role JWTs stay on Authorization: Bearer.
 *
 * Building these headers is not enough. The mapping client has to send them
 * through undici with a private dispatcher. The Next.js patched fetch can
 * still attach the inbound browser User-Agent after this function returns.
 */

export const HORORA_MAPPING_USER_AGENT = "horora-nexus-mapping" as const;

const BROWSER_USER_AGENT =
  /mozilla|applewebkit|chrome|safari|firefox|edg\/|opr\/|opera/i;

export function isBrowserUserAgent(value: string | null | undefined): boolean {
  return BROWSER_USER_AGENT.test(value ?? "");
}

export function isHororaServiceRoleJwt(key: string): boolean {
  return readUnverifiedJwtRole(key) === "service_role";
}

export function buildHororaServiceRoleHeaders(secretKey: string): Headers {
  const key = secretKey.trim();
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("apikey", key);
  headers.set("User-Agent", HORORA_MAPPING_USER_AGENT);
  headers.set("X-Client-Info", HORORA_MAPPING_USER_AGENT);

  if (key.startsWith("sb_secret_")) {
    return headers;
  }

  if (isHororaServiceRoleJwt(key)) {
    headers.set("Authorization", `Bearer ${key}`);
    return headers;
  }

  throw new Error("SUPABASE_SERVICE_ROLE_KEY cannot assume service_role");
}

/**
 * Local model of the Supabase gateway, used by tests.
 * It is not a network call.
 */
export function modeledPostgrestRole(
  headers: Headers
): "service_role" | "anon" | "rejected" {
  const apikey = headers.get("apikey") ?? "";
  const authorization = headers.get("Authorization") ?? "";
  const userAgent = headers.get("User-Agent");

  if (
    authorization.startsWith("Bearer sb_secret_") ||
    authorization.startsWith("Bearer sb_publishable_")
  ) {
    return "anon";
  }
  if (apikey.startsWith("sb_secret_") && isBrowserUserAgent(userAgent)) {
    return "rejected";
  }
  if (apikey.startsWith("sb_secret_") && authorization === "") {
    return "service_role";
  }
  if (authorization.startsWith("Bearer ")) {
    const role = readUnverifiedJwtRole(authorization.slice("Bearer ".length).trim());
    return role === "service_role" ? "service_role" : "anon";
  }
  return "anon";
}

function readUnverifiedJwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = JSON.parse(decodeBase64Url(parts[1])) as { role?: unknown };
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}
