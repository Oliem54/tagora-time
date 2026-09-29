export const HORORA_PRODUCTION_SUPABASE_HOST =
  "qcgvzdlfsxybrmloijpt.supabase.co" as const;
export const HORORA_STAGING_SUPABASE_HOST =
  "qokyobcvplzufshydhih.supabase.co" as const;
export const HORORA_PRODUCTION_SUPABASE_URL =
  `https://${HORORA_PRODUCTION_SUPABASE_HOST}` as const;
export const HORORA_STAGING_SUPABASE_URL =
  `https://${HORORA_STAGING_SUPABASE_HOST}` as const;
export const HORORA_STAGING_VERCEL_PROJECT = "tagora-time-staging" as const;
export const HORORA_PRODUCTION_VERCEL_PROJECT = "tagora-time" as const;

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

const DEPLOYMENT_SIGNAL_KEYS = [
  "VERCEL_PROJECT_NAME",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_BRANCH_URL",
  "NEXT_PUBLIC_APP_URL",
] as const;

type DeploymentTarget = "staging" | "production";

function readSignal(value: string | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return null;
  try {
    const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname;
  } catch {
    return raw.split("/")[0]?.split(":")[0] ?? null;
  }
}

function classifyDeploymentSignal(value: string | null | undefined): DeploymentTarget | "local" | "unknown" | null {
  const host = readSignal(value);
  if (!host) return null;
  if (host === "localhost" || host === "127.0.0.1") return "local";
  if (
    host === HORORA_STAGING_VERCEL_PROJECT ||
    host === "tagora-time-staging.vercel.app" ||
    host.endsWith(".tagora-time-staging.vercel.app") ||
    host === "time.staging.tagora.ca" ||
    host.startsWith(`${HORORA_STAGING_VERCEL_PROJECT}-`) ||
    host.startsWith(`${HORORA_STAGING_VERCEL_PROJECT}.`)
  ) {
    return "staging";
  }
  if (
    host === "time.tagora.ca" ||
    host === HORORA_PRODUCTION_VERCEL_PROJECT ||
    host === "tagora-time.vercel.app" ||
    host.endsWith(".tagora-time.vercel.app") ||
    (host.startsWith(`${HORORA_PRODUCTION_VERCEL_PROJECT}-`) &&
      !host.startsWith(`${HORORA_STAGING_VERCEL_PROJECT}-`) &&
      host.endsWith(".vercel.app"))
  ) {
    return "production";
  }
  return "unknown";
}

function classifyDeploymentTarget(
  env: NodeJS.ProcessEnv
): { ok: true; target: DeploymentTarget | "unspecified" } | { ok: false; reason: "ambiguous" | "unknown_host" } {
  const signals = DEPLOYMENT_SIGNAL_KEYS.map((key) => classifyDeploymentSignal(env[key]));
  if (typeof window !== "undefined") {
    signals.push(classifyDeploymentSignal(window.location.hostname));
  }
  const present = signals.filter((signal): signal is DeploymentTarget | "local" | "unknown" => signal !== null);
  if (present.includes("unknown")) return { ok: false, reason: "unknown_host" };
  const targets = new Set(present.filter((signal): signal is DeploymentTarget => signal !== "local"));
  if (targets.size > 1) return { ok: false, reason: "ambiguous" };
  if (targets.has("staging")) return { ok: true, target: "staging" };
  if (targets.has("production")) return { ok: true, target: "production" };
  return { ok: true, target: "unspecified" };
}

export function isHororaProductionRuntime(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const classified = classifyDeploymentTarget(env);
  return classified.ok && classified.target === "production";
}

/**
 * Staging and Production are chosen from the Vercel project or public host.
 * VERCEL_ENV alone never selects a database. An unknown or conflicting
 * target fails closed instead of calling Production.
 */
export function resolveHororaRuntimeSupabaseUrl(
  configured: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  env: NodeJS.ProcessEnv = process.env
): string {
  const classified = classifyDeploymentTarget(env);
  if (!classified.ok) {
    throw new Error(
      classified.reason === "unknown_host"
        ? "Production HORORA refused unknown Supabase host"
        : "HORORA refused ambiguous Supabase target"
    );
  }
  if (classified.target === "staging") return HORORA_STAGING_SUPABASE_URL;
  if (classified.target === "production") return HORORA_PRODUCTION_SUPABASE_URL;

  const host = readSupabaseHostname(configured);
  if (host === HORORA_STAGING_SUPABASE_HOST) return HORORA_STAGING_SUPABASE_URL;
  if (host === HORORA_PRODUCTION_SUPABASE_HOST) return HORORA_PRODUCTION_SUPABASE_URL;
  throw new Error(
    host
      ? "Production HORORA refused unknown Supabase host"
      : "HORORA refused ambiguous Supabase target"
  );
}
