/**
 * CSRF origin check for the Nexus callback form POST.
 * Compare the browser Origin to trusted external origins, never to an
 * internal Vercel deployment hostname that Next.js may put in request.url.
 *
 * Origin: null / missing is allowed only for a browser same-origin
 * navigational POST whose Host matches a trusted public origin.
 */

export const NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV = "NEXT_PUBLIC_APP_URL" as const;

export type NexusCallbackOriginEnv = Readonly<Record<string, string | undefined>>;

export type NexusCallbackOriginDenyReason =
  | "origin_header_missing"
  | "origin_header_null"
  | "origin_header_unparseable"
  | "origin_not_trusted"
  | "sec_fetch_site_not_same_origin";

export type NexusCallbackOriginDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly failed_origin_check: NexusCallbackOriginDenyReason };

export type NexusCallbackOriginLogFields = {
  readonly origin_host: string;
  readonly request_url_host: string;
  readonly host_header: string;
  readonly x_forwarded_host: string;
  readonly x_forwarded_proto: string;
  readonly callback_path: string;
  readonly referer_host: string;
  readonly referer_path: string;
  readonly sec_fetch_site: string;
  readonly sec_fetch_mode: string;
  readonly sec_fetch_dest: string;
};

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function firstHeader(request: Request, name: string): string {
  return (request.headers.get(name) ?? "").split(",")[0]?.trim() ?? "";
}

export function parseTrustedWebOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.hash !== "") return null;
  if (parsed.protocol === "https:") return parsed.origin;
  if (parsed.protocol === "http:" && LOCAL_HTTP_HOSTS.has(parsed.hostname)) {
    return parsed.origin;
  }
  return null;
}

