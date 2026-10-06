import {
  NEXUS_PUBLIC_LOGIN_URL,
  NEXUS_PUBLIC_MODULES_URL,
} from "@/app/lib/canonical-domains";

/** Connexion Nexus Staging. Constante serveur, jamais lue depuis la requête. */
export const NEXUS_STAGING_LOGIN_URL =
  "https://tagora-nexus-staging.vercel.app/login" as const;

/** Portail Nexus Staging. Même constante que le handoff, sans import circulaire. */
export const NEXUS_STAGING_MODULES_URL =
  "https://tagora-nexus-staging.vercel.app/modules" as const;

/** Le navigateur revient sur HORORA. Le middleware choisit ensuite Nexus. */
export const HORORA_SAME_ORIGIN_LOGIN_PATH = "/login" as const;

export const HORORA_STAGING_VERCEL_PROJECT_MARKER = "tagora-time-staging" as const;
export const HORORA_PRODUCTION_VERCEL_PROJECT_MARKER = "tagora-time" as const;
export const HORORA_UNKNOWN_LOGIN_PATH = "/auth/nexus/denied" as const;

export type HororaServingProject = "staging" | "production" | "local" | "unknown";

export type HororaNexusLoginDestination =
  | { readonly ok: true; readonly project: "staging"; readonly url: typeof NEXUS_STAGING_LOGIN_URL }
  | {
      readonly ok: true;
      readonly project: "production";
      readonly url: typeof NEXUS_PUBLIC_LOGIN_URL;
    }
  | { readonly ok: false; readonly project: "local" | "unknown" };

export type HororaNexusModulesDestination =
  | {
      readonly ok: true;
      readonly project: "staging";
      readonly url: typeof NEXUS_STAGING_MODULES_URL;
    }
  | {
      readonly ok: true;
      readonly project: "production";
      readonly url: typeof NEXUS_PUBLIC_MODULES_URL;
    }
  | { readonly ok: false; readonly project: "local" | "unknown" };

type ServerProjectEnv = {
  readonly NODE_ENV?: string;
  readonly VERCEL?: string;
  readonly VERCEL_ENV?: string;
  readonly VERCEL_URL?: string;
  readonly VERCEL_PROJECT_PRODUCTION_URL?: string;
  readonly VERCEL_BRANCH_URL?: string;
};

function serverProjectHosts(env: ServerProjectEnv): string[] {
  return [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL].flatMap(
    (value) => (typeof value === "string" && value.trim() ? [value.trim().toLowerCase()] : [])
  );
}

function hostIsStagingProject(value: string): boolean {
  return value.includes(HORORA_STAGING_VERCEL_PROJECT_MARKER);
}

function hostIsProductionProject(value: string): boolean {
  if (hostIsStagingProject(value)) return false;
  return (
    value.includes(HORORA_PRODUCTION_VERCEL_PROJECT_MARKER) ||
    value.includes("time.tagora.ca")
  );
}

/**
 * Classe le projet HORORA à partir des variables posées par Vercel ou par Node.
 * N'accepte ni en-tête, ni hôte de requête, ni URL de retour fournie par le client.
 */
export function readHororaServingProject(env: ServerProjectEnv = process.env): HororaServingProject {
  const hosts = serverProjectHosts(env);
  if (hosts.some(hostIsStagingProject)) return "staging";
  if (hosts.some(hostIsProductionProject)) return "production";

  const onVercel = env.VERCEL === "1" || typeof env.VERCEL_ENV === "string";
  if (!onVercel && env.NODE_ENV === "development") return "local";
  return "unknown";
}

export function resolveHororaNexusLoginDestination(
  env: ServerProjectEnv = process.env
): HororaNexusLoginDestination {
  const project = readHororaServingProject(env);
  if (project === "staging") return { ok: true, project, url: NEXUS_STAGING_LOGIN_URL };
  if (project === "production") return { ok: true, project, url: NEXUS_PUBLIC_LOGIN_URL };
  return { ok: false, project };
}

export function resolveHororaNexusModulesDestination(
  env: ServerProjectEnv = process.env
): HororaNexusModulesDestination {
  const project = readHororaServingProject(env);
  if (project === "staging") return { ok: true, project, url: NEXUS_STAGING_MODULES_URL };
  if (project === "production") return { ok: true, project, url: NEXUS_PUBLIC_MODULES_URL };
  return { ok: false, project };
}

/** Cible de redirection serveur. Inconnu et local restent dans HORORA. */
export function hororaNexusLoginRedirectTarget(env: ServerProjectEnv = process.env): string {
  const destination = resolveHororaNexusLoginDestination(env);
  return destination.ok ? destination.url : HORORA_UNKNOWN_LOGIN_PATH;
}
