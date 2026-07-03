"use client";

export type EmployeePunchGeolocationFailureCode =
  | "insecure_context"
  | "unsupported"
  | "permission_denied"
  | "timeout"
  | "position_unavailable"
  | "unknown";

export type EmployeePunchGeolocationResult =
  | { ok: true; latitude: number; longitude: number; attempts: number }
  | {
      ok: false;
      code: EmployeePunchGeolocationFailureCode;
      message: string;
      attempts: number;
    };

export const PUNCH_GEOLOCATION_TEST_BUTTON_LABEL = "Tester ma localisation";

export const PUNCH_GEOLOCATION_HELP_TITLE = "Comment activer la localisation";

export const PUNCH_GEOLOCATION_HELP_STEPS = [
  "Vérifiez que vous utilisez l'adresse officielle TAGORA.",
  "Autorisez la localisation lorsque votre navigateur le demande.",
  "Vérifiez que la localisation Windows est activée.",
  "Si vous utilisez un ordinateur de bureau, activez également le Wi-Fi.",
  `Cliquez sur « ${PUNCH_GEOLOCATION_TEST_BUTTON_LABEL} ».`,
] as const;

const FIRST_ATTEMPT_TIMEOUT_MS = 30000;
const RETRY_ATTEMPT_TIMEOUT_MS = 22000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;

/**
 * Borne haute pour une lecture GPS complète :
 * 1ère tentative (30s) + (MAX_ATTEMPTS-1) × (retry 22s + pause 1,2s) + marge 4s ≈ 80,4s.
 * Doit rester alignée avec readEmployeePunchGeolocation().
 */
export const EMPLOYEE_PUNCH_GEOLOCATION_MAX_DURATION_MS =
  FIRST_ATTEMPT_TIMEOUT_MS +
  (MAX_ATTEMPTS - 1) * (RETRY_ATTEMPT_TIMEOUT_MS + RETRY_DELAY_MS) +
  4_000;

/** Réutiliser une position récente pour éviter de relancer getCurrentPosition à chaque action. */
export const EMPLOYEE_PUNCH_GEOLOCATION_CACHE_TTL_MS = 60_000;

type CachedPunchPosition = {
  latitude: number;
  longitude: number;
  readAtMs: number;
};

let lastPunchPositionCache: CachedPunchPosition | null = null;

export function clearEmployeePunchGeolocationCache() {
  lastPunchPositionCache = null;
}

function readCachedPunchPosition(
  maxAgeMs: number = EMPLOYEE_PUNCH_GEOLOCATION_CACHE_TTL_MS
): Extract<EmployeePunchGeolocationResult, { ok: true }> | null {
  if (!lastPunchPositionCache) {
    return null;
  }
  if (Date.now() - lastPunchPositionCache.readAtMs > maxAgeMs) {
    lastPunchPositionCache = null;
    return null;
  }
  return {
    ok: true,
    latitude: lastPunchPositionCache.latitude,
    longitude: lastPunchPositionCache.longitude,
    attempts: 0,
  };
}

function storePunchPositionCache(latitude: number, longitude: number) {
  lastPunchPositionCache = {
    latitude,
    longitude,
    readAtMs: Date.now(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function mapGeolocationError(
  err: GeolocationPositionError
): EmployeePunchGeolocationFailureCode {
  if (err.code === err.PERMISSION_DENIED) {
    return "permission_denied";
  }
  if (err.code === err.TIMEOUT) {
    return "timeout";
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return "position_unavailable";
  }
  return "unknown";
}

export function getEmployeePunchGeolocationPreflightFailure():
  | Extract<EmployeePunchGeolocationResult, { ok: false }>
  | null {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      ok: false,
      code: "insecure_context",
      message: messageForPunchGeolocationFailure("insecure_context"),
      attempts: 0,
    };
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      code: "unsupported",
      message: messageForPunchGeolocationFailure("unsupported"),
      attempts: 0,
    };
  }
  return null;
}

export function messageForPunchGeolocationFailure(
  code: EmployeePunchGeolocationFailureCode
): string {
  const testLabel = PUNCH_GEOLOCATION_TEST_BUTTON_LABEL;
  switch (code) {
    case "insecure_context":
      return `Connexion non sécurisée. Utilisez l'adresse officielle TAGORA (cadenas dans la barre d'adresse), puis cliquez sur « ${testLabel} ».`;
    case "unsupported":
      return "La localisation n'est pas disponible dans ce navigateur. Utilisez Chrome ou Edge à jour.";
    case "permission_denied":
      return `Localisation refusée pour ce site. Autorisez la localisation dans votre navigateur, puis cliquez sur « ${testLabel} ».`;
    case "timeout":
      return `La localisation n'a pas répondu à temps. Vérifiez que la localisation Windows est activée, autorisez les applications de bureau, activez le Wi-Fi sur un ordinateur de bureau, puis cliquez sur « ${testLabel} ».`;
    case "position_unavailable":
      return `Impossible d'obtenir votre position pour le moment. Vérifiez que la localisation Windows est activée, puis cliquez sur « ${testLabel} ».`;
    default:
      return `Impossible d'obtenir votre position. Cliquez sur « ${testLabel} ».`;
  }
}

