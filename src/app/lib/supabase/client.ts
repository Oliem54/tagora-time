import { createClient, type AuthError } from "@supabase/supabase-js";

/** CRLF / espaces dans .env.local peuvent corrompre l’URL → Failed to fetch. */
function trimEnv(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

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
 * GoTrue renvoie ce cas quand le refresh_token en localStorage n’existe plus côté serveur
 * (session révoquée, autre projet, reset DB, stockage partiellement corrompu).
 * Sans purge locale, chaque getSession/getUser retente le refresh et réaffiche l’erreur.
 */
export function isInvalidStoredRefreshTokenError(
  error: AuthError | null | undefined
): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toLowerCase();
  if (code === "refresh_token_not_found") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("refresh token not found") ||
    (msg.includes("invalid refresh token") && msg.includes("not found"))
  );
}

/** Retourne true si une session locale invalide a été effacée. */
export async function clearLocalAuthIfRefreshTokenDead(
  error: AuthError | null | undefined
): Promise<boolean> {
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
