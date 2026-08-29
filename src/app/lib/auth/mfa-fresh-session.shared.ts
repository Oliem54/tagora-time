import { appRoleMatchesArea } from "@/app/lib/auth/organization-role-mapping.shared";
import {
  resolveMandatoryMfaGateFromAssessment,
  resolvePostLoginPathFromMfaGate,
} from "@/app/lib/auth/mfa.shared";
import type { AppRole } from "@/app/lib/auth/roles";
import { getHomePathForRole } from "@/app/lib/auth/roles";
import { evaluateSessionCookiePersistRequest } from "@/app/lib/auth/session-cookie";

export type FreshSessionAccessDecision =
  | "login"
  | "mfa_verify"
  | "mfa_setup"
  | "dashboard"
  | "wrong_role"
  | "wrong_tenant";

export function resolveFreshSessionAccess(input: {
  hasSession: boolean;
  jwtAal: "aal1" | "aal2" | null;
  role: AppRole | null;
  membershipAuthorized: boolean;
  areaRole: AppRole;
  hasVerifiedMfa: boolean;
  bypassAllowed?: boolean;
}): FreshSessionAccessDecision {
  if (!input.hasSession) {
    return "login";
  }

  if (!input.membershipAuthorized || !input.role) {
    return "wrong_tenant";
  }

  if (!appRoleMatchesArea(input.areaRole, input.role)) {
    return "wrong_role";
  }

  const gate = resolveMandatoryMfaGateFromAssessment({
    role: input.role,
    bypassAllowed: Boolean(input.bypassAllowed),
    hasVerifiedMfa: input.hasVerifiedMfa,
    factorAssessmentFailed: false,
    jwtAal: input.jwtAal,
    currentAal: input.jwtAal,
    aalAssessmentFailed: false,
  });

  if (gate.kind === "setup") {
    return "mfa_setup";
  }
  if (gate.kind === "verify") {
    return "mfa_verify";
  }
  return "dashboard";
}

export function resolveFreshLoginDestination(input: {
  role: AppRole;
  jwtAal: "aal1" | "aal2" | null;
  hasVerifiedMfa: boolean;
}): string {
  const access = resolveFreshSessionAccess({
    hasSession: true,
    jwtAal: input.jwtAal,
    role: input.role,
    membershipAuthorized: true,
    areaRole: input.role === "admin" ? "admin" : "direction",
    hasVerifiedMfa: input.hasVerifiedMfa,
  });

  if (access === "mfa_setup") {
    return resolvePostLoginPathFromMfaGate("setup", getHomePathForRole(input.role));
  }
  if (access === "mfa_verify") {
    return resolvePostLoginPathFromMfaGate("verify", getHomePathForRole(input.role));
  }
  return getHomePathForRole(input.role);
}

export function canPersistAppModuleCookie(aal: "aal1" | "aal2" | null): boolean {
  return evaluateSessionCookiePersistRequest({
    purpose: "mfa",
    hasAuthenticatedUser: true,
    aal,
    tokenLength: 800,
  }).ok;
}
