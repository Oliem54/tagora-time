export type MfaVerifyDenyReason = "wrong_code" | "expired_code" | "replayed_code";

export type MfaVerifyErrorLike = {
  code?: string | null;
  message?: string | null;
} | null;

export type MfaVerifySessionTokens = {
  accessToken: string;
  refreshToken: string | null;
};

export type MfaVerifyPersistenceDecision =
  | {
      ok: false;
      deny: MfaVerifyDenyReason;
      persistSession: false;
      refreshSession: false;
      accessToken: null;
      refreshToken: null;
    }
  | {
      ok: false;
      deny: "session_missing";
      persistSession: false;
      refreshSession: false;
      accessToken: null;
      refreshToken: null;
    }
  | {
      ok: true;
      deny: null;
      persistSession: true;
      refreshSession: false;
      accessToken: string;
      refreshToken: string | null;
    };

type MfaVerifySessionShape = {
  access_token?: unknown;
  refresh_token?: unknown;
  session?: {
    access_token?: unknown;
    refresh_token?: unknown;
  } | null;
};

function readToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function classifyMfaVerifyDenial(
  error: MfaVerifyErrorLike
): MfaVerifyDenyReason | null {
  if (!error) {
    return null;
  }

  const code = String(error.code ?? "").trim().toLowerCase();
  const message = String(error.message ?? "").trim().toLowerCase();

  if (
    code === "mfa_challenge_already_verified" ||
    code.includes("already_verified") ||
    message.includes("already verified") ||
    message.includes("already used") ||
    message.includes("challenge has already")
  ) {
    return "replayed_code";
  }

  if (code === "mfa_challenge_expired" || message.includes("expired")) {
    return "expired_code";
  }

  if (
    code === "mfa_verification_failed" ||
    code === "invalid_credentials" ||
    message.includes("invalid") ||
    message.includes("incorrect") ||
    message.includes("wrong")
  ) {
    return "wrong_code";
  }

  return "wrong_code";
}

export function extractMfaVerifySessionTokens(
  data: unknown
): MfaVerifySessionTokens | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as MfaVerifySessionShape;
  const accessToken =
    readToken(payload.access_token) ?? readToken(payload.session?.access_token);
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken:
      readToken(payload.refresh_token) ?? readToken(payload.session?.refresh_token),
  };
}

/**
 * MFA verify already rotates tokens. A follow-up refreshSession() can reuse a
 * rotated refresh token, sign the user out, and bounce to /direction/login.
 * Never refresh after a successful verify that already returned a session.
 */
export function shouldRefreshSessionAfterSuccessfulMfa(
  accessToken: string | null | undefined
): boolean {
  return accessToken == null || accessToken.length === 0;
}

export function resolveMfaVerifyPersistence(result: {
  data?: unknown;
  error?: MfaVerifyErrorLike;
}): MfaVerifyPersistenceDecision {
  const deny = classifyMfaVerifyDenial(result.error ?? null);
  if (deny) {
    return {
      ok: false,
      deny,
      persistSession: false,
      refreshSession: false,
      accessToken: null,
      refreshToken: null,
    };
  }

  const tokens = extractMfaVerifySessionTokens(result.data);
  if (!tokens) {
    return {
      ok: false,
      deny: "session_missing",
      persistSession: false,
      refreshSession: false,
      accessToken: null,
      refreshToken: null,
    };
  }

  return {
    ok: true,
    deny: null,
    persistSession: true,
    refreshSession: false,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}
