import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveHororaRuntimeSupabaseUrl } from "@/app/lib/supabase/supabase-host.shared";

export const HORORA_SUPABASE_UNCONFIGURED = "supabase_unconfigured" as const;

export type HororaSupabaseUnconfiguredError = {
  message: "Service Supabase indisponible.";
  code: typeof HORORA_SUPABASE_UNCONFIGURED;
};

const SUPABASE_UNAVAILABLE: HororaSupabaseUnconfiguredError = {
  message: "Service Supabase indisponible.",
  code: HORORA_SUPABASE_UNCONFIGURED,
};

export type BrowserSupabaseConfig = {
  url: string;
  anonKey: string;
  publishableKey: string;
  resolvedKey: string;
};

/** CRLF / espaces dans .env.local peuvent corrompre l’URL → Failed to fetch. */
function trimEnv(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeArgForAuthLog(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name} ${arg.message}`;
  if (arg && typeof arg === "object" && "message" in arg) {
    return String((arg as { message?: unknown }).message ?? "");
  }
  return String(arg);
}

/**
 * GoTrue appelle console.error sur un refresh echoue (session locale morte).
 * En dev, Next/Turbopack transforme ca en overlay bloquant la page login.
 * On degrade uniquement les erreurs de refresh token connues vers console.warn.
 */
function installDevSupabaseRefreshTokenConsoleFilter() {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return;
  const w = window as Window & { __tagoraSupabaseRefreshConsoleFilter?: boolean };
  if (w.__tagoraSupabaseRefreshConsoleFilter) return;
  w.__tagoraSupabaseRefreshConsoleFilter = true;

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const blob = args.map(summarizeArgForAuthLog).join(" ").toLowerCase();
    const isRefreshNoise =
      blob.includes("invalid refresh token") ||
      blob.includes("refresh token not found") ||
      blob.includes("refresh_token_not_found") ||
      (blob.includes("authapierror") && blob.includes("refresh"));
    if (isRefreshNoise) {
      console.warn("[supabase auth] session locale invalide (refresh ignore en dev overlay)", ...args);
      return;
    }
    original(...args);
  };
}

installDevSupabaseRefreshTokenConsoleFilter();

/**
 * A configured browser client exists only when both the public URL and a
 * public key are present. An empty build must not borrow the Production URL.
 */
export function readBrowserSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): BrowserSupabaseConfig | null {
  const rawUrl = trimEnv(env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = trimEnv(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const publishableKey = trimEnv(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const resolvedKey = anonKey || publishableKey;
  if (!rawUrl || !resolvedKey) return null;

  return {
    url: resolveHororaRuntimeSupabaseUrl(rawUrl, env),
    anonKey,
    publishableKey,
    resolvedKey,
  };
}

type UnavailableQuery = Promise<{
  data: null;
  error: HororaSupabaseUnconfiguredError;
  count: null;
}>;

function unavailableQuery(): UnavailableQuery {
  const result = {
    data: null,
    error: SUPABASE_UNAVAILABLE,
    count: null,
  };
  const promise = Promise.resolve(result);
  let proxy: UnavailableQuery;
  const builder = function unavailableBuilder() {
    return proxy;
  };
  proxy = new Proxy(builder, {
    get(_target, prop) {
      if (prop === "then") return promise.then.bind(promise);
      if (prop === "catch") return promise.catch.bind(promise);
      if (prop === "finally") return promise.finally.bind(promise);
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  }) as unknown as UnavailableQuery;
  return proxy;
}

function unavailableNamespace(): unknown {
  const call = () => unavailableQuery();
  return new Proxy(call, {
    get: () => unavailableNamespace(),
    apply: () => unavailableQuery(),
  });
}

function unavailableAuth() {
  return {
    getSession: async () => ({
      data: { session: null },
      error: SUPABASE_UNAVAILABLE,
    }),
    getUser: async () => ({
      data: { user: null },
      error: SUPABASE_UNAVAILABLE,
    }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({
      data: { user: null, session: null },
      error: SUPABASE_UNAVAILABLE,
    }),
    signInWithOtp: async () => ({
      data: { user: null, session: null },
      error: SUPABASE_UNAVAILABLE,
    }),
    resetPasswordForEmail: async () => ({
      data: null,
      error: SUPABASE_UNAVAILABLE,
    }),
    updateUser: async () => ({
      data: { user: null },
      error: SUPABASE_UNAVAILABLE,
    }),
    setSession: async () => ({
      data: { session: null, user: null },
      error: SUPABASE_UNAVAILABLE,
    }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe() {} } },
    }),
    mfa: unavailableNamespace(),
    admin: unavailableNamespace(),
  };
}

/** Local refusal. It has no URL, no key, and no network access. */
export function createUnavailableBrowserSupabase() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "auth") return unavailableAuth();
        if (prop === "from" || prop === "rpc" || prop === "schema") {
          return () => unavailableQuery();
        }
        return unavailableNamespace();
      },
    }
  );
}

let cachedClient: SupabaseClient | ReturnType<typeof createUnavailableBrowserSupabase> | null =
  null;
let cachedKey = "";

function browserClientCacheKey(env: NodeJS.ProcessEnv): string {
  return [
    env.VERCEL_ENV ?? "",
    env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  ].join("\n");
}

export function getBrowserSupabaseClient(
  env: NodeJS.ProcessEnv = process.env
): SupabaseClient | ReturnType<typeof createUnavailableBrowserSupabase> {
  const key = browserClientCacheKey(env);
  if (cachedClient && cachedKey === key && env === process.env) return cachedClient;
  const config = readBrowserSupabaseConfig(env);
  const client = config
    ? createClient(config.url, config.resolvedKey)
    : createUnavailableBrowserSupabase();
  if (env === process.env) {
    cachedClient = client;
    cachedKey = key;
  }
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getBrowserSupabaseClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as SupabaseClient;

/**
 * supabase-js sérialise partiellement GoTrue, mais getUser / getSession en parallèle
 * (plusieurs useEffect, onAuthStateChange, Strict Mode) provoquent l’erreur
 * "Lock ... was released because another request stole it".
 */
let authReadChain: Promise<unknown> = Promise.resolve();

export function runWithBrowserAuthReadLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = authReadChain.then(() => fn());
  authReadChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function isAuthClientLockContentionError(err: unknown): boolean {
  const msg =
    err &&
    typeof (err as { message?: string }).message === "string" &&
    (err as { message: string }).message
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : String(err);
  return /lock .+ (was )?released|another request|stole it/i.test(msg);
}

/**
 * GoTrue renvoie ce cas quand le refresh_token en localStorage n’existe plus côté serveur
 * (session révoquée, autre projet, reset DB, stockage partiellement corrompu).
 * Sans purge locale, chaque getSession/getUser retente le refresh et réaffiche l’erreur.
 */
export function isInvalidStoredRefreshTokenError(error: unknown): boolean {
  if (error == null) return false;
  const asRecord =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
  const code = String(asRecord?.code ?? "").toLowerCase();
  if (code === "refresh_token_not_found" || code === "invalid_grant") return true;
  const msg = String(asRecord?.message ?? (error instanceof Error ? error.message : "")).toLowerCase();
  return msg.includes("refresh token not found") || msg.includes("invalid refresh token");
}

/** Retourne true si une session locale invalide a été effacée. */
export async function clearLocalAuthIfRefreshTokenDead(error: unknown): Promise<boolean> {
  if (!isInvalidStoredRefreshTokenError(error)) return false;
  await supabase.auth.signOut({ scope: "local" });
  return true;
}

/** Dev uniquement : pas de clé, uniquement indicateurs et host. */
export function getSupabaseBrowserLoginDebug(
  env: NodeJS.ProcessEnv = process.env
) {
  const config = readBrowserSupabaseConfig(env);
  let host: string | null = null;
  try {
    host = config ? new URL(config.url).host : null;
  } catch {
    host = null;
  }

  const base = config?.url.replace(/\/$/, "") ?? "";
  const passwordGrantUrl = config ? `${base}/auth/v1/token?grant_type=password` : null;
  const settingsUrl = config ? `${base}/auth/v1/settings` : null;

  return {
    hasUrl: Boolean(config?.url),
    hasAnonKey: Boolean(config?.anonKey),
    hasPublishableKey: Boolean(config?.publishableKey),
    hasResolvedKey: Boolean(config?.resolvedKey),
    host,
    /** À comparer avec l’onglet Network (filtre : token ou grant_type=password). */
    passwordGrantUrl,
    /** GET minimal pour tester joignabilité avant signInWithPassword (dev). */
    settingsUrl,
  };
}

/**
 * Dev : vérifie que le navigateur peut joindre Supabase (TLS, DNS, extensions, etc.).
 * Utilise la même clé que createClient (jamais loguée).
 */
export async function probeSupabaseAuthSettingsReachable(
  env: NodeJS.ProcessEnv = process.env
): Promise<{
  url: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  fetchErrorName?: string;
  fetchErrorMessage?: string;
}> {
  const config = readBrowserSupabaseConfig(env);
  if (!config) {
    return { url: "", ok: false, fetchErrorName: HORORA_SUPABASE_UNCONFIGURED };
  }
  const url = `${config.url.replace(/\/$/, "")}/auth/v1/settings`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: config.resolvedKey,
        Authorization: `Bearer ${config.resolvedKey}`,
      },
    });

    return {
      url,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    };
  } catch (caught) {
    const err = caught instanceof Error ? caught : new Error(String(caught));
    return {
      url,
      ok: false,
      fetchErrorName: err.name,
      fetchErrorMessage: err.message,
    };
  }
}
