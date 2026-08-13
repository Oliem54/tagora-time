/**
 * Source de vérité locale DEC-015 (ADR-0004 / VALD-093).
 * `app.tagora.ca` est réservé à Nexus — ne jamais l’utiliser comme domaine TAGORA Time.
 */

export const CANONICAL_PRODUCTION_ORIGIN = "https://time.tagora.ca" as const;
export const CANONICAL_STAGING_ORIGIN = "https://time.staging.tagora.ca" as const;

export const CANONICAL_PRODUCTION_HOSTNAME = "time.tagora.ca" as const;
export const CANONICAL_STAGING_HOSTNAME = "time.staging.tagora.ca" as const;

/** Réservé Nexus — hors périmètre TAGORA Time. */
export const NEXUS_PUBLIC_ORIGIN = "https://app.tagora.ca" as const;
export const NEXUS_PUBLIC_HOSTNAME = "app.tagora.ca" as const;

/** Point d’entrée connexion standard DEC-015. */
export const LOGIN_STANDARD_PATH = "/login" as const;

/** Porte d’entrée générique existante (choix employé / direction). */
export const LOGIN_STANDARD_TARGET_PATH = "/connexion" as const;

export function normalizeHostname(
  hostname: string | null | undefined
): string | null {
  const host = String(hostname ?? "")
    .trim()
    .toLowerCase()
    .split(":")[0]
    ?.trim();
  return host || null;
}

/** Production Time uniquement — pas `*.tagora.ca` générique. */
export function isCanonicalProductionHostname(
  hostname: string | null | undefined
): boolean {
  return normalizeHostname(hostname) === CANONICAL_PRODUCTION_HOSTNAME;
}

/** Staging Time canonique — jamais Production. */
export function isCanonicalStagingHostname(
  hostname: string | null | undefined
): boolean {
  return normalizeHostname(hostname) === CANONICAL_STAGING_HOSTNAME;
}

export function isNexusHostname(hostname: string | null | undefined): boolean {
  return normalizeHostname(hostname) === NEXUS_PUBLIC_HOSTNAME;
}

export function isLocalHostname(hostname: string | null | undefined): boolean {
  const host = normalizeHostname(hostname);
  return host === "localhost" || host === "127.0.0.1";
}

export function isVercelPreviewHostname(
  hostname: string | null | undefined
): boolean {
  const host = normalizeHostname(hostname);
  return Boolean(host?.endsWith(".vercel.app"));
}

/**
 * Construit la cible de `/login` vers `/connexion` sans boucle.
 * Conserve la query string telle quelle (paramètres déjà supportés en amont).
 */
export function buildLoginStandardRedirectPath(
  searchParams?: URLSearchParams | string | null
): string {
  let query = "";
  if (typeof searchParams === "string") {
    const trimmed = searchParams.trim();
    if (trimmed) {
      query = trimmed.startsWith("?") ? trimmed : `?${trimmed}`;
    }
  } else if (searchParams && [...searchParams.keys()].length > 0) {
    query = `?${searchParams.toString()}`;
  }

  const target = `${LOGIN_STANDARD_TARGET_PATH}${query}`;
  if (target === LOGIN_STANDARD_PATH || target.startsWith(`${LOGIN_STANDARD_PATH}?`)) {
    return LOGIN_STANDARD_TARGET_PATH;
  }
  return target;
}

/**
 * Origine absolue préférée pour la doc / défauts non secrets.
 * Les variables runtime (`NEXT_PUBLIC_APP_URL`, etc.) restent prioritaires ailleurs.
 */
export function resolveCanonicalOriginForEnvironment(
  hostname: string | null | undefined
): typeof CANONICAL_PRODUCTION_ORIGIN | typeof CANONICAL_STAGING_ORIGIN | null {
  if (isCanonicalProductionHostname(hostname)) {
    return CANONICAL_PRODUCTION_ORIGIN;
  }
  if (isCanonicalStagingHostname(hostname)) {
    return CANONICAL_STAGING_ORIGIN;
  }
  return null;
}
