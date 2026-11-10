import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmployeePunchGeolocationCache,
  readEmployeePunchGeolocation,
} from "@/app/lib/employee-punch-geolocation.client";

type GeoCall = {
  enableHighAccuracy?: boolean;
  timeout?: number;
};

function installGeolocationMock(
  handler: (
    success: PositionCallback,
    error: PositionErrorCallback | null | undefined,
    options?: PositionOptions
  ) => void
) {
  const calls: GeoCall[] = [];
  const getCurrentPosition = vi.fn(
    (
      success: PositionCallback,
      error?: PositionErrorCallback | null,
      options?: PositionOptions
    ) => {
      calls.push({
        enableHighAccuracy: options?.enableHighAccuracy,
        timeout: options?.timeout,
      });
      handler(success, error, options);
    }
  );

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      isSecureContext: true,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: { getCurrentPosition },
    },
  });

  return { calls, getCurrentPosition };
}

function positionUnavailableError(): GeolocationPositionError {
  return {
    code: 2,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    message: "Position unavailable",
  } as GeolocationPositionError;
}

function permissionDeniedError(): GeolocationPositionError {
  return {
    code: 1,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    message: "User denied geolocation",
  } as GeolocationPositionError;
}

function okPosition(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 40,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return this;
      },
    },
    timestamp: Date.now(),
    toJSON() {
      return this;
    },
  } as GeolocationPosition;
}

describe("readEmployeePunchGeolocation retry policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearEmployeePunchGeolocationCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearEmployeePunchGeolocationCache();
  });

  it("retries position_unavailable once with low accuracy after a high-accuracy failure", async () => {
    const { calls } = installGeolocationMock((success, error, options) => {
      if (options?.enableHighAccuracy) {
        error?.(positionUnavailableError());
        return;
      }
      success(okPosition(45.5017, -73.5673));
    });

    const pending = readEmployeePunchGeolocation({ skipCache: true });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toMatchObject({
      ok: true,
      latitude: 45.5017,
      longitude: -73.5673,
      attempts: 2,
    });
    expect(calls).toEqual([
      { enableHighAccuracy: true, timeout: 30000 },
      { enableHighAccuracy: false, timeout: 22000 },
    ]);
  });

  it("does not retry permission_denied", async () => {
    const { calls } = installGeolocationMock((_success, error) => {
      error?.(permissionDeniedError());
    });

    const result = await readEmployeePunchGeolocation({ skipCache: true });

    expect(result).toMatchObject({
      ok: false,
      code: "permission_denied",
      attempts: 1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.enableHighAccuracy).toBe(true);
  });

  it("synthetic entry→exit path never invents coordinates when geo fails", async () => {
    installGeolocationMock((_success, error) => {
      error?.(permissionDeniedError());
    });

    const entry = await readEmployeePunchGeolocation({ skipCache: true });
    clearEmployeePunchGeolocationCache();
    const exit = await readEmployeePunchGeolocation({ skipCache: true });

    expect(entry.ok).toBe(false);
    expect(exit.ok).toBe(false);
    if (!entry.ok && !exit.ok) {
      expect(entry.code).toBe("permission_denied");
      expect(exit.code).toBe("permission_denied");
    }
  });
});
