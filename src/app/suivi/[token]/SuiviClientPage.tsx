"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DELIVERY_TRACKING_REFRESH_MS,
  getDeliveryStatusLabel,
  getDeliveryTrackingMapUrl,
} from "@/app/lib/delivery-tracking";

type TrackingPayload = {
  client: string | null;
  companyLabel: string;
  adresse: string | null;
  dateLivraison: string | null;
  heurePrevue: string | null;
  statut: string | null;
  statutLabel: string;
  chauffeur: string | null;
  vehicule: string | null;
  position: {
    latitude: number;
    longitude: number;
    recordedAt: string | null;
    gpsStatus: string | null;
    activityLabel: string | null;
    speedKmh: number;
    sourceLabel: string | null;
  } | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-CA");
}

function getStatusTone(status: string | null) {
  if (status === "livree" || status === "arrive") {
    return {
      background: "rgba(34, 197, 94, 0.14)",
      color: "#166534",
      border: "1px solid rgba(34, 197, 94, 0.24)",
    };
  }

  if (status === "en_cours") {
    return {
      background: "rgba(37, 99, 235, 0.12)",
      color: "#1d4ed8",
      border: "1px solid rgba(37, 99, 235, 0.18)",
    };
  }

  if (status === "probleme") {
    return {
      background: "rgba(239, 68, 68, 0.12)",
      color: "#b91c1c",
      border: "1px solid rgba(239, 68, 68, 0.18)",
    };
  }

  return {
    background: "rgba(148, 163, 184, 0.14)",
    color: "#334155",
    border: "1px solid rgba(148, 163, 184, 0.18)",
  };
}

export default function SuiviClientPage({ token }: { token: string }) {
  const [payload, setPayload] = useState<TrackingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const loadTracking = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      try {
        const response = await fetch(`/api/suivi/${token}`, {
          cache: "no-store",
        });

        const json = (await response.json()) as TrackingPayload & { error?: string };

        if (!response.ok) {
          throw new Error(json.error || "Lien de suivi indisponible.");
        }

        setPayload(json);
        setErrorMessage("");
        setLastRefresh(new Date().toISOString());
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Erreur de suivi temporaire."
        );
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTracking();

    const interval = window.setInterval(() => {
      void loadTracking(true);
    }, DELIVERY_TRACKING_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadTracking]);

  const mapUrl = getDeliveryTrackingMapUrl(
    payload?.position?.latitude,
    payload?.position?.longitude
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px 20px 56px",
        background:
          "linear-gradient(180deg, rgba(239,244,255,0.9) 0%, rgba(248,250,252,1) 38%, rgba(255,255,255,1) 100%)",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 20 }}>
        <section
          style={{
            background:
              "linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(30,64,175,0.88) 100%)",
            borderRadius: 24,
            padding: "28px 28px 30px",
            color: "#f8fafc",
            boxShadow: "0 24px 50px rgba(15, 23, 42, 0.14)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.74 }}>
                Suivi livraison
              </div>
              <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3.2rem)", lineHeight: 1.02 }}>
                {payload?.client || "Livraison en direct"}
              </h1>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 17,
                  fontWeight: 600,
                  color: "rgba(248, 250, 252, 0.95)",
                }}
              >
                {payload?.companyLabel ? `Livraison par ${payload.companyLabel}` : "\u00a0"}
              </p>
              <p style={{ margin: 0, color: "rgba(226, 232, 240, 0.82)", maxWidth: 680 }}>
                Consultez la progression de votre livraison en temps reel. La position est
                rafraichie automatiquement toutes les 8 secondes.
              </p>
            </div>
            <div
              style={{
                ...getStatusTone(payload?.statut ?? null),
                alignSelf: "flex-start",
                borderRadius: 999,
                padding: "10px 16px",
                fontWeight: 700,
                backgroundColor: "rgba(255,255,255,0.12)",
                color: "#ffffff",
              }}
            >
              {payload?.statutLabel || getDeliveryStatusLabel(null)}
            </div>
          </div>
        </section>

        {errorMessage ? (
          <section className="tagora-panel">
            <h2 className="section-title" style={{ marginBottom: 8 }}>
              Suivi temporairement indisponible
            </h2>
            <p className="tagora-note">{errorMessage}</p>
          </section>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.95fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <div className="tagora-panel" style={{ minHeight: 480, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <h2 className="section-title" style={{ marginBottom: 6 }}>
                  Position GPS
                </h2>
                <p className="tagora-note">
                  {payload?.position
                    ? `Derniere mise a jour : ${formatDateTime(payload.position.recordedAt)}`
                    : "La position GPS n est pas encore disponible pour cette livraison."}
                </p>
              </div>
              <div className="tagora-note">Actualise le {formatDateTime(lastRefresh)}</div>
            </div>

            {mapUrl ? (
              <iframe
                src={mapUrl}
                title="Carte de suivi livraison"
                loading="lazy"
                style={{
                  width: "100%",
                  minHeight: 390,
                  border: 0,
                  borderRadius: 20,
                  background: "#e2e8f0",
                }}
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div
                style={{
                  minHeight: 390,
                  borderRadius: 20,
                  display: "grid",
                  placeItems: "center",
                  background:
                    "radial-gradient(circle at top, rgba(191,219,254,0.5), rgba(241,245,249,0.95))",
                  color: "#475569",
                  textAlign: "center",
                  padding: 24,
                }}
              >
                {loading ? "Chargement de la carte..." : "La carte apparaitra des qu une position GPS sera disponible."}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <InfoCard label="Adresse" value={payload?.adresse || "-"} />
            <InfoCard label="Chauffeur" value={payload?.chauffeur || "-"} />
            <InfoCard label="Vehicule" value={payload?.vehicule || "-"} />
            <InfoCard
              label="Latitude / Longitude"
              value={
                payload?.position
                  ? `${payload.position.latitude.toFixed(5)}, ${payload.position.longitude.toFixed(5)}`
                  : "-"
              }
            />
            <InfoCard label="Statut livraison" value={payload?.statutLabel || "-"} />
            <InfoCard
              label="Statut GPS"
              value={payload?.position?.gpsStatus || payload?.position?.activityLabel || "-"}
            />
            <InfoCard
              label="Heure prevue"
              value={`${payload?.dateLivraison || "-"} ${payload?.heurePrevue || ""}`.trim()}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="tagora-panel" style={{ margin: 0 }}>
      <div className="tagora-label">{label}</div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
        {value}
      </div>
    </div>
  );
}
