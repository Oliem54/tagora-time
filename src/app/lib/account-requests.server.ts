import "server-only";

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { getUserRole } from "@/app/lib/auth/roles";
import { normalizeEmail } from "@/app/lib/account-requests.shared";

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
}

export function getRequestIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");

  return forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
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

  const emailResult = await applyLimit(
    "email",
    normalizedEmail,
    3,
    60 * 60,
    60 * 60
  );

  if (!emailResult.allowed) {
    return {
      ok: false,
      retryAfterSeconds: emailResult.retryAfterSeconds,
      key: "email",
    };
  }

  return { ok: true };
}
