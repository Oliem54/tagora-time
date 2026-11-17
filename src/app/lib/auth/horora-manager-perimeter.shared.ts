/**
 * Premium manager perimeter. It is not persisted and it is not the portal
 * role check. Time approval and correction HTTP routes call this decision
 * before any mutation. Direction covers only departments already stored on
 * the employee file.
 */

import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

export const HORORA_MANAGER_PERIMETER_ACTIONS = [
  "view_team",
  "approve_time",
  "correct_time",
] as const;

export type HororaManagerPerimeterAction =
  (typeof HORORA_MANAGER_PERIMETER_ACTIONS)[number];

export type HororaManagerPerimeterDenial =
  | "cross_organization_forbidden"
  | "actor_forbidden"
  | "target_department_absent"
  | "manager_department_absent"
  | "outside_perimeter";

export type HororaManagerPerimeterDecision = {
  allowed: boolean;
  persisted: false;
  connectedToHttp: false;
  reason: "organization_scope" | "department_scope" | HororaManagerPerimeterDenial;
};

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deny(
  reason: HororaManagerPerimeterDenial
): HororaManagerPerimeterDecision {
  return { allowed: false, persisted: false, connectedToHttp: false, reason };
}

/**
 * Owner and organization admin cover their organization only.
 * Direction covers only departments explicitly assigned to that manager.
 * An employee never receives a team, approval, or correction right here.
 */
export function decideHororaManagerPerimeter(input: {
  actorRole: OrganizationMembershipRole;
  actorOrganizationId: string;
  actorDepartmentKeys?: readonly string[] | null;
  targetOrganizationId: string;
  targetDepartmentKey?: string | null;
  action: HororaManagerPerimeterAction;
}): HororaManagerPerimeterDecision {
  void input.action;
  const actorOrganizationId = clean(input.actorOrganizationId);
  const targetOrganizationId = clean(input.targetOrganizationId);
  if (!actorOrganizationId || !targetOrganizationId) {
    return deny("cross_organization_forbidden");
  }
  if (actorOrganizationId !== targetOrganizationId) {
    return deny("cross_organization_forbidden");
  }
  if (input.actorRole === "employe") return deny("actor_forbidden");

  const targetDepartmentKey = clean(input.targetDepartmentKey);
  if (!targetDepartmentKey) return deny("target_department_absent");

  if (
    input.actorRole === "organization_owner" ||
    input.actorRole === "organization_admin"
  ) {
    return {
      allowed: true,
      persisted: false,
      connectedToHttp: false,
      reason: "organization_scope",
    };
  }

  if (input.actorRole !== "direction") return deny("actor_forbidden");

  const departments = (input.actorDepartmentKeys ?? [])
    .map((key) => clean(key))
    .filter((key): key is string => key !== null);
  if (departments.length === 0) return deny("manager_department_absent");
  if (!departments.includes(targetDepartmentKey)) return deny("outside_perimeter");
  return {
    allowed: true,
    persisted: false,
    connectedToHttp: false,
    reason: "department_scope",
  };
}
