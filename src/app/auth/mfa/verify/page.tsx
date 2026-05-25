"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedbackMessage from "@/app/components/FeedbackMessage";
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
  const autoSmsAttemptedRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const sendPhoneChallengeForFactor = useCallback(async (factorId: string) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setMessageType(null);
    try {
      const { data: ch, error: chErr } = await challengePhoneMfa(factorId);
      if (chErr || !ch?.id) {
        const codeErr = readErrCode(chErr);
        console.warn("[mfa] sms_challenge_failed", { code: codeErr ?? "unknown" });
        setMessage(
          describeSupabaseMfaPhoneError(
            codeErr,
            chErr?.message ?? "Impossible d’envoyer le texto."
          )
        );
        setMessageType("error");
        return false;
      }
      setChallengeId(ch.id);
      console.info("[mfa] sms_challenge_requested");
      setMessage(
        "Un code a été demandé par texto. Saisissez les 6 chiffres reçus. Si rien n’arrive sous 2 minutes, utilisez « Renvoyer un code »."
      );
      setMessageType("success");
      return true;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

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

      const usePhone = preferred.kind === "phone" && Boolean(phone);
      setPhoneFactorId(phone?.id ?? null);
      setTotpFactorId(totp?.id ?? null);
      setMode(usePhone ? "phone" : "totp");

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (loading || mode !== "phone" || !phoneFactorId || autoSmsAttemptedRef.current) {
      return;
    }
    autoSmsAttemptedRef.current = true;
    void sendPhoneChallengeForFactor(phoneFactorId);
  }, [loading, mode, phoneFactorId, sendPhoneChallengeForFactor]);

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
    if (!phoneFactorId) return;
    await sendPhoneChallengeForFactor(phoneFactorId);
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

      {
        const {
          data: { session: postSession },
        } = await supabase.auth.getSession();
        void postMfaAuditEvent("mfa_verify_succeeded", postSession?.access_token ?? null);
      }

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
      <main className="ui-auth-shell mfa-verify-page">
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
    <main className="ui-auth-shell mfa-verify-page">
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
                {challengeId ? "Renvoyer un code par texto" : "Envoyer un code par texto"}
              </PrimaryButton>
              {challengeId ? (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  Un code vient d’être envoyé par texto au numéro configuré. Saisissez les 6
                  chiffres reçus. Sur mobile, le code peut parfois s’insérer automatiquement.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  Aucun code SMS actif pour le moment. Cliquez sur « Envoyer un code par texto » pour
                  recevoir un code.
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

        <SectionCard title="Saisie du code">
          <form className="ui-stack-md mfa-otp-code-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="mfa-otp-code-field">
              <label className="mfa-otp-code-label" htmlFor="mfa-verify-otp-input">
                Code à 6 chiffres
              </label>
              <input
                id="mfa-verify-otp-input"
                name="mfa-verify-otp"
                className="mfa-otp-code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={8}
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={!activeFactorId}
              />
            </div>
            <div className="mfa-otp-code-actions">
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
