import type { NextRequest } from "next/server";
import {
  buildHorodateurValidationErrorResponse,
} from "@/app/api/horodateur/_shared";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { resolveActiveOrganizationMembershipForUserId } from "@/app/lib/saas/organization-membership.server";
import { payrollOperationalErrorMessage } from "@/app/lib/horodateur-v1/payroll-accountant-operational.shared";

export function readPayrollBodyString(
  body: Record<string, unknown>,
  key: string
) {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

export async function requirePayrollAccountantApiAccess(
  req: NextRequest,
  route: string
) {
  const authenticated = await getAuthenticatedRequestUser(req);
  if (!authenticated.user) {
    return {
      ok: false as const,
      response: buildHorodateurValidationErrorResponse({
        error: "Acces refuse.",
        code: "forbidden",
        status: 403,
        route,
      }),
    };
  }

  const membership = await resolveActiveOrganizationMembershipForUserId(
    authenticated.user.id
  );
  if (!membership.ok) {
    return {
      ok: false as const,
      response: buildHorodateurValidationErrorResponse({
        error: payrollOperationalErrorMessage(membership.reason),
        code: membership.reason,
        status: 403,
        route,
      }),
    };
  }

  return {
    ok: true as const,
    user: authenticated.user,
    membership: {
      role: membership.membershipRole,
      status: membership.membershipStatus,
    },
    membershipOrganizationId: membership.organizationId,
  };
}

export async function readPayrollJsonBody(req: NextRequest, route: string) {
  try {
    return {
      ok: true as const,
      body: (await req.json()) as Record<string, unknown>,
    };
  } catch {
    return {
      ok: false as const,
      response: buildHorodateurValidationErrorResponse({
        error: "Corps JSON invalide.",
        code: "invalid_json",
        route,
      }),
    };
  }
}

export function payrollDenialResponse(
  result: {
    access?: { allowed?: boolean; reason?: string };
    reason?: string;
  },
  route: string
) {
  if ("access" in result && result.access && result.access.allowed === false) {
    return buildHorodateurValidationErrorResponse({
      error: payrollOperationalErrorMessage(result.access.reason ?? "forbidden"),
      code: result.access.reason ?? "forbidden",
      status: 403,
      route,
    });
  }
  const reason =
    typeof result.reason === "string" ? result.reason : "period_invalid";
  const status = reason === "confirm_required" ? 409 : 400;
  return buildHorodateurValidationErrorResponse({
    error: payrollOperationalErrorMessage(reason),
    code: reason,
    status,
    route,
  });
}
