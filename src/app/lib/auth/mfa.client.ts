"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase/client";
import type { AppRole } from "@/app/lib/auth/roles";
import { getHomePathForRole } from "@/app/lib/auth/roles";
import {
  isStagingQaMfaBypassAllowed,
  resolveMandatoryMfaGateFromAssessment,
  resolvePostLoginPathFromMfaGate,
} from "@/app/lib/auth/mfa.shared";
import { getJwtAal } from "@/app/lib/auth/jwt-access-token";
import { resolveMfaVerifyPersistence } from "@/app/lib/auth/mfa-verify-session.shared";
import { persistServerSessionCookie } from "@/app/lib/auth/session-cookie";

export type MandatoryMfaGate =
  | { kind: "none" }
  | { kind: "setup"; message?: string }
  | { kind: "verify" };

export type MfaAuditEvent =
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_verify_failed"
  | "mfa_verify_failed_repeated"
  | "mfa_access_blocked"
  | "mfa_verify_succeeded";

type ListedFactor = {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string | null;
  phone?: string | null;
};

function readListedFactors(data: unknown): ListedFactor[] {
  return (data as { all?: ListedFactor[] } | null)?.all ?? [];
}

export async function postMfaAuditEvent(
  event: MfaAuditEvent,
  accessToken: string | null | undefined
) {
  if (!accessToken) return;
  try {
    await fetch("/api/security/mfa-audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ event }),
      credentials: "same-origin",
    });
  } catch {
    // Silencieux : l’audit ne doit pas bloquer le flux MFA.
  }
}

/** Après échecs répétés, une alerte centre (best-effort). */
export function trackMfaVerifyFailureForAlerts(accessToken: string | null | undefined) {
  if (typeof window === "undefined" || !accessToken) return;
  const prev = Number(sessionStorage.getItem("tagora_mfa_fail_count") ?? "0");
  const next = prev + 1;
  sessionStorage.setItem("tagora_mfa_fail_count", String(next));
  if (next >= 3 && !sessionStorage.getItem("tagora_mfa_repeated_alert_sent")) {
    sessionStorage.setItem("tagora_mfa_repeated_alert_sent", "1");
    void postMfaAuditEvent("mfa_verify_failed_repeated", accessToken);
  }
}

export function resetMfaVerifyFailureTracking() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("tagora_mfa_fail_count");
  sessionStorage.removeItem("tagora_mfa_repeated_alert_sent");
}

export async function getMandatoryMfaGate(role: AppRole | null): Promise<MandatoryMfaGate> {
  const bypassAllowed =
    typeof window !== "undefined" &&
    isStagingQaMfaBypassAllowed({
      role,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hostname: window.location.hostname,
    });

  const { data: sessionData } = await supabase.auth.getSession();
  const jwtAal = getJwtAal(sessionData.session?.access_token ?? null);

  const [{ data: factorData, error: factorError }, { data: aalData, error: aalError }] =
    await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

  if (factorError || aalError) {
    console.warn("[mfa] gate assessment failed", { factorError, aalError });
  }

  const factors = readListedFactors(factorData);
  const hasVerifiedMfa = factors.some(
    (f) =>
      (f.factor_type === "totp" || f.factor_type === "phone") && f.status === "verified"
  );
  const currentLevel = (aalData as { currentLevel?: string } | null)?.currentLevel ?? null;

  const gate = resolveMandatoryMfaGateFromAssessment({
    role,
    bypassAllowed,
    hasVerifiedMfa,
    factorAssessmentFailed: Boolean(factorError),
    jwtAal,
    currentAal: currentLevel === "aal1" || currentLevel === "aal2" ? currentLevel : null,
    aalAssessmentFailed: Boolean(aalError),
  });

  console.info("[mfa] fresh_session_gate", {
    kind: gate.kind,
    jwtAal,
    currentAal: currentLevel === "aal1" || currentLevel === "aal2" ? currentLevel : null,
    hasVerifiedMfa,
    factorAssessmentFailed: Boolean(factorError),
    aalAssessmentFailed: Boolean(aalError),
  });

  return gate;
}

export async function resolvePostLoginNavigationPath(role: AppRole): Promise<string> {
  const gate = await getMandatoryMfaGate(role);
  return resolvePostLoginPathFromMfaGate(gate.kind, getHomePathForRole(role));
}

export async function listMfaFactorsForUi(): Promise<ListedFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    return [];
  }
  return readListedFactors(data).filter(
    (f) => f.factor_type === "totp" || f.factor_type === "phone"
  );
}

export async function unenrollMfaFactor(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return { error };
}

