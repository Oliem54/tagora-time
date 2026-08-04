import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  getAuthenticatedRequestUser,
  getRequestAccessToken,
} from "@/app/lib/account-requests.server";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import { isJwtExplicitlyAal1Only } from "@/app/lib/auth/jwt-access-token";
import {
  readRequestHostname,
  shouldBlockJwtAal1ForMandatoryMfaRole,
} from "@/app/lib/auth/mfa.shared";
import {
  assertAuthenticatedOrganizationAccess,
  assertChauffeurOrganizationAccess,
  getAuthenticatedOrganizationMemberships,
  normalizeOrganizationUuid,
  resolveRequestedOrganizationId,
} from "@/app/lib/auth/organization-access.server";
import type { PayPlanPermission } from "@/app/lib/commissions/generic-pay-plan-contracts";
import { createAuthenticatedServerSupabaseClient } from "@/app/lib/supabase/authenticated-server";

export type GenericPayPlanAuth = {
  user: User;
  role: string | null;
  accessToken: string;
  supabase: ReturnType<typeof createAuthenticatedServerSupabaseClient>;
};

export async function requireGenericPayPlanAdminAccess(req: NextRequest): Promise<
  | { ok: true; auth: GenericPayPlanAuth }
  | { ok: false; response: NextResponse }
> {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentification requise." },
        { status: 401 }
      ),
    };
  }
  if (!hasAdminFinanceAccess(user)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Accès réservé à l’administration finance." },
        { status: 403 }
      ),
    };
  }
  const token = getRequestAccessToken(req).token;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentification requise." },
        { status: 401 }
      ),
    };
  }
  if (
    shouldBlockJwtAal1ForMandatoryMfaRole({
      role,
      isExplicitlyAal1Only: isJwtExplicitlyAal1Only(token),
      hostname: readRequestHostname(req.headers, req.nextUrl.hostname),
    })
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Vérification en deux étapes requise. Complétez le MFA puis réessayez.",
          code: "MFA_AAL2_REQUIRED",
        },
        { status: 403 }
      ),
    };
  }
  return {
    ok: true,
    auth: {
      user,
      role,
      accessToken: token,
      supabase: createAuthenticatedServerSupabaseClient(token),
    },
  };
}

function readRawPermissionSlugs(user: User): string[] {
  const buckets = [user.app_metadata?.permissions, user.user_metadata?.permissions];
  const out = new Set<string>();
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const item of bucket) {
      if (typeof item === "string" && item.trim()) {
        out.add(item.trim().toLowerCase());
      }
    }
  }
  return Array.from(out);
}

/**
 * Admin finance passe. Sinon, le slug JWT exact est exigé.
 * Ne pas attribuer automatiquement ces permissions.
 */
export function assertPayPlanPermission(
  user: User,
  permission: PayPlanPermission
): { ok: true } | { ok: false; status: 403; error: string } {
  if (hasAdminFinanceAccess(user)) return { ok: true };
  if (readRawPermissionSlugs(user).includes(permission)) return { ok: true };
  return {
    ok: false,
    status: 403,
    error: "Permission insuffisante pour cette action.",
  };
}

export async function resolvePayPlanOrganization(input: {
  userId: string;
  accessToken: string;
  requestedOrganizationId: unknown;
}): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; status: number; error: string }
> {
  const memberships = await getAuthenticatedOrganizationMemberships(input.userId);
  if (!memberships.ok) {
    return {
      ok: false,
      status: memberships.status,
      error: memberships.error,
    };
  }
  const requested = resolveRequestedOrganizationId({
    requestedOrganizationId: input.requestedOrganizationId,
    memberships: memberships.memberships,
  });
  if (!requested.ok) {
    return {
      ok: false,
      status: requested.status,
      error: requested.error,
    };
  }
  const access = await assertAuthenticatedOrganizationAccess({
    accessToken: input.accessToken,
    userId: input.userId,
    organizationId: requested.organizationId,
  });
  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error };
  }
  return { ok: true, organizationId: requested.organizationId };
}

export async function assertEmployeeInOrganization(input: {
  auth: GenericPayPlanAuth;
  employeeId: number;
  organizationId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const check = await assertChauffeurOrganizationAccess({
    supabase: input.auth.supabase,
    accessToken: input.auth.accessToken,
    userId: input.auth.user.id,
    chauffeurId: input.employeeId,
  });
  if (!check.ok) {
    return { ok: false, status: check.status, error: check.error };
  }
  const expected = normalizeOrganizationUuid(input.organizationId);
  if (!expected || check.organizationId !== expected) {
    return {
      ok: false,
      status: 403,
      error: "Employé hors de l’organisation courante.",
    };
  }
  return { ok: true };
}

export function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
