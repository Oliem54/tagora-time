/**
 * Journaux : en production, éviter les traces verbeuses côté client (PII, tokens).
 * Côté serveur, les erreurs restent journalisées pour l’exploitation.
 */

const isDev = process.env.NODE_ENV === "development";

export function isDevelopmentLogging(): boolean {
  return isDev;
}

/** Client ou serveur : logs uniquement en développement. */
export function devInfo(scope: string, message: string, meta?: unknown): void {
  if (!isDev) return;
  if (meta !== undefined) {
    console.info(`[${scope}]`, message, meta);
  } else {
    console.info(`[${scope}]`, message);
  }
}

/** Avertissements non bloquants (ex. config manquante) — visible en prod côté serveur. */
export function logWarn(scope: string, message: string, meta?: unknown): void {
  if (meta !== undefined) {
    console.warn(`[${scope}]`, message, meta);
  } else {
    console.warn(`[${scope}]`, message);
  }
}

export function logError(scope: string, message: string, meta?: unknown): void {
  if (meta !== undefined) {
    console.error(`[${scope}]`, message, meta);
  } else {
    console.error(`[${scope}]`, message);
  }
}