export async function enrollTotpFactor(friendlyName?: string) {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: friendlyName?.trim() || "Authenticator",
  });
  return { data, error };
}

export async function enrollPhoneFactor(phoneE164: string, friendlyName?: string) {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "phone",
    phone: phoneE164,
    friendlyName: friendlyName?.trim() || "Mobile",
  });
  return { data, error };
}

export async function challengePhoneMfa(factorId: string) {
  return supabase.auth.mfa.challenge({ factorId, channel: "sms" });
}

export async function challengeAndVerifyTotp(factorId: string, code: string) {
  const challengeVerify = (
    supabase.auth.mfa as unknown as {
      challengeAndVerify?: (args: { factorId: string; code: string }) => Promise<{
        data?: { session?: unknown };
        error?: { message?: string };
      }>;
    }
  ).challengeAndVerify;

  if (typeof challengeVerify === "function") {
    return challengeVerify.call(supabase.auth.mfa, { factorId, code });
  }

  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });

  if (challengeError || !challengeData) {
    return { data: null, error: challengeError };
  }

  const challengeId = (challengeData as { id?: string }).id;
  if (!challengeId) {
    return {
      data: null,
      error: { message: "Challenge MFA introuvable." } as { message?: string },
    };
  }

  return supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code,
  });
}

export async function challengeTotpOnly(factorId: string) {
  return supabase.auth.mfa.challenge({ factorId });
}

export async function verifyMfaWithChallenge(params: {
  factorId: string;
  challengeId: string;
  code: string;
}) {
  return supabase.auth.mfa.verify(params);
}

export async function refreshSessionAfterMfa() {
  const { data, error } = await supabase.auth.refreshSession();
  return { data, error };
}

export async function persistVerifiedMfaSession(verifyResult: {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}): Promise<{
  ok: boolean;
  deny:
    | "wrong_code"
    | "expired_code"
    | "replayed_code"
    | "session_missing"
    | "cookie_persist_failed"
    | null;
  accessToken: string | null;
}> {
  let decision = resolveMfaVerifyPersistence(verifyResult);
  if (!decision.ok && decision.deny === "session_missing" && !verifyResult.error) {
    const { data } = await supabase.auth.getSession();
    decision = resolveMfaVerifyPersistence({
      data: data.session,
      error: null,
    });
  }
  if (!decision.ok) {
    return { ok: false, deny: decision.deny, accessToken: null };
  }

  if (decision.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: decision.accessToken,
      refresh_token: decision.refreshToken,
    });
    if (error) {
      console.warn("[mfa] setSession after verify", error.message);
    }
  }

  if (decision.refreshSession) {
    const refresh = await refreshSessionAfterMfa();
    if (refresh.error) {
      console.warn("[mfa] refreshSession after verify", refresh.error.message);
    }
  }

  const persist = await persistServerSessionCookie(decision.accessToken, "mfa");
  if (!persist.ok) {
    return {
      ok: false,
      deny: "cookie_persist_failed",
      accessToken: decision.accessToken,
    };
  }

  console.info("[auth-cookie] post-verify MFA cookie", {
    action: "written",
    cookieName: "tagora_app_session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    domain: null,
    valuePresent: true,
    valueLength: decision.accessToken.length,
  });

  return { ok: true, deny: null, accessToken: decision.accessToken };
}

export async function pickPreferredVerifiedMfaFactor(): Promise<
  { id: string; kind: "phone" | "totp" } | null
> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    return null;
  }
  const all = readListedFactors(data);
  const phone = all.find((f) => f.factor_type === "phone" && f.status === "verified");
  if (phone) {
    return { id: phone.id, kind: "phone" };
  }
  const totp = all.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (totp) {
    return { id: totp.id, kind: "totp" };
  }
  return null;
}

export async function pickVerifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    return null;
  }
  const totp = readListedFactors(data).find(
    (f) => f.factor_type === "totp" && f.status === "verified"
  );
  return totp?.id ?? null;
}

export async function fetchChauffeurTelephoneHint(): Promise<string | null> {
  try {
    const res = await fetch("/api/security/mfa-phone-hint", {
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { chauffeurTelephone?: string | null };
    const t = j.chauffeurTelephone?.trim();
    return t || null;
  } catch {
    return null;
  }
}

/** Badge discret direction/admin : session au niveau AAL2. */
export function useMfaAal2Active(role: AppRole | null | undefined): boolean | null {
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (role !== "direction" && role !== "admin") {
      setActive(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      if (error) {
        setActive(false);
        return;
      }
      const cur = (data as { currentLevel?: string } | null)?.currentLevel;
      setActive(cur === "aal2");
    })();

    return () => {
      cancelled = true;
    };
  }, [role]);

  return active;
}
