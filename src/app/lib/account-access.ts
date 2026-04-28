import type { AppPermission } from "@/app/lib/auth/permissions";
import type { AppRole } from "@/app/lib/auth/roles";
import type {
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
  | "reset_pending"
  | "resend_invitation"
  | "disable_access"
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
};

