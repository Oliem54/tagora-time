import type { User } from "@supabase/supabase-js";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";
import { readAccessDisabledFromAuthUser } from "@/app/lib/account-requests.shared";
import type { AppPermission } from "@/app/lib/auth/permissions";
import { getUserRole, type AppRole } from "@/app/lib/auth/roles";

export const AUTHORIZED_BOOK_VIEWER_ROLES = ["admin", "direction"] as const;

export type AuthorizedBookViewerRole = (typeof AUTHORIZED_BOOK_VIEWER_ROLES)[number];

export const AUTHORIZED_VIEWER_VALIDATION_ERROR =
  "La personne autorisée doit être un compte Admin ou Direction actif.";

export type AuthorizedViewerProfile = {
  userId: string;
  fullName: string;
  email: string;
  role: AuthorizedBookViewerRole;
  permissions: AppPermission[];
  label: string;
  roleBadgeLabel: string;
};

export type AuthorizedViewerOption = Pick<AuthorizedViewerProfile, "userId" | "label" | "role">;

export function isAuthorizedBookViewerRole(
  role: AppRole | null | undefined
): role is AuthorizedBookViewerRole {
  return role === "admin" || role === "direction";
}

/** Rôle portail réel : auth/app_metadata prime sur l'historique account_requests. */
export function resolveAccountRequestPortalRole(
  request: Pick<
    AccountAccessRequestRecord,
    "assigned_role" | "requested_role" | "existing_account"
  >
): AppRole | null {
  const authRole = request.existing_account?.role ?? null;
  if (authRole) return authRole;
  return request.assigned_role ?? request.requested_role ?? null;
}

export function permissionsForAuthorizedViewerRequest(
  request: AccountAccessRequestRecord,
  role: AuthorizedBookViewerRole
): AppPermission[] {
  const raw = request.existing_account?.permissions?.length
    ? request.existing_account.permissions
    : (request.assigned_permissions ?? []);

  if (role === "admin") {
    return raw.filter((permission) => permission !== "commissions");
  }

  return raw;
}

export function buildAuthorizedViewerRoleLabel(
  role: AuthorizedBookViewerRole,
  permissions: AppPermission[] = []
): string {
  if (role === "admin") return "Admin";
  if (permissions.includes("commissions")) return "Commissions";
  return "Direction";
}

export function buildAuthorizedViewerSelectLabel(input: {
  fullName: string;
  email: string;
  role: AuthorizedBookViewerRole;
  permissions?: AppPermission[] | null;
}): string {
  const parts: string[] = [];
  const name = input.fullName.trim();
  const email = input.email.trim();
  const roleLabel = buildAuthorizedViewerRoleLabel(input.role, input.permissions ?? []);

  if (name) parts.push(name);
  if (email) parts.push(email);
  if (input.role === "direction" && roleLabel === "Commissions") {
    parts.push(`Direction · ${roleLabel}`);
  } else {
    parts.push(roleLabel);
  }
  return parts.join(" · ");
}

function profileFromRequest(request: AccountAccessRequestRecord): AuthorizedViewerProfile | null {
  const role = resolveAccountRequestPortalRole(request);
  if (!isAuthorizedBookViewerRole(role)) return null;

  const userId = request.existing_account?.userId ?? request.invited_user_id ?? null;
  if (!userId) return null;
  if (request.status !== "active" && request.status !== "invited") return null;
  if (request.existing_account?.accessDisabled) return null;

  const permissions = permissionsForAuthorizedViewerRequest(request, role);
  const roleBadgeLabel = buildAuthorizedViewerRoleLabel(role, permissions);

  return {
    userId,
    fullName: request.full_name,
    email: request.email,
    role,
    permissions,
    roleBadgeLabel,
    label: buildAuthorizedViewerSelectLabel({
      fullName: request.full_name,
      email: request.email,
      role,
      permissions,
    }),
  };
}

function preferAuthorizedViewerProfile(
  current: AuthorizedViewerProfile,
  candidate: AuthorizedViewerProfile
): AuthorizedViewerProfile {
  if (current.role === "admin" && candidate.role !== "admin") return current;
  if (candidate.role === "admin" && current.role !== "admin") return candidate;
  return current;
}

export function buildAuthorizedViewerDirectory(
  requests: AccountAccessRequestRecord[]
): Map<string, AuthorizedViewerProfile> {
  const map = new Map<string, AuthorizedViewerProfile>();

  for (const request of requests) {
    const profile = profileFromRequest(request);
    if (!profile) continue;

    const existing = map.get(profile.userId);
    map.set(
      profile.userId,
      existing ? preferAuthorizedViewerProfile(existing, profile) : profile
    );
  }

  return map;
}

export function buildAuthorizedViewerOptions(
  requests: AccountAccessRequestRecord[]
): AuthorizedViewerOption[] {
  return Array.from(buildAuthorizedViewerDirectory(requests).values())
    .map((profile) => ({
      userId: profile.userId,
      label: profile.label,
      role: profile.role,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function validateAuthorizedViewerAuthUser(
  user: User | null | undefined
): { ok: true; role: AuthorizedBookViewerRole } | { ok: false; error: string } {
  if (!user) {
    return { ok: false, error: "Personne autorisée introuvable." };
  }

  if (readAccessDisabledFromAuthUser(user)) {
    return { ok: false, error: AUTHORIZED_VIEWER_VALIDATION_ERROR };
  }

  const role = getUserRole(user);
  if (!isAuthorizedBookViewerRole(role)) {
    return { ok: false, error: AUTHORIZED_VIEWER_VALIDATION_ERROR };
  }

  return { ok: true, role };
}