function originFromProtocolAndHost(protocol: string, host: string): string | null {
  const proto = protocol.trim().toLowerCase();
  if (proto !== "https" && proto !== "http") return null;
  if (!host || /[\s/@\\?#]/.test(host)) return null;
  return parseTrustedWebOrigin(`${proto}://${host}`);
}

function requestUrlOrigin(request: Request): string | null {
  try {
    return parseTrustedWebOrigin(new URL(request.url).origin);
  } catch {
    return null;
  }
}

function forwardedProtocol(request: Request): string {
  const proto = firstHeader(request, "x-forwarded-proto").toLowerCase();
  if (proto === "https" || proto === "http") return proto;
  try {
    const scheme = new URL(request.url).protocol;
    if (scheme === "https:") return "https";
    if (scheme === "http:") return "http";
  } catch {
    // ignore
  }
  return "";
}

function refererHostAndPath(request: Request): { referer_host: string; referer_path: string } {
  const raw = firstHeader(request, "referer") || firstHeader(request, "referrer");
  if (!raw) return { referer_host: "", referer_path: "" };
  try {
    const url = new URL(raw);
    return { referer_host: url.hostname, referer_path: url.pathname };
  } catch {
    return { referer_host: "", referer_path: "" };
  }
}

/**
 * Static `process.env.NEXT_PUBLIC_APP_URL` so Next.js keeps the inlined
 * public origin. Dynamic `env[name]` can miss it on the Vercel server bundle.
 */
function readConfiguredPublicOrigin(env: NexusCallbackOriginEnv): string | null {
  const fromRecord = env[NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV];
  if (typeof fromRecord === "string") {
    const parsed = parseTrustedWebOrigin(fromRecord);
    if (parsed) return parsed;
  }
  if (env === process.env) {
    const inlined = process.env.NEXT_PUBLIC_APP_URL;
    if (typeof inlined === "string") {
      return parseTrustedWebOrigin(inlined);
    }
  }
  return null;
}

export function nexusCallbackOriginLogFields(request: Request): NexusCallbackOriginLogFields {
  let requestUrlHost = "";
  let callbackPath = "/auth/nexus/callback";
  try {
    const url = new URL(request.url);
    requestUrlHost = url.hostname;
    callbackPath = url.pathname || callbackPath;
  } catch {
    requestUrlHost = "";
  }
  const origin = parseTrustedWebOrigin(request.headers.get("origin") ?? "");
  const referer = refererHostAndPath(request);
  return {
    origin_host: origin ? new URL(origin).hostname : "",
    request_url_host: requestUrlHost,
    host_header: firstHeader(request, "host"),
    x_forwarded_host: firstHeader(request, "x-forwarded-host"),
    x_forwarded_proto: firstHeader(request, "x-forwarded-proto"),
    callback_path: callbackPath,
    referer_host: referer.referer_host,
    referer_path: referer.referer_path,
    sec_fetch_site: (request.headers.get("sec-fetch-site") ?? "").toLowerCase(),
    sec_fetch_mode: (request.headers.get("sec-fetch-mode") ?? "").toLowerCase(),
    sec_fetch_dest: (request.headers.get("sec-fetch-dest") ?? "").toLowerCase(),
  };
}

export function resolveTrustedNexusCallbackOrigins(
  request: Request,
  env: NexusCallbackOriginEnv = process.env
): ReadonlySet<string> {
  const trusted = new Set<string>();
  const fromRequestUrl = requestUrlOrigin(request);
  if (fromRequestUrl) trusted.add(fromRequestUrl);

  const proto = forwardedProtocol(request);
  const forwarded = originFromProtocolAndHost(proto, firstHeader(request, "x-forwarded-host"));
  if (forwarded) trusted.add(forwarded);

  const fromHost = originFromProtocolAndHost(proto, firstHeader(request, "host"));
  if (fromHost) trusted.add(fromHost);

  const publicOrigin = readConfiguredPublicOrigin(env);
  if (publicOrigin) trusted.add(publicOrigin);

  return trusted;
}

export function resolveCanonicalNexusCallbackOrigin(
  request: Request,
  env: NexusCallbackOriginEnv = process.env
): string | null {
  const configured = readConfiguredPublicOrigin(env);
  if (configured) return configured;
  const proto = forwardedProtocol(request);
  const forwarded = originFromProtocolAndHost(proto, firstHeader(request, "x-forwarded-host"));
  if (forwarded) return forwarded;
  const fromHost = originFromProtocolAndHost(proto, firstHeader(request, "host"));
  if (fromHost) return fromHost;
  return requestUrlOrigin(request);
}

function isBrowserSameOriginNavigationalPost(request: Request): boolean {
  const site = (request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  if (site !== "same-origin") return false;
  const mode = (request.headers.get("sec-fetch-mode") ?? "").toLowerCase();
  if (mode && mode !== "navigate") return false;
  const dest = (request.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  if (dest && dest !== "document") return false;
  return true;
}

function requestPostedToTrustedOrigin(
  request: Request,
  env: NexusCallbackOriginEnv
): boolean {
  const trusted = resolveTrustedNexusCallbackOrigins(request, env);
  const proto = forwardedProtocol(request);
  const postedOrigin =
    originFromProtocolAndHost(proto, firstHeader(request, "x-forwarded-host")) ??
    originFromProtocolAndHost(proto, firstHeader(request, "host"));
  return postedOrigin !== null && trusted.has(postedOrigin);
}

function missingOriginDenyReason(
  request: Request,
  originHeader: string
): NexusCallbackOriginDenyReason {
  if (originHeader.toLowerCase() === "null") return "origin_header_null";
  const site = (request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  if (site && site !== "same-origin") return "sec_fetch_site_not_same_origin";
  if (isBrowserSameOriginNavigationalPost(request)) return "origin_not_trusted";
  return "origin_header_missing";
}

export function evaluateNexusCallbackOrigin(
  request: Request,
  env: NexusCallbackOriginEnv = process.env
): NexusCallbackOriginDecision {
  const originHeader = request.headers.get("origin")?.trim() ?? "";
  if (!originHeader || originHeader.toLowerCase() === "null") {
    if (
      isBrowserSameOriginNavigationalPost(request) &&
      requestPostedToTrustedOrigin(request, env)
    ) {
      return { ok: true };
    }
    return { ok: false, failed_origin_check: missingOriginDenyReason(request, originHeader) };
  }

  const clientOrigin = parseTrustedWebOrigin(originHeader);
  if (!clientOrigin) {
    return { ok: false, failed_origin_check: "origin_header_unparseable" };
  }
  if (!resolveTrustedNexusCallbackOrigins(request, env).has(clientOrigin)) {
    return { ok: false, failed_origin_check: "origin_not_trusted" };
  }
  return { ok: true };
}

/**
 * Form POST is allowed when Origin matches a trusted external origin,
 * or when Origin is missing/null and the browser reports a same-origin
 * navigational POST to a trusted public host.
 */
export function isSameOriginNexusCallbackPost(
  request: Request,
  env: NexusCallbackOriginEnv = process.env
): boolean {
  return evaluateNexusCallbackOrigin(request, env).ok;
}
