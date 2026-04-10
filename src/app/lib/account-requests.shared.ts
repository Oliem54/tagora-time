import type { User } from "@supabase/supabase-js";
import { AppRole, getUserRole } from "@/app/lib/auth/roles";
import {
  AppPermission,
  getUserPermissions,
  normalizePermissionList,
} from "@/app/lib/auth/permissions";

export const ACCOUNT_REQUEST_COMPANIES = [
  {
    value: "oliem_solutions",
    label: "Oliem Solutions",
    directoryContext: "repertoire_oliem_solutions",
  },
  {
    value: "titan_produits_industriels",
    label: "Titan Produits Industriels",
    directoryContext: "repertoire_titan_produits_industriels",
  },
] as const;

export type AccountRequestCompany =
  (typeof ACCOUNT_REQUEST_COMPANIES)[number]["value"];
export type CompanyDirectoryContext =
  (typeof ACCOUNT_REQUEST_COMPANIES)[number]["directoryContext"];

export type AccountRequestStatus =
  | "pending"
  | "invited"
  | "active"
  | "refused"
  | "error";

export type AccountRequestAuditEntry = {
  at: string;
  actor: "system" | "requester" | "direction";
  event:
    | "request_submitted"
    | "request_rate_limited"
    | "review_locked"
    | "request_refused"
    | "request_invited"
    | "request_activated"
    | "request_error"
    | "request_updated"
    | "request_reopened"
    | "request_deleted"
    | "invitation_resent"
    | "access_disabled";
  actorUserId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
};

export type ExistingAccountSnapshot = {
  exists: boolean;
  userId: string | null;
  role: AppRole | null;
  permissions: AppPermission[];
  company: AccountRequestCompany | null;
  primaryCompany: AccountRequestCompany | null;
  allowedCompanies: AccountRequestCompany[];
  companyDirectoryContext: CompanyDirectoryContext | null;
  emailConfirmed: boolean;
  hasSignedIn: boolean;
  lastSignInAt: string | null;
};

export type AccountRequestRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: AccountRequestCompany;
  portal_source: AppRole;
  requested_role: AppRole;
  requested_permissions: string[] | null;
  message: string | null;
  status: AccountRequestStatus;
  assigned_role: AppRole | null;
  assigned_permissions: string[] | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  invited_user_id: string | null;
  review_lock_token: string | null;
  review_started_at: string | null;
  last_error: string | null;
  audit_log: AccountRequestAuditEntry[] | null;
  existing_account?: ExistingAccountSnapshot | null;
  created_at: string;
};

export type UserCompanyAccess = {
  company: AccountRequestCompany | null;
  primaryCompany: AccountRequestCompany | null;
  allowedCompanies: AccountRequestCompany[];
  canWorkForOliemSolutions: boolean;
  canWorkForTitanProduitsIndustriels: boolean;
  companyDirectoryContext: CompanyDirectoryContext | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ACCOUNT_REVIEW_LOCK_WINDOW_MS = 10 * 60 * 1000;

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return emailPattern.test(value);
}

export function normalizePermissions(value: unknown): AppPermission[] {
  return normalizePermissionList(value);
}

export function normalizeCompany(value: unknown): AccountRequestCompany | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ACCOUNT_REQUEST_COMPANIES.find(
    (company) => company.value === normalized
  )?.value ?? null;
}

export function normalizeCompanyList(value: unknown): AccountRequestCompany[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeCompany(item))
        .filter((item): item is AccountRequestCompany => Boolean(item))
    )
  );
}