export function messageForHorodateurPunchGpsServerCode(
  code: string | undefined,
  fallbackError?: string
): string {
  switch (code) {
    case "GPS_REQUIRED":
      return "Position GPS requise. Autorisez la géolocalisation et réessayez.";
    case "GPS_OUT_OF_ZONE":
      return "Position obtenue, mais vous êtes hors de la zone autorisée pour puncher.";
    case "GPS_NOT_CONFIGURED":
      return fallbackError?.trim() ||
        "Impossible de vérifier la zone GPS. Contactez la direction.";
    default:
      return fallbackError?.trim() || "Impossible d'enregistrer ce pointage.";
  }
}

function readGeolocationOnce(options: {
  enableHighAccuracy: boolean;
  timeoutMs: number;
}): Promise<EmployeePunchGeolocationResult> {
  return new Promise((resolve) => {
    const preflight = getEmployeePunchGeolocationPreflightFailure();
    if (preflight) {
      resolve(preflight);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          attempts: 0,
        }),
      (err) => {
        const code = mapGeolocationError(err);
        resolve({
          ok: false,
          code,
          message: messageForPunchGeolocationFailure(code),
          attempts: 0,
        });
      },
      {
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeoutMs,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Lit la position pour un punch web avec nouvelles tentatives en cas de timeout.
 */
export async function readEmployeePunchGeolocation(options?: {
  skipCache?: boolean;
}): Promise<EmployeePunchGeolocationResult> {
  const preflight = getEmployeePunchGeolocationPreflightFailure();
  if (preflight) {
    return preflight;
  }

  if (!options?.skipCache) {
    const cached = readCachedPunchPosition();
    if (cached) {
      return cached;
    }
  }

  let lastFailure: Extract<EmployeePunchGeolocationResult, { ok: false }> | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const useHighAccuracy = attempt === 1;
    const timeoutMs =
      attempt === 1 ? FIRST_ATTEMPT_TIMEOUT_MS : RETRY_ATTEMPT_TIMEOUT_MS;

    const result = await readGeolocationOnce({
      enableHighAccuracy: useHighAccuracy,
      timeoutMs,
    });

    if (result.ok) {
      storePunchPositionCache(result.latitude, result.longitude);
      return { ...result, attempts: attempt };
    }

    lastFailure = {
      ...result,
      attempts: attempt,
    };

    const shouldRetry = result.code === "timeout" && attempt < MAX_ATTEMPTS;
    if (!shouldRetry) {
      return lastFailure;
    }

    await sleep(RETRY_DELAY_MS);
  }

  return (
    lastFailure ?? {
      ok: false,
      code: "unknown",
      message: messageForPunchGeolocationFailure("unknown"),
      attempts: MAX_ATTEMPTS,
    }
  );
}

/**
 * Borne le temps total de lecture GPS (évite un chargement infini si le navigateur
 * ne rappelle jamais getCurrentPosition).
 */
export async function readEmployeePunchGeolocationWithDeadline(
  deadlineMs: number,
  abortSignal?: AbortSignal,
  options?: { skipCache?: boolean }
): Promise<EmployeePunchGeolocationResult> {
  if (abortSignal?.aborted) {
    return {
      ok: false,
      code: "unknown",
      message: messageForPunchGeolocationFailure("timeout"),
      attempts: 0,
    };
  }

  const preflight = getEmployeePunchGeolocationPreflightFailure();
  if (preflight) {
    return preflight;
  }

  if (!options?.skipCache) {
    const cached = readCachedPunchPosition();
    if (cached) {
      return cached;
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const deadlineResult = new Promise<EmployeePunchGeolocationResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ok: false,
        code: "timeout",
        message: messageForPunchGeolocationFailure("timeout"),
        attempts: MAX_ATTEMPTS,
      });
    }, deadlineMs);
  });

  const abortResult = new Promise<EmployeePunchGeolocationResult>((resolve) => {
    if (!abortSignal) {
      return;
    }
    onAbort = () => {
      resolve({
        ok: false,
        code: "unknown",
        message: messageForPunchGeolocationFailure("timeout"),
        attempts: 0,
      });
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    const racers: Promise<EmployeePunchGeolocationResult>[] = [
      readEmployeePunchGeolocation(options),
      deadlineResult,
    ];
    if (abortSignal) {
      racers.push(abortResult);
    }
    return await Promise.race(racers);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (abortSignal && onAbort) {
      abortSignal.removeEventListener("abort", onAbort);
    }
  }
}
