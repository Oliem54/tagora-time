"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  listMfaFactorsForUi,
  postMfaAuditEvent,
  unenrollMfaFactor,
} from "@/app/lib/auth/mfa.client";
import { roleRequiresMandatoryMfa } from "@/app/lib/auth/mfa.shared";
import { getHomePathForRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";
import {
  buildAppSessionCookieWriteDebug,
  writeBrowserSessionCookie,
} from "@/app/lib/auth/session-cookie";

export default function AccountSecurityPage() {
  const router = useRouter();
  const { user, role, loading } = useCurrentAccess();
  const [factors, setFactors] = useState<
    Array<{ id: string; factor_type: string; status: string; friendly_name?: string | null }>
  >([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const mandatory = roleRequiresMandatoryMfa(role);

  const refreshFactors = useCallback(async () => {
    setListError(null);
    try {
      const rows = await listMfaFactorsForUi();
      setFactors(rows);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Impossible de charger les facteurs MFA.");
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      void refreshFactors();
    }
  }, [loading, user, refreshFactors]);

  const hasVerifiedMfa = factors.some(
    (f) =>
      (f.factor_type === "totp" || f.factor_type === "phone") && f.status === "verified"
  );

  async function refreshCookieFromSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    writeBrowserSessionCookie(session?.access_token ?? null);
    if (session?.access_token) {
      console.info(
        "[auth-cookie] MFA cookie refresh",
        buildAppSessionCookieWriteDebug(
          session.access_token,
          window.location.protocol === "https:"
        )
      );
    }
  }

  async function refreshSessionAfterLocal() {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn("[mfa] refreshSession after unenroll", error.message);
    }
    await refreshCookieFromSession();
  }

  async function handleUnenroll(factorId: string) {
    if (!window.confirm("Désactiver ce facteur de vérification pour ce compte ?")) {
      return;
    }
    setBusyId(factorId);
    setMessage("");
    setMessageType(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = await unenrollMfaFactor(factorId);
      if (error) {
        setMessage(error.message || "Désactivation impossible.");
        setMessageType("error");
        return;
      }
      await refreshSessionAfterLocal();
      await refreshFactors();
      void postMfaAuditEvent("mfa_disabled", session?.access_token ?? null);
      setMessage("Vérification en deux étapes désactivée.");
      setMessageType("success");
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !user || !role) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Sécurité du compte" />
          <SectionCard title="Chargement" subtitle="Accès au compte." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Sécurité du compte"
          subtitle="Vérification en deux étapes (texto ou Authenticator)."
          actions={
            <SecondaryButton type="button" onClick={() => router.push(getHomePathForRole(role))}>
              Retour
            </SecondaryButton>
          }
        />

        {mandatory ? (
          <SectionCard
            title="Rôle sensible"
            subtitle="La direction et les administrateurs doivent maintenir une authentification forte."
          >
            <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>
              Sans facteur TOTP vérifié, l’accès aux espaces direction et admin est bloqué après
              connexion.
            </p>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Vérification en deux étapes"
          subtitle="Par défaut : code SMS. Option avancée : Authenticator."
        >
          <div className="ui-stack-md">
            <AppCard tone="muted">
              <p style={{ margin: 0, fontWeight: 600 }}>
                Statut :{" "}
                <span style={{ color: hasVerifiedMfa ? "#0f766e" : "#b45309" }}>
                  {hasVerifiedMfa ? "activée" : "non activée"}
                </span>
              </p>
              {listError ? (
                <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 14 }}>{listError}</p>
              ) : null}
            </AppCard>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ui-space-3)" }}>
              <PrimaryButton type="button" onClick={() => router.push("/auth/mfa/setup")}>
                {hasVerifiedMfa ? "Ajouter ou remplacer (assistant)" : "Activer"}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => void refreshFactors()}>
                Actualiser
              </SecondaryButton>
            </div>

            {factors.length > 0 ? (
              <div className="ui-stack-sm">
                <h3 style={{ fontSize: 15, margin: 0 }}>Facteurs enregistrés</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {factors.map((f) => (
                    <li key={f.id} style={{ marginBottom: 8 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 13 }}>{f.id.slice(0, 8)}…</span>
                      {" · "}
                      {f.factor_type === "phone"
                        ? "Texto (SMS)"
                        : f.factor_type === "totp"
                          ? (f.friendly_name ?? "Authenticator")
                          : (f.friendly_name ?? f.factor_type)}{" · "}
                      <strong>{f.status}</strong>
                      {f.status === "verified" ? (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="ui-link-button"
                            style={{
                              color: "#b91c1c",
                              textDecoration: "underline",
                              cursor: busyId ? "wait" : "pointer",
                              background: "none",
                              border: "none",
                              padding: 0,
                              font: "inherit",
                            }}
                            disabled={Boolean(busyId)}
                            onClick={() => void handleUnenroll(f.id)}
                          >
                            Désactiver
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
              Les QR codes affichés dans TAGORA Time pour le pointage identifient une zone sur place ;
              ils ne servent pas à la connexion ni au MFA direction.
            </p>

            <FeedbackMessage message={message} type={messageType} />

            <Link href="https://supabase.com/docs/guides/auth/auth-mfa" style={{ fontSize: 13 }}>
              Documentation MFA Supabase
            </Link>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
