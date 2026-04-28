import { createClient } from "@supabase/supabase-js";

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

const supabaseUrl = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const publishableKey = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
/** Priorité : ANON, sinon publishable (fallback). */
const supabaseResolvedKey = anonKey || publishableKey;

if (!supabaseUrl || !supabaseResolvedKey) {
  throw new Error(
    "Supabase navigateur : definir NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en secours) dans .env.local, puis redemarrer le serveur."
  );
}

export const supabase = createClient(supabaseUrl, supabaseResolvedKey);

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
export function getSupabaseBrowserLoginDebug() {
  let host: string | null = null;
  try {
    host = new URL(supabaseUrl).host;
  } catch {
    host = null;
  }

  const base = supabaseUrl.replace(/\/$/, "");
  const passwordGrantUrl = supabaseUrl ? `${base}/auth/v1/token?grant_type=password` : null;
  const settingsUrl = supabaseUrl ? `${base}/auth/v1/settings` : null;

  return {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(anonKey),
    hasPublishableKey: Boolean(publishableKey),
    hasResolvedKey: Boolean(supabaseResolvedKey),
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
export async function probeSupabaseAuthSettingsReachable(): Promise<{
  url: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  fetchErrorName?: string;
  fetchErrorMessage?: string;
}> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: supabaseResolvedKey,
        Authorization: `Bearer ${supabaseResolvedKey}`,
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
