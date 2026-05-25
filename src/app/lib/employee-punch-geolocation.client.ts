"use client";

export type EmployeePunchGeolocationFailureCode =
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

const FIRST_ATTEMPT_TIMEOUT_MS = 30000;
const RETRY_ATTEMPT_TIMEOUT_MS = 22000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;

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

export function messageForPunchGeolocationFailure(
  code: EmployeePunchGeolocationFailureCode
): string {
  switch (code) {
    case "unsupported":
      return "La géolocalisation n’est pas disponible sur cet appareil.";
    case "permission_denied":
      return "Permission GPS refusée. Autorisez la localisation pour ce site dans les réglages du navigateur, puis réessayez.";
    case "timeout":
      return "La localisation est autorisée, mais votre appareil n’a pas retourné la position à temps. Cliquez sur Réessayer la localisation.";
    case "position_unavailable":
      return "Impossible d’obtenir votre position pour le moment. Vérifiez le GPS de l’appareil ou réessayez.";
    default:
      return "Impossible d’obtenir votre position. Réessayez la localisation.";
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
      return fallbackError?.trim() || "Impossible d’enregistrer ce pointage.";
  }
}

function readGeolocationOnce(options: {
  enableHighAccuracy: boolean;
  timeoutMs: number;
}): Promise<EmployeePunchGeolocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({
        ok: false,
        code: "unsupported",
        message: messageForPunchGeolocationFailure("unsupported"),
        attempts: 0,
      });
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
export async function readEmployeePunchGeolocation(): Promise<EmployeePunchGeolocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      code: "unsupported",
      message: messageForPunchGeolocationFailure("unsupported"),
      attempts: 0,
    };
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
  deadlineMs: number
): Promise<EmployeePunchGeolocationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

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

  try {
    return await Promise.race([readEmployeePunchGeolocation(), deadlineResult]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
