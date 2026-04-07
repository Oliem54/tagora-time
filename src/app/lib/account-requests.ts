import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { AppRole, getUserRole } from "@/app/lib/auth/roles";
import {
  AppPermission,
  getUserPermissions,
  normalizePermissionList,
} from "@/app/lib/auth/permissions";

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
    | "request_error";
  actorUserId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
};

export type ExistingAccountSnapshot = {
  exists: boolean;
  userId: string | null;
  role: AppRole | null;
  permissions: AppPermission[];
  emailConfirmed: boolean;
  hasSignedIn: boolean;
  lastSignInAt: string | null;
};

export type AccountRequestRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ACCOUNT_REVIEW_LOCK_WINDOW_MS = 10 * 60 * 1000;

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
}

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return emailPattern.test(value);
}

export function normalizePermissions(value: unknown): AppPermission[] {
  return normalizePermissionList(value);
}

export function getRequestIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");

  return (
    forwardedFor?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    "unknown"
  );
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

export async function getAuthenticatedRequestUser(req: NextRequest) {
  const token = getBearerToken(req);

  if (!token) {
    return { user: null, role: null };
  }

  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, role: null };
  }

  return {
    user: data.user,
    role: getUserRole(data.user),
  };
}

export async function getStrictDirectionRequestUser(req: NextRequest) {
  const token = getBearerToken(req);

  if (!token) {
    return { user: null, role: null };
  }

  const publicSupabase = createPublicServerSupabaseClient();
  const { data, error } = await publicSupabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, role: null };
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data: adminUserData, error: adminUserError } =
    await adminSupabase.auth.admin.getUserById(data.user.id);

  const user = adminUserData.user;

  if (adminUserError || !user || getUserRole(user) !== "direction") {
    return { user: null, role: null };
  }

  return {
    user,
    role: "direction" as const,
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

export function buildExistingAccountSnapshot(user: User | null | undefined): ExistingAccountSnapshot {
  return {
    exists: Boolean(user),
    userId: user?.id ?? null,
    role: getUserRole(user),
    permissions: getUserPermissions(user),
    emailConfirmed: Boolean(user?.email_confirmed_at || user?.confirmed_at),
    hasSignedIn: Boolean(user?.last_sign_in_at),
    lastSignInAt: user?.last_sign_in_at ?? null,
  };
}

export async function consumeDurableAccountRequestRateLimit(
  req: NextRequest,
  email: string
) {
  const supabase = createPublicServerSupabaseClient();
  const normalizedEmail = normalizeEmail(email);
  const ip = getRequestIp(req);

  const applyLimit = async (
    scope: "ip" | "email",
    identifier: string,
    maxAttempts: number,
    windowSeconds: number,
    blockSeconds: number
  ) => {
    const { data, error } = await supabase.rpc(
      "consume_account_request_rate_limit",
      {
        p_scope: scope,
        p_identifier: identifier,
        p_max_attempts: maxAttempts,
        p_window_seconds: windowSeconds,
        p_block_seconds: blockSeconds,
      }
    );

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      allowed: Boolean(result?.allowed),
      retryAfterSeconds: Number(result?.retry_after_seconds ?? 0),
    };
  };

  const ipResult = await applyLimit("ip", ip, 6, 10 * 60, 15 * 60);

  if (!ipResult.allowed) {
    return { ok: false, retryAfterSeconds: ipResult.retryAfterSeconds, key: "ip" };
  }

  const emailResult = await applyLimit("email", normalizedEmail, 3, 60 * 60, 60 * 60);

  if (!emailResult.allowed) {
    return {
      ok: false,
      retryAfterSeconds: emailResult.retryAfterSeconds,
      key: "email",
    };
  }

  return { ok: true };
}
