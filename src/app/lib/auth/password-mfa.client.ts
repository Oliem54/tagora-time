"use client";

import { listMfaFactorsForUi } from "@/app/lib/auth/mfa.client";
import { supabase } from "@/app/lib/supabase/client";

export const PASSWORD_MFA_STEP_UP_MESSAGE =
  "Votre compte est protégé par la vérification en deux étapes. Confirmez votre identité avant de modifier le mot de passe.";

export const PASSWORD_MFA_STEP_UP_AFTER_ERROR_MESSAGE =
  "La modification du mot de passe nécessite une vérification en deux étapes. Confirmez votre identité, puis réessayez.";

export const PASSWORD_MFA_RECONNECT_HINT =
  "Si le problème persiste, déconnectez-vous et reconnectez-vous avec votre mot de passe actuel.";

export function isSafeInternalReturnPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export function isAal2PasswordUpdateError(error: { message?: string } | null | undefined): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("aal2") ||
    (message.includes("mfa") && message.includes("password"))
  );
}

export function getDefaultPasswordMfaReturnPath(): string {
  if (typeof window === "undefined") {
    return "/employe/mot-de-passe";
  }
  return `${window.location.pathname}${window.location.search}`;
}

export function buildMfaVerifyHref(returnPath: string, opts?: { reason?: "password" }): string {
  const params = new URLSearchParams();
  params.set("next", returnPath);
  if (opts?.reason) {
    params.set("reason", opts.reason);
  }
  return `/auth/mfa/verify?${params.toString()}`;
}

export function loginPathForMissingMfaSession(nextPath: string | null): string {
  const safeNext = isSafeInternalReturnPath(nextPath) ? nextPath : null;
  const nextQuery = safeNext ? `?next=${encodeURIComponent(safeNext)}` : "";

  if (safeNext?.startsWith("/employe")) {
    return `/employe/login${nextQuery}`;
  }

  return `/direction/login${nextQuery}`;
}

export async function assessPasswordUpdateMfaStepUp(returnPath?: string): Promise<{
  stepUpRequired: boolean;
  verifyHref?: string;
}> {
  const factors = await listMfaFactorsForUi();
  const hasVerifiedMfa = factors.some(
    (f) =>
      (f.factor_type === "totp" || f.factor_type === "phone") && f.status === "verified"
  );

  if (!hasVerifiedMfa) {
    return { stepUpRequired: false };
  }

  const { data: aal, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const resolvedReturnPath = returnPath ?? getDefaultPasswordMfaReturnPath();

  if (aalError) {
    return {
      stepUpRequired: true,
      verifyHref: buildMfaVerifyHref(resolvedReturnPath, { reason: "password" }),
    };
  }

  const currentLevel = (aal as { currentLevel?: string } | null)?.currentLevel ?? null;
  const nextLevel = (aal as { nextLevel?: string } | null)?.nextLevel ?? null;

  if (currentLevel === "aal2") {
    return { stepUpRequired: false };
  }

  const needsStepUp =
    currentLevel === "aal1" && (nextLevel === "aal2" || hasVerifiedMfa);

  if (!needsStepUp) {
    return { stepUpRequired: false };
  }

  return {
    stepUpRequired: true,
    verifyHref: buildMfaVerifyHref(resolvedReturnPath, { reason: "password" }),
  };
}
