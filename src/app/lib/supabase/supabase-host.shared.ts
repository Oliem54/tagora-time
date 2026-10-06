export const HORORA_PRODUCTION_SUPABASE_HOST =
  "qcgvzdlfsxybrmloijpt.supabase.co" as const;
export const HORORA_STAGING_SUPABASE_HOST =
  "qokyobcvplzufshydhih.supabase.co" as const;
export const HORORA_PRODUCTION_SUPABASE_URL =
  `https://${HORORA_PRODUCTION_SUPABASE_HOST}` as const;
export const HORORA_STAGING_SUPABASE_URL =
  `https://${HORORA_STAGING_SUPABASE_HOST}` as const;
const HORORA_STAGING_VERCEL_PROJECT_MARKER = "tagora-time-staging";

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

export function isHororaStagingVercelProject(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const markers = [
    env.VERCEL_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_BRANCH_URL,
    env.NEXT_PUBLIC_APP_URL,
  ];
  return markers.some(
    (value) =>
      typeof value === "string" &&
      value.toLowerCase().includes(HORORA_STAGING_VERCEL_PROJECT_MARKER)
  );
}

export function isHororaProductionRuntime(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.VERCEL_ENV === "production" && !isHororaStagingVercelProject(env);
}

/**
 * Production HORORA must never call the staging Supabase project.
 * The staging Vercel project keeps the staging host even when its
 * deployment target is production. The hosts are public configuration.
 */
export function resolveHororaRuntimeSupabaseUrl(
  configured: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  env: NodeJS.ProcessEnv = process.env
): string {
  const trimmed = typeof configured === "string" ? configured.trim() : "";
  if (isHororaStagingVercelProject(env)) {
    return HORORA_STAGING_SUPABASE_URL;
  }
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
