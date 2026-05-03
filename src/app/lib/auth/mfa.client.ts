"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase/client";
import type { AppRole } from "@/app/lib/auth/roles";
import { getHomePathForRole } from "@/app/lib/auth/roles";
import { roleRequiresMandatoryMfa } from "@/app/lib/auth/mfa.shared";

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
  if (!roleRequiresMandatoryMfa(role)) {
    return { kind: "none" };
  }

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

  if (!hasVerifiedMfa) {
    return {
      kind: "setup",
      message:
        "Votre rôle exige la vérification en deux étapes. Configurez-la pour continuer.",
    };
  }

  const currentLevel = (aalData as { currentLevel?: string } | null)?.currentLevel ?? null;
  const nextLevel = (aalData as { nextLevel?: string } | null)?.nextLevel ?? null;

  if (currentLevel === "aal1" && nextLevel === "aal2") {
    return { kind: "verify" };
  }

  return { kind: "none" };
}

export async function resolvePostLoginNavigationPath(role: AppRole): Promise<string> {
  const gate = await getMandatoryMfaGate(role);
  if (gate.kind === "setup") {
    return "/auth/mfa/setup?required=1";
  }
  if (gate.kind === "verify") {
    return "/auth/mfa/verify";
  }
  return getHomePathForRole(role);
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