function humanizeCompanyValue(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getCompanyLabel(company: AccountRequestCompany | null | undefined) {
  if (!company) {
    return "Compagnie non definie";
  }

  return (
    ACCOUNT_REQUEST_COMPANIES.find((item) => item.value === company)?.label ??
    humanizeCompanyValue(company)
  );
}

export function getCompanyDirectoryContext(
  company: AccountRequestCompany | null | undefined
) {
  return (
    ACCOUNT_REQUEST_COMPANIES.find((item) => item.value === company)
      ?.directoryContext ?? null
  );
}

export function buildCompanyAccessFlags(
  primaryCompany: AccountRequestCompany | null | undefined,
  allowedCompaniesInput?: unknown
) {
  const allowedCompanies = normalizeCompanyList(allowedCompaniesInput);
  const normalizedPrimaryCompany = normalizeCompany(primaryCompany);
  const mergedCompanies = Array.from(
    new Set(
      [
        ...allowedCompanies,
        ...(normalizedPrimaryCompany ? [normalizedPrimaryCompany] : []),
      ].filter(Boolean)
    )
  ) as AccountRequestCompany[];

  return {
    primary_company: normalizedPrimaryCompany,
    allowed_companies: mergedCompanies,
    can_work_for_oliem_solutions: mergedCompanies.includes("oliem_solutions"),
    can_work_for_titan_produits_industriels: mergedCompanies.includes(
      "titan_produits_industriels"
    ),
    company_directory_context: getCompanyDirectoryContext(normalizedPrimaryCompany),
  };
}

export function getUserPrimaryCompany(user: User | null | undefined) {
  if (!user) return null;

  return (
    normalizeCompany(user.app_metadata?.primary_company) ??
    normalizeCompany(user.user_metadata?.primary_company) ??
    normalizeCompany(user.app_metadata?.company) ??
    normalizeCompany(user.user_metadata?.company)
  );
}

export function getUserAllowedCompanies(user: User | null | undefined) {
  if (!user) return [];

  const appAllowedCompanies = normalizeCompanyList(
    user.app_metadata?.allowed_companies
  );

  if (appAllowedCompanies.length > 0) {
    const primaryCompany = getUserPrimaryCompany(user);
    return Array.from(
      new Set([
        ...appAllowedCompanies,
        ...(primaryCompany ? [primaryCompany] : []),
      ])
    );
  }

  const userAllowedCompanies = normalizeCompanyList(
    user.user_metadata?.allowed_companies
  );
  const primaryCompany = getUserPrimaryCompany(user);
  const booleanCompanies = [
    user.app_metadata?.can_work_for_oliem_solutions === true ||
    user.user_metadata?.can_work_for_oliem_solutions === true
      ? "oliem_solutions"
      : null,
    user.app_metadata?.can_work_for_titan_produits_industriels === true ||
    user.user_metadata?.can_work_for_titan_produits_industriels === true
      ? "titan_produits_industriels"
      : null,
  ].filter(Boolean) as AccountRequestCompany[];

  return Array.from(
    new Set([
      ...userAllowedCompanies,
      ...booleanCompanies,
      ...(primaryCompany ? [primaryCompany] : []),
    ])
  );
}

export function buildUserCompanyAccess(
  user: User | null | undefined
): UserCompanyAccess {
  const primaryCompany = getUserPrimaryCompany(user);
  const allowedCompanies = getUserAllowedCompanies(user);
  const fallbackCompany =
    primaryCompany ?? allowedCompanies[0] ?? normalizeCompany(user?.app_metadata?.company);

  return {
    company: fallbackCompany,
    primaryCompany,
    allowedCompanies,
    canWorkForOliemSolutions: allowedCompanies.includes("oliem_solutions"),
    canWorkForTitanProduitsIndustriels: allowedCompanies.includes(
      "titan_produits_industriels"
    ),
    companyDirectoryContext: getCompanyDirectoryContext(fallbackCompany),
  };
}

export function createAuditEntry(
  event: AccountRequestAuditEntry["event"],
  actor: AccountRequestAuditEntry["actor"],
  options: {
    actorUserId?: string | null;
    ip?: string | null;
    details?: Record<string, unknown>;
  } = {}
): AccountRequestAuditEntry {
  return {
    at: new Date().toISOString(),
    actor,
    event,
    actorUserId: options.actorUserId ?? null,
    ip: options.ip ?? null,
    details: options.details ?? {},
  };
}

export function appendAuditEntry(
  current: AccountRequestAuditEntry[] | null | undefined,
  entry: AccountRequestAuditEntry
) {
  return [...(current ?? []), entry];
}

export function getReviewLockMetadata(reviewStartedAt: string | null) {
  if (!reviewStartedAt) {
    return {
      isLocked: false,
      isExpired: false,
      expiresAt: null,
    };
  }

  const startedAtMs = new Date(reviewStartedAt).getTime();
  const expiresAtMs = startedAtMs + ACCOUNT_REVIEW_LOCK_WINDOW_MS;
  const expiresAt = new Date(expiresAtMs).toISOString();
  const isExpired = expiresAtMs <= Date.now();

  return {
    isLocked: !isExpired,
    isExpired,
    expiresAt,
  };
}

export function hasUserActivatedAccess(user: User | null | undefined) {
  if (!user) return false;

  return Boolean(
    user.last_sign_in_at ||
      user.email_confirmed_at ||
      user.phone_confirmed_at ||
      user.confirmed_at
  );
}

export function buildExistingAccountSnapshot(
  user: User | null | undefined
): ExistingAccountSnapshot {
  const companyAccess = buildUserCompanyAccess(user);

  return {
    exists: Boolean(user),
    userId: user?.id ?? null,
    role: getUserRole(user),
    permissions: getUserPermissions(user),
    company: companyAccess.company,
    primaryCompany: companyAccess.primaryCompany,
    allowedCompanies: companyAccess.allowedCompanies,
    companyDirectoryContext: companyAccess.companyDirectoryContext,
    emailConfirmed: Boolean(user?.email_confirmed_at || user?.confirmed_at),
    hasSignedIn: Boolean(user?.last_sign_in_at),
    lastSignInAt: user?.last_sign_in_at ?? null,
  };
}
