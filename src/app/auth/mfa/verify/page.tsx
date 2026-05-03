"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import FormField from "@/app/components/ui/FormField";
import PageHeader from "@/app/components/ui/PageHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import {
  challengeAndVerifyTotp,
  challengePhoneMfa,
  listMfaFactorsForUi,
  pickPreferredVerifiedMfaFactor,
  postMfaAuditEvent,
  refreshSessionAfterMfa,
  resetMfaVerifyFailureTracking,
  trackMfaVerifyFailureForAlerts,
  verifyMfaWithChallenge,
} from "@/app/lib/auth/mfa.client";
import { describeSupabaseMfaPhoneError } from "@/app/lib/auth/mfa-phone.shared";
import { getHomePathForRole, getUserRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";
import {
  buildAppSessionCookieWriteDebug,
  writeBrowserSessionCookie,
} from "@/app/lib/auth/session-cookie";

export default function MfaVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPathRaw = searchParams.get("next");

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"phone" | "totp">("phone");
  const [phoneFactorId, setPhoneFactorId] = useState<string | null>(null);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/direction/login");
        return;
      }

      const preferred = await pickPreferredVerifiedMfaFactor();
      if (cancelled) return;
      if (!preferred) {
        router.replace("/auth/mfa/setup?required=1");
        return;
      }

      const listed = await listMfaFactorsForUi();
      if (cancelled) return;

      const phone = listed.find((f) => f.factor_type === "phone" && f.status === "verified");
      const totp = listed.find((f) => f.factor_type === "totp" && f.status === "verified");

      setPhoneFactorId(phone?.id ?? null);
      setTotpFactorId(totp?.id ?? null);
      setMode(preferred.kind === "phone" && phone ? "phone" : "totp");

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function syncCookie() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    writeBrowserSessionCookie(session?.access_token ?? null);
    if (session?.access_token) {
      console.info(
        "[auth-cookie] post-verify MFA cookie",
        buildAppSessionCookieWriteDebug(
          session.access_token,
          window.location.protocol === "https:"
        )
      );
    }
  }

  function readErrCode(e: unknown): string | undefined {
    if (typeof e === "object" && e !== null && "code" in e) {
      const c = (e as { code?: unknown }).code;
      return typeof c === "string" ? c : undefined;
    }
    return undefined;
  }

  function resolveNextHref(role: ReturnType<typeof getUserRole>): string {
    if (
      typeof nextPathRaw === "string" &&
      nextPathRaw.startsWith("/") &&
      !nextPathRaw.startsWith("//")
    ) {
      return nextPathRaw;
    }
    return role ? getHomePathForRole(role) : "/direction/dashboard";
  }

  async function sendPhoneChallenge() {
    if (!phoneFactorId || busy) return;
    setBusy(true);
    setMessage("");
    setMessageType(null);
    try {
      const { data: ch, error: chErr } = await challengePhoneMfa(phoneFactorId);
      if (chErr || !ch?.id) {
        const codeErr = readErrCode(chErr);
        setMessage(
          describeSupabaseMfaPhoneError(
            codeErr,
            chErr?.message ?? "Impossible d’envoyer le texto."
          )
        );
        setMessageType("error");
        return;
      }
      setChallengeId(ch.id);
      setMessage("Si votre ligne accepte les texto, un code vient d’être envoyé.");
      setMessageType("success");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const factorId = mode === "phone" ? phoneFactorId : totpFactorId;
    if (!factorId || busy) return;
    const trimmed = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setMessage("Entrez un code à 6 chiffres.");
      setMessageType("error");
      return;
    }

    setBusy(true);
    setMessage("");
    setMessageType(null);
    try {
      if (mode === "phone") {
        if (!challengeId) {
          setMessage("Envoyez d’abord un code par texto.");
          setMessageType("error");
          setBusy(false);
          return;
        }
        const { error } = await verifyMfaWithChallenge({
          factorId,
          challengeId,
          code: trimmed,
        });
        if (error) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          void postMfaAuditEvent("mfa_verify_failed", session?.access_token ?? null);
          trackMfaVerifyFailureForAlerts(session?.access_token ?? null);
          const c = readErrCode(error);
          setMessage(describeSupabaseMfaPhoneError(c, error.message || "Code invalide."));
          setMessageType("error");
          return;
        }
      } else {
        const { error } = await challengeAndVerifyTotp(factorId, trimmed);
        if (error) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          void postMfaAuditEvent("mfa_verify_failed", session?.access_token ?? null);
          trackMfaVerifyFailureForAlerts(session?.access_token ?? null);
          setMessage(
            typeof error === "object" && error && "message" in error && typeof error.message === "string"
              ? error.message
              : "Code invalide."
          );
          setMessageType("error");
          return;
        }
      }

      resetMfaVerifyFailureTracking();

      const refresh = await refreshSessionAfterMfa();
      if (refresh.error) {
        console.warn("[mfa] refreshSession verify", refresh.error.message);
      }
      await syncCookie();

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("tagora_mfa_gate_audit");
      }

      const { data: userData } = await supabase.auth.getUser();
      const role = getUserRole(userData.user);
      router.replace(resolveNextHref(role));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="ui-auth-shell">
        <div className="ui-auth-content">
          <PageHeader title="Vérification en deux étapes" subtitle="Chargement…" compact />
        </div>
      </main>
    );
  }

  const activeFactorId = mode === "phone" ? phoneFactorId : totpFactorId;
  const canSwitchToTotp = Boolean(totpFactorId && phoneFactorId);
  const canSwitchToPhone = Boolean(phoneFactorId && totpFactorId);

  return (
    <main className="ui-auth-shell">
      <div className="ui-auth-content ui-stack-lg">
        <PageHeader
          title="Vérification en deux étapes"
          subtitle={
            mode === "phone"
              ? "Confirmez votre identité avec un code envoyé par texto."
              : "Entrez le code affiché dans votre application Authenticator."
          }
          compact
        />

        {mode === "phone" && phoneFactorId ? (
          <SectionCard title="Code par texto">
            <div className="ui-stack-md">
              <PrimaryButton type="button" disabled={busy} onClick={() => void sendPhoneChallenge()}>
                Envoyer un code par texto
              </PrimaryButton>
              {challengeId ? (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  Code demandé. Saisissez les 6 chiffres reçus.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  Nous enverrons un SMS au numéro configuré pour votre compte.
                </p>
              )}
            </div>
          </SectionCard>
        ) : null}

        {mode === "totp" && totpFactorId ? (
          <SectionCard title="Application Authenticator">
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
              Option avancée : ce flux utilise une application Authenticator, pas le pointage QR
              horodateur.
            </p>
          </SectionCard>
        ) : null}

        <SectionCard title="Code à 6 chiffres">
          <form className="ui-stack-md" onSubmit={(e) => void onSubmit(e)}>
            <FormField label="Code">
              <input
                className="ui-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={!activeFactorId}
              />
            </FormField>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <PrimaryButton type="submit" disabled={busy || !activeFactorId}>
                Vérifier
              </PrimaryButton>
              <SecondaryButton type="button" disabled={busy} onClick={() => router.push("/account/security")}>
                Sécurité du compte
              </SecondaryButton>
            </div>
          </form>
        </SectionCard>

        {canSwitchToTotp && mode === "phone" ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            <button
              type="button"
              className="ui-link-button"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--ui-color-link, #2563eb)",
                textDecoration: "underline",
                font: "inherit",
              }}
              onClick={() => {
                setMode("totp");
                setChallengeId(null);
                setCode("");
                setMessage("");
                setMessageType(null);
              }}
            >
              Utiliser l’application Authenticator à la place
            </button>
          </p>
        ) : null}

        {canSwitchToPhone && mode === "totp" ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            <button
              type="button"
              className="ui-link-button"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--ui-color-link, #2563eb)",
                textDecoration: "underline",
                font: "inherit",
              }}
              onClick={() => {
                setMode("phone");
                setChallengeId(null);
                setCode("");
                setMessage("");
                setMessageType(null);
              }}
            >
              Revenir au code par texto
            </button>
          </p>
        ) : null}

        <FeedbackMessage message={message} type={messageType} />
      </div>
    </main>
  );
}
