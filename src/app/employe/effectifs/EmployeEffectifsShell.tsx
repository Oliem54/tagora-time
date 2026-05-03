"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import type { MonHorairePayload } from "@/app/lib/employe-mon-horaire.types";
import DirectionEffectifsClient from "@/app/direction/effectifs/DirectionEffectifsClient";
import EmployeMonHorairePanel from "./EmployeMonHorairePanel";
import EmployeTeamPanel from "./EmployeTeamPanel";

type EmployeTab = "mon_horaire" | "equipe" | "couverture";

export default function EmployeEffectifsShell() {
  const router = useRouter();
  const { user, role, loading: accessLoading } = useCurrentAccess();
  const [tab, setTab] = useState<EmployeTab>("mon_horaire");
  const [payload, setPayload] = useState<MonHorairePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessLoading && user && role && role !== "employe") {
      router.replace("/direction/effectifs");
    }
  }, [accessLoading, user, role, router]);

  const loadMonHoraire = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoadError("Session expirée.");
        setPayload(null);
        return;
      }
      const res = await fetch("/api/employe/effectifs/mon-horaire", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<MonHorairePayload>;

      if (!res.ok) {
        setLoadError(typeof json.error === "string" ? json.error : "Chargement impossible.");
        setPayload(null);
        return;
      }

      if (typeof json.employeeId === "number") {
        setPayload(json as MonHorairePayload);
      } else {
        setLoadError("Réponse inattendue du serveur.");
        setPayload(null);
      }
    } catch {
      setLoadError("Erreur réseau.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accessLoading && user && role === "employe") {
      void loadMonHoraire();
    }
  }, [accessLoading, user, role, loadMonHoraire]);

  if (accessLoading) {
    return <TagoraLoadingScreen isLoading message="Chargement…" fullScreen />;
  }

  if (!user) {
    return null;
  }

  if (role !== "employe") {
    return <TagoraLoadingScreen isLoading message="Redirection…" fullScreen />;
  }

  const tabBtn = (id: EmployeTab, label: string) => {
    const active = tab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        style={{
          borderRadius: 14,
          padding: "10px 16px",
          fontWeight: 800,
          fontSize: "0.88rem",
          border: active ? "1px solid rgba(59,130,246,0.45)" : "1px solid #e2e8f0",
          background: active ? "rgba(239,246,255,0.95)" : "#fff",
          color: active ? "#1e3a8a" : "#475569",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="tagora-app-shell"
      style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" }}
    >
      <div
        className="tagora-app-content ui-stack-lg mx-auto w-full px-4 pb-16 pt-4 sm:px-6"
        style={{ maxWidth: tab === "couverture" ? 1500 : 900 }}
      >
        <AuthenticatedPageHeader
          title="Effectifs"
          subtitle="Horaire personnel, équipe et couverture"
          showNavigation={false}
          showUserIdentity
          compact
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {tabBtn("mon_horaire", "Mon horaire")}
          {tabBtn("equipe", "Mon équipe")}
          {tabBtn("couverture", "Couverture globale")}
        </div>

        {tab === "couverture" ? (
          <div
            style={{
              marginTop: 20,
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid #e2e8f0",
              background: "#fff",
            }}
          >
            <DirectionEffectifsClient readOnly />
          </div>
        ) : loading ? (
          <TagoraLoadingScreen isLoading message="Chargement de votre horaire…" fullScreen={false} />
        ) : loadError ? (
          <p style={{ color: "#b91c1c", marginTop: 20 }}>{loadError}</p>
        ) : payload ? (
          <div style={{ marginTop: 20 }}>
            {tab === "mon_horaire" ? <EmployeMonHorairePanel data={payload} /> : null}
            {tab === "equipe" ? <EmployeTeamPanel data={payload} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
