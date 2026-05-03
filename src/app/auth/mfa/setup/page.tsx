"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AppCard from "@/app/components/ui/AppCard";
import FormField from "@/app/components/ui/FormField";
import PageHeader from "@/app/components/ui/PageHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import {
  challengeAndVerifyTotp,
  challengePhoneMfa,
  enrollPhoneFactor,
  enrollTotpFactor,
  fetchChauffeurTelephoneHint,
  listMfaFactorsForUi,
  postMfaAuditEvent,
  refreshSessionAfterMfa,
  resetMfaVerifyFailureTracking,
  trackMfaVerifyFailureForAlerts,
  verifyMfaWithChallenge,
} from "@/app/lib/auth/mfa.client";
import { describeSupabaseMfaPhoneError, normalizePhoneToE164 } from "@/app/lib/auth/mfa-phone.shared";
import { getHomePathForRole, getUserRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";
import {
  buildAppSessionCookieWriteDebug,
  writeBrowserSessionCookie,
} from "@/app/lib/auth/session-cookie";

export default function MfaSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const required = searchParams.get("required") === "1";

  const [checkingUser, setCheckingUser] = useState(true);

  const [phoneInput, setPhoneInput] = useState("");
  const [smsFactorId, setSmsFactorId] = useState<string | null>(null);
  const [smsChallengeId, setSmsChallengeId] = useState<string | null>(null);
  const [smsLockedE164, setSmsLockedE164] = useState<string | null>(null);

  const [smsCode, setSmsCode] = useState("");
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsMessageType, setSmsMessageType] = useState<"success" | "error" | null>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpMessage, setTotpMessage] = useState("");
  const [totpMessageType, setTotpMessageType] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/direction/login");
        return;
      }

      const metaPhone =
        typeof data.user.user_metadata?.phone === "string"
          ? data.user.user_metadata.phone.trim()
          : "";
      const authPhone = typeof data.user.phone === "string" ? data.user.phone.trim() : "";

      const hint = await fetchChauffeurTelephoneHint();
      const prefill = hint || metaPhone || authPhone || "";
      if (!cancelled && prefill) {
        setPhoneInput(prefill);
      }

      setCheckingUser(false);
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
        "[auth-cookie] post-MFA cookie",
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

  async function ensureUnverifiedPhoneFactor(e164: string): Promise<{ factorId: string } | { error: string }> {
    if (smsFactorId && smsLockedE164 === e164) {
      return { factorId: smsFactorId };
    }

    const { data, error } = await enrollPhoneFactor(e164);
    if (!error && data?.id) {
      setSmsFactorId(data.id);
      setSmsLockedE164(e164);
      return { factorId: data.id };
    }

    const listed = await listMfaFactorsForUi();
    const pending = listed.find((f) => f.factor_type === "phone" && f.status === "unverified");
    if (pending) {
      setSmsFactorId(pending.id);
      setSmsLockedE164(e164);
      return { factorId: pending.id };
    }

    const code = readErrCode(error);
    const msg =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
    return {
      error: describeSupabaseMfaPhoneError(code, msg || "Impossible d’enregistrer ce numéro pour le MFA."),
    };
  }

  async function sendSmsCode() {
    setSmsBusy(true);
    setSmsMessage("");
    setSmsMessageType(null);
    try {
      const norm = normalizePhoneToE164(phoneInput);
      if (!norm.ok) {
        setSmsMessage(norm.message);
        setSmsMessageType("error");
        return;
      }

      if (smsLockedE164 && smsLockedE164 !== norm.e164) {
        setSmsFactorId(null);
        setSmsChallengeId(null);
        setSmsLockedE164(null);
      }

      const ensured = await ensureUnverifiedPhoneFactor(norm.e164);
      if ("error" in ensured) {
        setSmsMessage(ensured.error);
        setSmsMessageType("error");
        return;
      }

      const { data: ch, error: chErr } = await challengePhoneMfa(ensured.factorId);
      if (chErr || !ch?.id) {
        const code = readErrCode(chErr);
        setSmsMessage(
          describeSupabaseMfaPhoneError(
            code,
            chErr?.message ?? "Impossible d’envoyer le texto. Réessayez."
          )
        );
        setSmsMessageType("error");
        return;
      }

      setSmsChallengeId(ch.id);
      setSmsMessage("Si votre numéro est valide, un code vous a été envoyé par texto.");
      setSmsMessageType("success");
    } finally {
      setSmsBusy(false);
    }
  }

  async function onConfirmSms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!smsFactorId || !smsChallengeId || smsBusy) return;
    const trimmed = smsCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setSmsMessage("Entrez le code à 6 chiffres reçu par texto.");
      setSmsMessageType("error");
      return;
    }

    setSmsBusy(true);
    setSmsMessage("");
    setSmsMessageType(null);
    try {
      const { error } = await verifyMfaWithChallenge({
        factorId: smsFactorId,
        challengeId: smsChallengeId,
        code: trimmed,
      });
      if (error) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        void postMfaAuditEvent("mfa_verify_failed", session?.access_token ?? null);
        trackMfaVerifyFailureForAlerts(session?.access_token ?? null);
        const code = readErrCode(error);
        setSmsMessage(describeSupabaseMfaPhoneError(code, error.message || "Code invalide."));
        setSmsMessageType("error");
        return;
      }

      resetMfaVerifyFailureTracking();

      const refresh = await refreshSessionAfterMfa();
      if (refresh.error) {
        console.warn("[mfa] refreshSession", refresh.error.message);
      }
      await syncCookie();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      void postMfaAuditEvent("mfa_enabled", session?.access_token ?? null);
      void postMfaAuditEvent("mfa_verify_succeeded", session?.access_token ?? null);

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("tagora_mfa_gate_audit");
      }

      const { data: userData } = await supabase.auth.getUser();
      const role = getUserRole(userData.user);
      setSmsMessage("Vérification en deux étapes activée.");
      setSmsMessageType("success");
      router.replace(role ? getHomePathForRole(role) : "/direction/dashboard");
    } finally {
      setSmsBusy(false);
    }
  }

  async function startTotpEnroll() {
    setTotpBusy(true);
    setTotpMessage("");
    setTotpMessageType(null);
    try {
      const { data, error } = await enrollTotpFactor();
      if (error || !data) {
        setTotpMessage(error?.message ?? "Impossible de démarrer l’application Authenticator.");
        setTotpMessageType("error");
        return;
      }
      const payload = data as {
        id?: string;
        totp?: { qr_code?: string; secret?: string };
      };
      const id = payload.id ?? null;
      const qr = payload.totp?.qr_code ?? null;
      const sec = payload.totp?.secret ?? null;
      if (!id || !qr || !sec) {
        setTotpMessage("Réponse MFA incomplète (QR ou secret manquant).");
        setTotpMessageType("error");
        return;
      }
      setTotpFactorId(id);
      setQrCode(qr);
      setSecret(sec);
    } finally {
      setTotpBusy(false);
    }
  }

  async function onConfirmTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!totpFactorId || totpBusy) return;
    const trimmed = totpCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setTotpMessage("Entrez un code à 6 chiffres.");
      setTotpMessageType("error");
      return;
    }
    setTotpBusy(true);
    setTotpMessage("");
    setTotpMessageType(null);
    try {
      const { error } = await challengeAndVerifyTotp(totpFactorId, trimmed);
      if (error) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        void postMfaAuditEvent("mfa_verify_failed", session?.access_token ?? null);
        trackMfaVerifyFailureForAlerts(session?.access_token ?? null);
        setTotpMessage(
          typeof error === "object" && error && "message" in error && typeof error.message === "string"
            ? error.message
            : "Code invalide ou expiré."
        );
        setTotpMessageType("error");
        return;
      }

      resetMfaVerifyFailureTracking();

      const refresh = await refreshSessionAfterMfa();
      if (refresh.error) {
        console.warn("[mfa] refreshSession totp", refresh.error.message);
      }
      await syncCookie();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      void postMfaAuditEvent("mfa_enabled", session?.access_token ?? null);
      void postMfaAuditEvent("mfa_verify_succeeded", session?.access_token ?? null);

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("tagora_mfa_gate_audit");
      }

      const { data: userData } = await supabase.auth.getUser();
      const role = getUserRole(userData.user);
      setTotpMessage("Vérification en deux étapes activée.");
      setTotpMessageType("success");
      router.replace(role ? getHomePathForRole(role) : "/direction/dashboard");
    } finally {
      setTotpBusy(false);
    }
  }

  if (checkingUser) {
    return (
      <main className="ui-auth-shell mfa-setup-page">
        <div className="ui-auth-content">
          <PageHeader title="Vérification en deux étapes" subtitle="Préparation…" compact />
        </div>
      </main>
    );
  }

  return (
    <main className="ui-auth-shell mfa-setup-page">
      <div className="ui-auth-content ui-stack-lg">
        <PageHeader
          title="Vérification en deux étapes"
          subtitle="Protégez votre compte avec un code reçu par texto."
          compact
        />

        {required ? (
          <SectionCard title="Obligatoire">
            <p style={{ margin: 0, fontSize: 14, color: "#92400e" }}>
              Votre rôle exige la vérification en deux étapes avant d’accéder à la direction ou à
              l’administration.
            </p>
          </SectionCard>
        ) : null}

        <SectionCard title="Recevoir un code par texto">
          <div className="ui-stack-md">
            <p style={{ margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.5 }}>
              Recevez un code de vérification par texto pour protéger votre compte.
            </p>

            <AppCard tone="muted">
              <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>Étape 1 — Numéro</p>
              <FormField label="Numéro de téléphone (international)">
                <input
                  className="ui-input"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+15819912047"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
              </FormField>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
                Indicatif pays requis (ex. +1 pour l’Amérique du Nord). Dix chiffres seuls : nous
                ajoutons +1 automatiquement.
              </p>
              <PrimaryButton
                type="button"
                disabled={smsBusy}
                onClick={() => void sendSmsCode()}
                style={{ marginTop: 12 }}
              >
                Envoyer le code
              </PrimaryButton>
            </AppCard>

            <AppCard tone="muted">
              <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>
                Étape 2 — Code reçu par texto
              </p>
              <form className="ui-stack-md mfa-otp-code-form" onSubmit={(e) => void onConfirmSms(e)}>
                <div className="mfa-otp-code-field">
                  <label className="mfa-otp-code-label" htmlFor="mfa-setup-sms-otp-input">
                    Code à 6 chiffres
                  </label>
                  <input
                    id="mfa-setup-sms-otp-input"
                    name="mfa-setup-sms-otp"
                    className="mfa-otp-code-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={8}
                    spellCheck={false}
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                  />
                </div>
                <div className="mfa-otp-code-actions">
                  <PrimaryButton type="submit" disabled={smsBusy || !smsChallengeId}>
                    Confirmer et activer
                  </PrimaryButton>
                  <SecondaryButton type="button" disabled={smsBusy} onClick={() => router.back()}>
                    Annuler
                  </SecondaryButton>
                </div>
              </form>
            </AppCard>

            <FeedbackMessage message={smsMessage} type={smsMessageType} />
          </div>
        </SectionCard>

        <SectionCard title="Option avancée">
          <div className="ui-stack-md">
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
              <strong>Utiliser une application Authenticator</strong> (Google Authenticator,
              Microsoft Authenticator, etc.) — option secondaire seulement.
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
              Les codes QR dans TAGORA Time sont réservés au pointage horodateur sur place : le QR
              identifie une <strong>zone</strong> de punch, pas votre identité. Ce n’est pas une
              méthode de connexion ni de vérification MFA pour la direction.
            </p>
            <SecondaryButton type="button" onClick={() => setAdvancedOpen((v) => !v)}>
              {advancedOpen ? "Masquer l’option Authenticator" : "Utiliser une application Authenticator"}
            </SecondaryButton>

            {advancedOpen ? (
              <div className="ui-stack-md" style={{ marginTop: 8 }}>
                {!totpFactorId ? (
                  <PrimaryButton type="button" disabled={totpBusy} onClick={() => void startTotpEnroll()}>
                    Préparer l’application Authenticator
                  </PrimaryButton>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 14, color: "#334155" }}>
                      Scannez ce code avec votre application Authenticator, puis entrez le code à 6
                      chiffres.
                    </p>
                    {qrCode ? (
                      <AppCard tone="muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrCode} alt="Configuration Authenticator" width={200} height={200} />
                      </AppCard>
                    ) : null}
                    {secret ? (
                      <AppCard tone="muted">
                        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>
                          Secret (si vous ne pouvez pas scanner)
                        </p>
                        <code style={{ wordBreak: "break-all", fontSize: 13 }}>{secret}</code>
                      </AppCard>
                    ) : null}
                    <form className="ui-stack-md mfa-otp-code-form" onSubmit={(e) => void onConfirmTotp(e)}>
                      <div className="mfa-otp-code-field">
                        <label className="mfa-otp-code-label" htmlFor="mfa-setup-totp-otp-input">
                          Code à 6 chiffres
                        </label>
                        <input
                          id="mfa-setup-totp-otp-input"
                          name="mfa-setup-totp-otp"
                          className="mfa-otp-code-input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="one-time-code"
                          placeholder="123456"
                          maxLength={8}
                          spellCheck={false}
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value)}
                        />
                      </div>
                      <div className="mfa-otp-code-actions">
                        <PrimaryButton type="submit" disabled={totpBusy}>
                          Confirmer et activer (Authenticator)
                        </PrimaryButton>
                      </div>
                    </form>
                  </>
                )}
                <FeedbackMessage message={totpMessage} type={totpMessageType} />
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
