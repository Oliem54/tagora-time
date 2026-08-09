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
  source: "membership" | null;
};

export async function fetchSessionAuthorizationContext(
  accessToken: string
): Promise<SessionContextResponse> {
  const res = await fetch("/api/auth/session-context", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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
