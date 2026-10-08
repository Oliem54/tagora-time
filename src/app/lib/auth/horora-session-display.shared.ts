/**
 * Display label for a HORORA serving session.
 * Only email and app_metadata on the Auth user already resolved by the server
 * session may contribute. Request body and query are not sources.
 */

const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const RELIABLE_DISPLAY_NAME_KEYS = ["full_name", "display_name"] as const;

export type ReliableHororaSessionDisplay = {
  displayName: string | null;
  email: string | null;
};

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function sanitizeHororaSessionDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_DISPLAY_NAME_LENGTH) return null;
  if (hasControlCharacter(trimmed)) return null;
  return trimmed;
}

export function sanitizeHororaSessionEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return null;
  if (hasControlCharacter(trimmed) || /\s/.test(trimmed)) return null;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) return null;
  return trimmed;
}

export function readReliableHororaSessionDisplay(user: {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
} | null | undefined): ReliableHororaSessionDisplay {
  const metadata = user?.app_metadata;
  let displayName: string | null = null;
  if (metadata && typeof metadata === "object") {
    for (const key of RELIABLE_DISPLAY_NAME_KEYS) {
      const candidate = sanitizeHororaSessionDisplayName(metadata[key]);
      if (candidate) {
        displayName = candidate;
        break;
      }
    }
  }
  return {
    displayName,
    email: sanitizeHororaSessionEmail(user?.email),
  };
}
