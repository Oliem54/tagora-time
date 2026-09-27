"use client";

import type { AppRole } from "@/app/lib/auth/roles";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

export type SessionContextResponse = {
  authenticated: boolean;
  authorized: boolean;
  reason: string | null;
  userId: string | null;
  jwtAppRole: AppRole | null;
  appRole: AppRole | null;
  organizationId: string | null;
  membershipId: string | null;
  membershipRole: OrganizationMembershipRole | null;
  source: "membership" | "nexus_handoff" | null;
};

export const SESSION_CONTEXT_TIMEOUT_MS = 12_000;

export class SessionContextTimeoutError extends Error {
  constructor() {
    super("session_context_timeout");
    this.name = "SessionContextTimeoutError";
  }
}

export function isSessionContextTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "SessionContextTimeoutError";
}

export async function fetchSessionAuthorizationContext(
  accessToken?: string,
  options?: { timeoutMs?: number }
): Promise<SessionContextResponse> {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const timeoutMs = options?.timeoutMs ?? SESSION_CONTEXT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch("/api/auth/session-context", {
      method: "GET",
      headers,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new SessionContextTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => null)) as SessionContextResponse | null;

  if (!body || typeof body !== "object") {
    return {
      authenticated: false,
      authorized: false,
      reason: "lookup_failed",
      userId: null,
      jwtAppRole: null,
      appRole: null,
      organizationId: null,
      membershipId: null,
      membershipRole: null,
      source: null,
    };
  }

  return body;
}
