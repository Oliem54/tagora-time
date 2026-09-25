export const HORORA_PRODUCTION_SUPABASE_HOST =
  "qcgvzdlfsxybrmloijpt.supabase.co" as const;
export const HORORA_STAGING_SUPABASE_HOST =
  "qokyobcvplzufshydhih.supabase.co" as const;
export const HORORA_PRODUCTION_SUPABASE_URL =
  `https://${HORORA_PRODUCTION_SUPABASE_HOST}` as const;

export function readSupabaseHostname(
  url: string | null | undefined
): string | null {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isHororaProductionRuntime(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.VERCEL_ENV === "production";
}

/**
 * Production HORORA must never call the staging Supabase project.
 * The production host is public configuration, not a secret.
 */
export function resolveHororaRuntimeSupabaseUrl(
  configured: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  env: NodeJS.ProcessEnv = process.env
): string {
  const trimmed = typeof configured === "string" ? configured.trim() : "";
  if (isHororaProductionRuntime(env)) {
    const host = readSupabaseHostname(trimmed);
    if (!host || host === HORORA_STAGING_SUPABASE_HOST) {
      return HORORA_PRODUCTION_SUPABASE_URL;
    }
    if (host !== HORORA_PRODUCTION_SUPABASE_HOST) {
      throw new Error("Production HORORA refused unknown Supabase host");
    }
    return trimmed;
  }
  if (!trimmed) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return trimmed;
}
