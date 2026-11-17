import "server-only";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  decideHororaManagerPerimeter,
  type HororaManagerPerimeterAction,
} from "@/app/lib/auth/horora-manager-perimeter.shared";
import {
  readHororaActorDepartmentKeys,
  readHororaEmployeePerimeterFile,
  readHororaExceptionEmployeeId,
} from "@/app/lib/auth/horora-manager-perimeter.files.server";
import { resolveActiveOrganizationMembershipForUserId } from "@/app/lib/saas/organization-membership.server";

export type HororaManagerTimeHttpAction = Extract<
  HororaManagerPerimeterAction,
  "approve_time" | "correct_time"
>;

export type HororaManagerTimeHttpDenial = {
  ok: false;
  status: 401 | 403 | 404;
  code: string;
  message: string;
};

export type HororaManagerTimeHttpGuardResult =
  | { ok: true }
  | HororaManagerTimeHttpDenial;

function deny(
  status: HororaManagerTimeHttpDenial["status"],
  code: string,
  message = "Acces refuse."
): HororaManagerTimeHttpDenial {
  return { ok: false, status, code, message };
}

/**
 * Server session, membership, and employee file only.
 * A role, department, or organization sent by the browser is not an argument.
 */
export async function enforceHororaManagerTimeHttpGuard(input: {
  request?: NextRequest;
  serverActorUserId?: string | null;
  action: HororaManagerTimeHttpAction;
  targetEmployeeId?: number | null;
  exceptionId?: string | null;
}): Promise<HororaManagerTimeHttpGuardResult> {
  try {
    let actorUserId: string | null = null;
    let sessionOrganizationId: string | null = null;
    if (input.request) {
      const authenticated = await getAuthenticatedRequestUser(input.request);
      actorUserId = authenticated.user?.id ?? null;
      sessionOrganizationId = authenticated.organizationId ?? null;
      if (!actorUserId) {
        return deny(401, "unauthenticated", "Authentification Nexus requise.");
      }
    } else {
      const serverActorUserId = input.serverActorUserId?.trim() ?? "";
      if (!serverActorUserId) {
        return deny(401, "unauthenticated", "Authentification Nexus requise.");
      }
      actorUserId = serverActorUserId;
    }

    const membership = await resolveActiveOrganizationMembershipForUserId(actorUserId);
    if (!membership.ok) {
      return membership.reason === "lookup_failed"
        ? deny(403, "perimeter_lookup_failed")
        : deny(403, "actor_forbidden");
    }
    if (sessionOrganizationId && sessionOrganizationId !== membership.organizationId) {
      return deny(403, "cross_organization_forbidden");
    }

    let employeeId =
      typeof input.targetEmployeeId === "number" &&
      Number.isInteger(input.targetEmployeeId) &&
      input.targetEmployeeId > 0
        ? input.targetEmployeeId
        : null;
    const exceptionId = input.exceptionId?.trim() ?? "";
    if (exceptionId) {
      const loaded = await readHororaExceptionEmployeeId(exceptionId);
      if (!loaded.ok) return deny(403, "perimeter_lookup_failed");
      employeeId = loaded.employeeId;
    }
    if (!employeeId) return deny(404, "target_employee_absent", "Employe cible introuvable.");

    const [target, actorDepartments] = await Promise.all([
      readHororaEmployeePerimeterFile(employeeId),
      readHororaActorDepartmentKeys({
        authUserId: actorUserId,
        organizationId: membership.organizationId,
      }),
    ]);
    if (!target.ok || !actorDepartments.ok) return deny(403, "perimeter_lookup_failed");
    if (!target.file) return deny(404, "target_employee_absent", "Employe cible introuvable.");

    const decision = decideHororaManagerPerimeter({
      actorRole: membership.membershipRole,
      actorOrganizationId: membership.organizationId,
      actorDepartmentKeys: actorDepartments.departmentKeys,
      targetOrganizationId: target.file.organizationId ?? "",
      targetDepartmentKey: target.file.departmentKey,
      action: input.action,
    });
    if (!decision.allowed) return deny(403, decision.reason);
    return { ok: true };
  } catch {
    return deny(403, "perimeter_lookup_failed");
  }
}

export function hororaManagerTimeHttpDenialResponse(
  denial: HororaManagerTimeHttpDenial,
  route: string
) {
  return NextResponse.json(
    {
      success: false,
      ok: false,
      error: denial.message,
      code: denial.code,
      route,
    },
    { status: denial.status }
  );
}
