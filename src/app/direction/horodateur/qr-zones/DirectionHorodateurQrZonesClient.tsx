"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import { PUNCH_ZONE_COMPANY_KEYS } from "@/app/lib/horodateur-qr-punch.shared";

type ZoneRow = {
  id: string;
  zone_key: string;
  label: string;
  company_key: string;
  location_key: string | null;
  active: boolean;
  requires_gps: boolean;
  latitude: string | number | null;
  longitude: string | number | null;
  radius_meters: number | null;
  created_at?: string;
  updated_at?: string;
};

export default function DirectionHorodateurQrZonesClient() {
  const { loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseTerrain = hasPermission("terrain");
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [zoneKey, setZoneKey] = useState("");
  const [label, setLabel] = useState("");
  const [companyKey, setCompanyKey] = useState<string>("all");
  const [locationKey, setLocationKey] = useState("");
  const [requiresGps, setRequiresGps] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("150");
  const [saving, setSaving] = useState(false);

  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/direction/horodateur/punch-zones", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = (await res.json()) as { zones?: ZoneRow[]; error?: string };
      if (!res.ok) {
        setError(j.error ?? "Erreur chargement.");
        return;
      }
      setZones(Array.isArray(j.zones) ? j.zones : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!qrUrl) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(qrUrl, { width: 280, margin: 2 }).then(setQrDataUrl);
  }, [qrUrl]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/direction/horodateur/punch-zones", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          zone_key: zoneKey.trim(),
          label: label.trim(),
          company_key: companyKey,
          location_key: locationKey.trim() || null,
          requires_gps: requiresGps,
          latitude: requiresGps ? Number(lat) : null,
          longitude: requiresGps ? Number(lng) : null,
          radius_meters: requiresGps ? Number(radius) : null,
        }),
      });
      const j = (await res.json()) as {
        plainToken?: string;
        qrUrl?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(j.error ?? "Création impossible.");
        return;
      }
      setPlainToken(typeof j.plainToken === "string" ? j.plainToken : null);
      setQrUrl(typeof j.qrUrl === "string" ? j.qrUrl : null);
      setMessage(j.message ?? "Zone créée.");
      setZoneKey("");
      setLabel("");
      setLocationKey("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function patchZone(
    id: string,
    payload: Record<string, unknown>
  ): Promise<{ plainToken?: string; qrUrl?: string; message?: string } | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch(`/api/direction/horodateur/punch-zones/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const j = (await res.json()) as {
      plainToken?: string;
      qrUrl?: string;
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      setError(j.error ?? "Mise à jour impossible.");
      return null;
    }
    return j;
  }

  async function toggleActive(z: ZoneRow) {
    setError("");
    await patchZone(z.id, { active: !z.active });
    await load();
  }

  async function regenerateToken(z: ZoneRow) {
    if (!window.confirm("Régénérer le jeton ? Les anciens QR codes cesseront de fonctionner.")) {
      return;
    }
    setError("");
    const out = await patchZone(z.id, { regenerate_token: true });
    if (out?.plainToken && out.qrUrl) {
      setPlainToken(out.plainToken);
      setQrUrl(out.qrUrl);
      setMessage(out.message ?? "Jeton régénéré.");
    }
    await load();
  }

  const companyOptions = useMemo(() => PUNCH_ZONE_COMPANY_KEYS, []);

  if (accessLoading) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <SectionCard title="Chargement" />
        </div>
      </main>
    );
  }

  if (!canUseTerrain) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <SectionCard title="Accès" subtitle="Permission terrain requise." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Zones de punch QR"
          subtitle="Générez des codes pour pointer depuis un téléphone."
          showNavigation={false}
          actions={
            <Link href="/direction/horodateur" className="tagora-dark-outline-action">
              Retour horodateur
            </Link>
          }
        />

        {error ? (
          <p className="tagora-note" style={{ color: "var(--tagora-danger, #b91c1c)" }}>
            {error}
          </p>
        ) : null}
        {message ? <p className="tagora-note">{message}</p> : null}

        {plainToken && qrUrl ? (
          <SectionCard title="Jeton et QR" subtitle="Conservez ces informations dans un endroit sûr.">
            <p style={{ wordBreak: "break-all", fontSize: "0.9rem" }}>
              <strong>Lien :</strong> {qrUrl}
            </p>
            <p style={{ wordBreak: "break-all", fontSize: "0.9rem" }}>
              <strong>Jeton (copie unique) :</strong> {plainToken}
            </p>
            {qrDataUrl ? (
              <div style={{ marginTop: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code punch" width={280} height={280} />
                <div style={{ marginTop: 12 }}>
                  <a
                    href={qrDataUrl}
                    download="tagora-punch-qr.png"
                    className="tagora-dark-outline-action"
                  >
                    Télécharger le QR (PNG)
                  </a>
                </div>
              </div>
            ) : (
              <p className="tagora-note">Génération du QR…</p>
            )}
          </SectionCard>
        ) : null}

        <SectionCard title="Nouvelle zone" subtitle="Clé unique (ex. oliem_entrepot).">
          <form onSubmit={submitCreate} className="ui-stack-md" style={{ maxWidth: 480 }}>
            <label className="ui-stack-xs">
              <span className="tagora-label">zone_key</span>
              <input
                className="tagora-input"
                value={zoneKey}
                onChange={(e) => setZoneKey(e.target.value)}
                placeholder="oliem_entrepot"
                required
              />
            </label>
            <label className="ui-stack-xs">
              <span className="tagora-label">Libellé</span>
              <input
                className="tagora-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </label>
            <label className="ui-stack-xs">
              <span className="tagora-label">Compagnie</span>
              <select
                className="tagora-input"
                value={companyKey}
                onChange={(e) => setCompanyKey(e.target.value)}
              >
                {companyOptions.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-stack-xs">
              <span className="tagora-label">Lieu (optionnel)</span>
              <input
                className="tagora-input"
                value={locationKey}
                onChange={(e) => setLocationKey(e.target.value)}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={requiresGps}
                onChange={(e) => setRequiresGps(e.target.checked)}
              />
              Géolocalisation obligatoire
            </label>
            {requiresGps ? (
              <>
                <label className="ui-stack-xs">
                  <span className="tagora-label">Latitude</span>
                  <input
                    className="tagora-input"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    inputMode="decimal"
                    required={requiresGps}
                  />
                </label>
                <label className="ui-stack-xs">
                  <span className="tagora-label">Longitude</span>
                  <input
                    className="tagora-input"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    inputMode="decimal"
                    required={requiresGps}
                  />
                </label>
                <label className="ui-stack-xs">
                  <span className="tagora-label">Rayon (m)</span>
                  <input
                    className="tagora-input"
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                    inputMode="numeric"
                    required={requiresGps}
                  />
                </label>
              </>
            ) : null}
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Création…" : "Créer la zone"}
            </PrimaryButton>
          </form>
        </SectionCard>

        <SectionCard title="Zones existantes" subtitle={loading ? "Chargement…" : undefined}>
          {zones.length === 0 && !loading ? (
            <p className="tagora-note">Aucune zone.</p>
          ) : (
            <ul className="ui-stack-md" style={{ listStyle: "none", padding: 0 }}>
              {zones.map((z) => (
                <li
                  key={z.id}
                  className="tagora-panel-muted"
                  style={{ padding: 16, borderRadius: 8 }}
                >
                  <div style={{ fontWeight: 700 }}>{z.label}</div>
                  <div className="tagora-note" style={{ fontSize: "0.9rem" }}>
                    {z.zone_key} · {z.company_key}
                    {z.active ? "" : " · inactive"}
                    {z.requires_gps ? " · GPS" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    <SecondaryButton type="button" onClick={() => void toggleActive(z)}>
                      {z.active ? "Désactiver" : "Activer"}
                    </SecondaryButton>
                    <SecondaryButton type="button" onClick={() => void regenerateToken(z)}>
                      Régénérer le jeton
                    </SecondaryButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
