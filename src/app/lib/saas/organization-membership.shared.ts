import {
  isOrganizationMembershipRole,
  type OrganizationMembershipRole,
} from "@/app/lib/saas/tenant-foundation.shared";

export type MembershipRow = {
  id: string;
  organization_id: string;
  role: string;
  status: string;
  is_default: boolean;
};

export type SelectMembershipMode = "strict" | "storage_compat";

/**
 * Picks the active membership per AuthGate contract (strict) or Storage legacy.
 * Never trusts client-supplied organization_id.
 */
export function selectActiveMembershipRow(
  rows: MembershipRow[],
  mode: SelectMembershipMode = "strict"
):
  | { kind: "ok"; row: MembershipRow }
  | { kind: "absent" }
  | { kind: "inactive" }
  | { kind: "ambiguous" } {
  const active = rows.filter((row) => row.status === "active");

  if (active.length === 0) {
    return rows.length > 0 ? { kind: "inactive" } : { kind: "absent" };
  }

  const preferred = active.find((row) => row.is_default);
  if (preferred) {
    return { kind: "ok", row: preferred };
  }

  if (active.length === 1) {
    return { kind: "ok", row: active[0]! };
  }

  if (mode === "storage_compat") {
    const sorted = active.slice().sort((a, b) => a.id.localeCompare(b.id));
    return { kind: "ok", row: sorted[0]! };
  }

  return { kind: "ambiguous" };
}

export function isSelectableMembershipRole(
  role: string
): role is OrganizationMembershipRole {
  return isOrganizationMembershipRole(role);
}
