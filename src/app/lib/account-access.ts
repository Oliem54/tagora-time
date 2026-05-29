import type { AppPermission } from "@/app/lib/auth/permissions";
import type { AppRole } from "@/app/lib/auth/roles";
import type {
  AccountRequestAuditEntry,
  AccountRequestCompany,
  ExistingAccountSnapshot,
} from "@/app/lib/account-requests.shared";

export type AccountAccessStatus =
  | "pending"
  | "invited"
  | "active"
  | "refused"
  | "error";

export type AccountAccessAction =
  | "approve"
  | "refuse"
  | "update_access"
  | "update_request_details"
  | "reset_pending"
  | "resend_invitation"
  | "disable_access"
  | "reactivate_access"
  | "retry";

export type EmployeeLinkStatus = "created" | "existing" | "missing";
export type EmployeeLinkSource = "profile_id" | "auth_user_id" | "email" | "none";

export type EmployeeLinkSummary = {
  id: number | null;
  exists: boolean;
  status: EmployeeLinkStatus;
  label: string;
  source: EmployeeLinkSource;
};

export type AccountAccessRequestRecord = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: AccountRequestCompany;
  portal_source: AppRole;
  requested_role: AppRole;
  requested_permissions: AppPermission[] | null;
  message: string | null;
  status: AccountAccessStatus;
  assigned_role: AppRole | null;
  assigned_permissions: AppPermission[] | null;
  review_note: string | null;
  reviewed_at: string | null;
  last_error?: string | null;
  existing_account?: ExistingAccountSnapshot | null;
  employee_link?: EmployeeLinkSummary | null;
  review_lock?: {
    isLocked: boolean;
    isExpired: boolean;
    expiresAt: string | null;
  } | null;
  /** auth.users.id après invitation / activation */
  invited_user_id?: string | null;
  created_at: string;
  audit_log?: AccountRequestAuditEntry[] | null;
};

export type AccountAccessListFilter =
  | "all"
  | "pending"
  | "invited"
  | "active"
  | "disabled"
  | "refused"
  | "error";

const ACCESS_AUDIT_EVENTS = new Set(["access_disabled", "access_reactivated"]);

export function resolveAccessDisabledFromAuditLog(
  auditLog: AccountRequestAuditEntry[] | null | undefined
): boolean | null {
  if (!auditLog?.length) {
    return null;
  }

  let latestAt = "";
  let latestDisabled: boolean | null = null;

  for (const entry of auditLog) {
    if (!ACCESS_AUDIT_EVENTS.has(entry.event)) {
      continue;
    }

    const entryAt = entry.at ?? "";
    if (entryAt >= latestAt) {
      latestAt = entryAt;
      latestDisabled = entry.event === "access_disabled";
    }
  }

  return latestDisabled;
}

export function isAccessDisabledRequest(request: AccountAccessRequestRecord) {
  if (request.existing_account?.exists === true) {
    return request.existing_account.accessDisabled;
  }

  const auditState = resolveAccessDisabledFromAuditLog(request.audit_log);
  if (auditState !== null) {
    return auditState;
  }

  return Boolean(
    request.existing_account?.exists &&
      !request.existing_account.role &&
      (request.status === "active" ||
        request.status === "invited" ||
        request.status === "refused")
  );
}

export function isRefusedRequest(request: AccountAccessRequestRecord) {
  return request.status === "refused" && !isAccessDisabledRequest(request);
}

export function matchesAccountAccessFilter(
  request: AccountAccessRequestRecord,
  filter: AccountAccessListFilter
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "disabled") {
    return isAccessDisabledRequest(request);
  }
  if (filter === "refused") {
    return isRefusedRequest(request);
  }
  if (filter === "active" || filter === "invited") {
    return request.status === filter && !isAccessDisabledRequest(request);
  }
  return request.status === filter;
}
