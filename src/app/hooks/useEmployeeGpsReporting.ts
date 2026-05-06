"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabase/client";
import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";

export type EmployeeGpsTrackingStatus =
  | "idle"
  | "unsupported"
  | "requesting"
  | "active"
  | "denied"
  | "error";

type Options = {
  enabled: boolean;
  companyContext: AccountRequestCompany | null;
  /** Page id for server metadata only */
  pageSource: string;
  minIntervalMs?: number;
};

/**
 * Envoie la position au tableau direction via POST /api/gps/positions pendant que la page est ouverte.
 */
export function useEmployeeGpsReporting(options: Options) {
  const { enabled, companyContext, pageSource, minIntervalMs = 25000 } = options;
  const [status, setStatus] = useState<EmployeeGpsTrackingStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const lastSentRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }

    setStatus("requesting");
    setLastError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("active");
        setLastError(null);

        const now = Date.now();
        if (now - lastSentRef.current < minIntervalMs) {
          return;
        }
        lastSentRef.current = now;

        void (async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) {
            return;
          }

          const latitude = pos.coords.latitude;
          const longitude = pos.coords.longitude;
          const speedKmh =
            pos.coords.speed != null && Number.isFinite(pos.coords.speed)
              ? Math.abs(pos.coords.speed) * 3.6
              : 0;

          try {
            const res = await fetch("/api/gps/positions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                latitude,
                longitude,
                speed_kmh: speedKmh,
                gps_status: speedKmh >= 5 ? "deplacement" : "actif",
                company_context: companyContext,
                metadata: {
                  accuracy_m: pos.coords.accuracy,
                  source: "employee_web_watch",
                  page: pageSource,
                },
              }),
            });

            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              const msg =
                typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
              setLastError(msg);
              setStatus("error");
            }
          } catch (e) {
            setLastError(e instanceof Error ? e.message : "Erreur reseau GPS");
            setStatus("error");
          }
        })();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setLastError("Permission de localisation refusee.");
        } else {
          setStatus("error");
          setLastError(err.message);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 60000,
      }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, companyContext, minIntervalMs, pageSource]);

  return { status, lastError };
}
