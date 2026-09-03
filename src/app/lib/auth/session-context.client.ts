"use client";

import type { AppRole } from "@/app/lib/auth/roles";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

export type SessionContextResponse = {
  authenticated: boolean;
  authorized: boolean;
  reason: string | null;
  jwtAppRole: AppRole | null;
  appRole: AppRole | null;
  organizationId: string | null;
  membershipId: string | null;
  membershipRole: OrganizationMembershipRole | null;
  source: "membership" | "nexus_handoff" | null;
};

export async function fetchSessionAuthorizationContext(
  accessToken?: string
): Promise<SessionContextResponse> {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch("/api/auth/session-context", {
    method: "GET",
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as SessionContextResponse | null;

  if (!body || typeof body !== "object") {
    return {
      authenticated: false,
      authorized: false,
      reason: "lookup_failed",
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
