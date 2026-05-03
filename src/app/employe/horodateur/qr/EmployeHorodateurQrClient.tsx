"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";

type PublicValidate = {
  valid: boolean;
  zoneLabel?: string;
  requiresGps?: boolean;
  companyKey?: string;
  locationKey?: string | null;
};

type ContextOk = {
  ok: true;
  zone: {
    label: string;
    zoneKey: string;
    companyKey: string;
    companyLabel: string;
    locationKey: string | null;
    requiresGps: boolean;
  };
  employee: { fullName: string | null };
  currentState: {
    current_state?: string | null;
    status?: string | null;
    last_event_at?: string | null;
    last_event_type?: string | null;
  };
};

type ContextErr = {
  ok: false;
  message?: string;
  code?: string;
};

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("fr-CA", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function statusLine(currentState: ContextOk["currentState"]): string {
  const s =
    currentState.current_state ??
    currentState.status ??
    "hors_quart";
  if (s === "hors_quart") return "Non punché";
  const t = formatTime(currentState.last_event_at);
  if (s === "en_quart") return t ? `En quart depuis ${t}` : "En quart";
  if (s === "en_pause") return t ? `En pause depuis ${t}` : "En pause";
  if (s === "en_diner") return t ? `Au dîner depuis ${t}` : "Au dîner";
  if (s === "termine") return "Quart terminé";
  return s;
}

export default function EmployeHorodateurQrClient() {
  const router = useRouter();
  const params = useSearchParams();
  const zoneKey = (params.get("zone") ?? "").trim();
  const token = (params.get("token") ?? "").trim();

  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseTerrain = hasPermission("terrain");

  const [publicCheck, setPublicCheck] = useState<PublicValidate | null>(null);
  const [publicLoading, setPublicLoading] = useState(true);
  const [ctx, setCtx] = useState<ContextOk | ContextErr | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsHint, setGpsHint] = useState("");

  const loadPublic = useCallback(async () => {
    if (!zoneKey || !token) {
      setPublicCheck({ valid: false });
      return;
    }
    const u = new URL("/api/horodateur/qr/validate", window.location.origin);
    u.searchParams.set("zone", zoneKey);
    u.searchParams.set("token", token);
    const res = await fetch(u.toString());
    const j = (await res.json()) as PublicValidate;
    setPublicCheck(j);
  }, [zoneKey, token]);

  const loadContext = useCallback(async () => {
    if (!zoneKey || !token || !user) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setCtx({
        ok: false,
        message: "Session expirée. Reconnectez-vous.",
        code: "NO_SESSION",
      });
      return;
    }

    const u = new URL("/api/horodateur/qr/context", window.location.origin);
    u.searchParams.set("zone", zoneKey);
    u.searchParams.set("token", token);
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const j = (await res.json()) as ContextOk | ContextErr;
    setCtx(j);
  }, [zoneKey, token, user]);

  useEffect(() => {
    setPublicLoading(true);
    void loadPublic().finally(() => setPublicLoading(false));
  }, [loadPublic]);

  useEffect(() => {
    if (accessLoading || !user || !canUseTerrain) return;
    setCtxLoading(true);
    void loadContext().finally(() => setCtxLoading(false));
  }, [accessLoading, user, canUseTerrain, loadContext]);

  useEffect(() => {
    if (accessLoading || user) return;
    router.push("/employe/login");
  }, [accessLoading, router, user]);

  const needsGps = ctx && ctx.ok && ctx.zone.requiresGps;
  const gpsReady = !needsGps || (gpsLat != null && gpsLng != null);

  const canPunch = useMemo(() => {
    if (!ctx || !ctx.ok) return false;
    return gpsReady;
  }, [ctx, gpsReady]);

  function requestGps() {
    setGpsHint("");
    if (!navigator.geolocation) {
      setGpsHint("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
      },
      () => {
        setGpsHint("Impossible d’obtenir la position. Vérifiez les permissions du navigateur.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function postPunch(
    eventType: "punch_in" | "punch_out",
    options?: { acknowledgeLongLeave?: boolean }
  ) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    setSaving(true);
    setMessage("");
    try {
      const body: Record<string, unknown> = {
        eventType,
        qr: {
          zoneKey,
          token,
          ...(gpsLat != null && gpsLng != null
            ? { latitude: gpsLat, longitude: gpsLng }
            : {}),
        },
        acknowledgeLongLeavePunch: options?.acknowledgeLongLeave === true,
      };

      const response = await fetch("/api/horodateur/punch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = await response.json();

      if (response.status === 409 && payload?.code === "LONG_LEAVE_CONFIRMATION_REQUIRED") {
        const msg =
          typeof payload.error === "string"
            ? payload.error
            : "Vous êtes en congé prolongé. Voulez-vous quand même pointer ?";
        if (window.confirm(msg)) {
          await postPunch(eventType, { acknowledgeLongLeave: true });
        }
        return;
      }

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Pointage impossible."
        );
      }

      const ev = payload.insertedEvent as { occurred_at?: string } | undefined;
      const at = formatTime(ev?.occurred_at);
      setMessage(
        eventType === "punch_in"
          ? at
            ? `Entrée enregistrée à ${at}.`
            : "Entrée enregistrée."
          : at
            ? `Sortie enregistrée à ${at}.`
            : "Sortie enregistrée."
      );
      await loadContext();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setSaving(false);
    }
  }

  if (!zoneKey || !token) {
    return (
      <main className="page-container">
        <HeaderTagora title="TAGORA Time" subtitle="Pointage QR" />
        <AccessNotice description="Lien incomplet : zone ou jeton manquant." />
        <p style={{ marginTop: 16 }}>
          <Link href="/employe/horodateur">Horodateur</Link>
        </p>
      </main>
    );
  }

  if (accessLoading || publicLoading) {
    return (
      <main className="page-container">
        <HeaderTagora title="TAGORA Time" subtitle="Pointage QR" />
        <AccessNotice description="Chargement…" />
      </main>
    );
  }

  if (publicCheck && !publicCheck.valid) {
    return (
      <main className="page-container">
        <HeaderTagora title="TAGORA Time" subtitle="Pointage QR" />
        <AccessNotice description="Code QR invalide ou expiré." />
        <p style={{ marginTop: 16 }}>
          <Link href="/employe/horodateur">Retour à l’horodateur</Link>
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-container">
        <HeaderTagora title="TAGORA Time" subtitle="Pointage QR" />
        <AccessNotice description="Connexion…" />
      </main>
    );
  }

  if (!canUseTerrain) {
    return (
      <main className="page-container">
        <HeaderTagora title="TAGORA Time" subtitle="Pointage QR" />
        <AccessNotice description="La permission terrain est requise pour pointer." />
      </main>
    );
  }

  if (ctxLoading || ctx == null) {
    return (
      <main className="page-container">
        <HeaderTagora title="TAGORA Time" subtitle="Pointage QR" />
        <AccessNotice description="Vérification du QR…" />
      </main>
    );
  }

  if (!ctx.ok) {
    return (
      <main className="page-container">
        <HeaderTagora title="TAGORA Time" subtitle="Pointage QR" />
        <AccessNotice description={ctx.message ?? "Accès impossible."} />
        <p style={{ marginTop: 16 }}>
          <Link href="/employe/horodateur">Retour à l’horodateur</Link>
        </p>
      </main>
    );
  }

  const displayName = ctx.employee.fullName?.trim();

  return (
    <main className="page-container" style={{ paddingBottom: 48 }}>
      <HeaderTagora title="TAGORA Time" subtitle="Pointage QR" />

      <section className="tagora-panel" style={{ marginTop: 20 }}>
        <h1 style={{ fontSize: "1.35rem", margin: "0 0 12px" }}>
          Bonjour{displayName ? ` ${displayName}` : ""}
        </h1>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.5 }}>
          Zone reconnue : <strong>{ctx.zone.label}</strong>
          <br />
          Compagnie : {ctx.zone.companyLabel}
          {ctx.zone.locationKey ? (
            <>
              <br />
              Lieu : {ctx.zone.locationKey}
            </>
          ) : null}
        </p>
        <p
          style={{
            margin: "14px 0 0",
            fontSize: 13,
            color: "#64748b",
            lineHeight: 1.55,
          }}
        >
          Ce QR code désigne l’emplacement ou la zone de punch seulement. Votre session TAGORA Time
          confirme votre identité employé ; il n’est pas utilisé pour la direction, l’administration
          ni la vérification en deux étapes (MFA).
        </p>
      </section>

      <section className="tagora-panel-muted" style={{ marginTop: 16, padding: 16 }}>
        <div className="tagora-label">Statut actuel</div>
        <div style={{ marginTop: 8, fontWeight: 700, fontSize: "1.1rem" }}>
          {statusLine(ctx.currentState)}
        </div>
      </section>

      {needsGps ? (
        <section className="tagora-panel" style={{ marginTop: 16 }}>
          <p style={{ marginTop: 0 }}>
            Cette zone exige votre position. Autorisez la géolocalisation avant de pointer.
          </p>
          {!gpsReady ? (
            <PrimaryButton type="button" onClick={requestGps}>
              Activer la position
            </PrimaryButton>
          ) : (
            <p className="tagora-note">Position obtenue.</p>
          )}
          {gpsHint ? (
            <p style={{ color: "#b91c1c", marginTop: 12 }}>{gpsHint}</p>
          ) : null}
        </section>
      ) : null}

      {message ? (
        <AccessNotice title="Information" description={message} />
      ) : null}

      <div
        style={{
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <PrimaryButton
          type="button"
          disabled={!canPunch || saving}
          onClick={() => void postPunch("punch_in")}
        >
          {saving ? "Enregistrement…" : "Punch in"}
        </PrimaryButton>
        <PrimaryButton
          type="button"
          disabled={!canPunch || saving}
          onClick={() => void postPunch("punch_out")}
        >
          {saving ? "Enregistrement…" : "Punch out"}
        </PrimaryButton>
      </div>

      <p style={{ marginTop: 24 }}>
        <Link href="/employe/horodateur">Horodateur complet</Link>
      </p>
    </main>
  );
}
