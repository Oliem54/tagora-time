import {
  isCanonicalProductionHostname,
  isCanonicalStagingHostname,
  normalizeHostname,
} from "@/app/lib/canonical-domains";

export const HORORA_PRODUCTION_SUPABASE_HOST =
  "qcgvzdlfsxybrmloijpt.supabase.co" as const;
export const HORORA_STAGING_SUPABASE_HOST =
  "qokyobcvplzufshydhih.supabase.co" as const;
export const HORORA_PRODUCTION_SUPABASE_URL =
  `https://${HORORA_PRODUCTION_SUPABASE_HOST}` as const;
export const HORORA_STAGING_SUPABASE_URL =
  `https://${HORORA_STAGING_SUPABASE_HOST}` as const;

/**
 * Project hosts are public deployment names.
 * `tagora-time-staging` deploys with Vercel target=production, so
 * `VERCEL_ENV` is not the HORORA business environment.
 */
export const HORORA_STAGING_VERCEL_PROJECT_HOST =
  "tagora-time-staging.vercel.app" as const;
export const HORORA_PRODUCTION_VERCEL_PROJECT_HOST =
  "tagora-time.vercel.app" as const;

const HORORA_STAGING_VERCEL_SLUG = "tagora-time-staging";
const HORORA_PRODUCTION_VERCEL_SLUG = "tagora-time";

export type HororaBusinessEnvironment = "production" | "staging";

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

function readEnvHostname(value: string | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (raw.includes("://")) return readSupabaseHostname(raw);
  return normalizeHostname(raw.split("/")[0]);
}

function classifyHororaHostname(
  hostname: string | null
): HororaBusinessEnvironment | null {
  const host = normalizeHostname(hostname);
  if (!host) return null;
  if (isCanonicalProductionHostname(host)) return "production";
  if (isCanonicalStagingHostname(host)) return "staging";
  if (host === HORORA_PRODUCTION_VERCEL_PROJECT_HOST) return "production";
  if (!host.endsWith(".vercel.app")) return null;

  const label = host.slice(0, -".vercel.app".length);
  if (
    label === HORORA_STAGING_VERCEL_SLUG ||
    label.startsWith(`${HORORA_STAGING_VERCEL_SLUG}-`)
  ) {
    return "staging";
  }
  if (
    label === HORORA_PRODUCTION_VERCEL_SLUG ||
    label.startsWith(`${HORORA_PRODUCTION_VERCEL_SLUG}-`)
  ) {
    return "production";
  }
  return null;
}

/**
 * Explicit canonical app URL first, then the Vercel project or deployment host.
 * `VERCEL_ENV` is intentionally ignored: Staging and Production both deploy
 * with target=production.
 */
export function resolveHororaBusinessEnvironment(
  env: NodeJS.ProcessEnv = process.env
): HororaBusinessEnvironment | null {
  const signals = [
    env.NEXT_PUBLIC_APP_URL,
    env.APP_PUBLIC_BASE_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
  ];
  for (const signal of signals) {
    const classified = classifyHororaHostname(readEnvHostname(signal));
    if (classified) return classified;
  }
  return null;
}

export function isHororaProductionRuntime(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return resolveHororaBusinessEnvironment(env) === "production";
}

function isVercelRuntime(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
}

/**
 * Production HORORA must never call the staging Supabase project.
 * Staging HORORA must never fall through to the production Supabase project.
 * Both hosts are public configuration, not secrets.
 */
export function resolveHororaRuntimeSupabaseUrl(
  configured: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  env: NodeJS.ProcessEnv = process.env
): string {
  const trimmed = typeof configured === "string" ? configured.trim() : "";
  const host = readSupabaseHostname(trimmed);
  const business = resolveHororaBusinessEnvironment(env);

  if (business === "production") {
    if (host === HORORA_PRODUCTION_SUPABASE_HOST) return trimmed;
    if (!host || host === HORORA_STAGING_SUPABASE_HOST) {
      return HORORA_PRODUCTION_SUPABASE_URL;
    }
    throw new Error("Production HORORA refused unknown Supabase host");
  }

  if (business === "staging") {
    if (host === HORORA_STAGING_SUPABASE_HOST) return trimmed;
    if (!host || host === HORORA_PRODUCTION_SUPABASE_HOST) {
      return HORORA_STAGING_SUPABASE_URL;
    }
    throw new Error("Staging HORORA refused unknown Supabase host");
  }

  if (!trimmed) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  const knownHost =
    host === HORORA_STAGING_SUPABASE_HOST ||
    host === HORORA_PRODUCTION_SUPABASE_HOST;
  if (!knownHost && isVercelRuntime(env)) {
    throw new Error(
      host
        ? "HORORA refused unknown Supabase host"
        : "Missing NEXT_PUBLIC_SUPABASE_URL"
    );
  }
  return trimmed;
}
