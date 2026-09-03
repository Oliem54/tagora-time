/**
 * Brokered local HORORA session after Nexus ALLOW.
 * Opaque cookie + server hash. Not a Supabase Auth session.
 */

import type { NexusResolvedBinding } from "@/app/lib/auth/nexus-identity-mapping.server";
import {
  NEXUS_BROKERED_SESSION_COOKIE_NAME,
  NEXUS_HANDOFF_AUDIENCE,
} from "@/app/lib/auth/nexus-handoff-config";
import { mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import { type AppRole } from "@/app/lib/auth/roles";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

export { NEXUS_BROKERED_SESSION_COOKIE_NAME };

export const NEXUS_BROKERED_SESSION_TTL_SECONDS = 3600;
export const NEXUS_BROKERED_SESSION_TABLE = "horora_nexus_sessions";
export const NEXUS_BROKERED_SESSION_ISSUER = "horora:brokered-session";

export type SecureCookieEnvironment = "local" | "staging" | "production";

export type NexusBrokeredSessionDenyReason =
  | "session_store_unavailable"
  | "session_missing"
  | "session_expired"
  | "session_revoked"
  | "auth_user_mismatch"
  | "membership_mismatch"
  | "organization_mismatch"
  | "organization_inactive"
  | "cross_tenant"
  | "local_permissions_invalid"
  | "cookie_missing";

export type NexusBrokeredSessionRecord = {
  readonly id: string;
  readonly tokenHash: string;
  readonly authUserId: string;
  readonly organizationId: string;
  readonly nexusActorId: string;
  readonly nexusOrganizationId: string;
  readonly membershipId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
};

export type NexusBrokeredPrincipal = {
  readonly sessionId: string;
  readonly authUserId: string;
  readonly organizationId: string;
  readonly nexusActorId: string;
  readonly nexusOrganizationId: string;
  readonly membershipId: string;
  readonly membershipRole: OrganizationMembershipRole;
  readonly role: AppRole;
  readonly createdAt: string;
  readonly expiresAt: string;
};

export type NexusBrokeredSessionStore = {
  insert(record: Omit<NexusBrokeredSessionRecord, "id"> & { id?: string }): Promise<
    { ok: true; record: NexusBrokeredSessionRecord } | { ok: false; duplicate: boolean }
  >;
  findByTokenHash(tokenHash: string): Promise<NexusBrokeredSessionRecord | null>;
  revokeByTokenHash(
    tokenHash: string,
    revokedAtIso: string
  ): Promise<{ ok: true } | { ok: false }>;
};

export type NexusBrokeredRevalidationLookups = {
  authUserExists(authUserId: string): Promise<boolean>;
  findMembershipById(membershipId: string): Promise<
    | (MembershipRow & { user_id: string })
    | null
  >;
  findOrganizationById(organizationId: string): Promise<{
    id: string;
    status: string;
    deleted_at: string | null;
  } | null>;
};

export type CookieReader = {
  get(name: string): string | undefined;
};

const rememberedPrincipals = new WeakMap<object, NexusBrokeredPrincipal>();

export function rememberBrokeredPrincipal(
  requestKey: object,
  principal: NexusBrokeredPrincipal
): void {
  rememberedPrincipals.set(requestKey, principal);
}

export function getRememberedBrokeredPrincipal(
  requestKey: object
): NexusBrokeredPrincipal | null {
  return rememberedPrincipals.get(requestKey) ?? null;
}

export function resolveBrokeredCookieEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env
): SecureCookieEnvironment {
  if (env.VERCEL === "1" || env.NODE_ENV === "production" || env.VERCEL_ENV) {
    return "staging";
  }
  return "local";
}

export function authorizedHororaPathForRole(role: AppRole): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "direction") return "/direction/dashboard";
  if (role === "employe") return "/employe/dashboard";
  return "/auth/nexus/denied";
}

export function generateOpaqueSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashOpaqueSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function tokenHashFingerprint(tokenHash: string): string {
  return tokenHash.slice(0, 12);
}

export function serializeBrokeredSessionCookie(input: {
  token: string;
  maxAgeSeconds: number;
  environment: SecureCookieEnvironment;
  clear?: boolean;
}): string {
  const secure = input.environment !== "local";
  const maxAge = input.clear ? 0 : input.maxAgeSeconds;
  const parts = [
    `${NEXUS_BROKERED_SESSION_COOKIE_NAME}=${input.clear ? "" : input.token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (input.clear) {
    parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  }
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function serializeClearedBrokeredSessionCookie(
  environment: SecureCookieEnvironment
): string {
  return serializeBrokeredSessionCookie({
    token: "",
    maxAgeSeconds: 0,
    environment,
    clear: true,
  });
}

export function cookieHeaderContainsDomain(header: string): boolean {
  return /(?:^|;)\s*Domain=/i.test(header);
}

export function applyBrokeredSessionCookieHeader(
  response: {
    cookies: {
      set(options: {
        name: string;
        value: string;
        httpOnly: boolean;
        secure: boolean;
        sameSite: "lax";
        path: string;
        maxAge: number;
      }): void;
    };
  },
  cookieHeader: string
): boolean {
  if (!cookieHeader || cookieHeaderContainsDomain(cookieHeader)) return false;
  const prefix = `${NEXUS_BROKERED_SESSION_COOKIE_NAME}=`;
  if (!cookieHeader.startsWith(prefix)) return false;
  const remainder = cookieHeader.slice(prefix.length);
  const separator = remainder.indexOf(";");
  const value = (separator === -1 ? remainder : remainder.slice(0, separator)).trim();
  if (!value) return false;
  const httpOnly = /(?:^|;)\s*HttpOnly(?:;|$)/i.test(cookieHeader);
  const sameSiteLax = /(?:^|;)\s*SameSite=Lax(?:;|$)/i.test(cookieHeader);
  const pathRoot = /(?:^|;)\s*Path=\/(?:;|$)/i.test(cookieHeader);
  const maxAgeMatch = cookieHeader.match(/(?:^|;)\s*Max-Age=(\d+)/i);
  if (!httpOnly || !sameSiteLax || !pathRoot || !maxAgeMatch) return false;
  response.cookies.set({
    name: NEXUS_BROKERED_SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: /(?:^|;)\s*Secure(?:;|$)/i.test(cookieHeader),
    sameSite: "lax",
    path: "/",
    maxAge: Number(maxAgeMatch[1]),
  });
  return true;
}

export function applyClearedBrokeredSessionCookie(
  response: {
    cookies: {
      set(options: {
        name: string;
        value: string;
        httpOnly: boolean;
        secure: boolean;
        sameSite: "lax";
        path: string;
        maxAge: number;
      }): void;
    };
  },
  environment: SecureCookieEnvironment
): void {
  response.cookies.set({
    name: NEXUS_BROKERED_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: environment !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function createMemoryBrokeredSessionStore(): NexusBrokeredSessionStore {
  const rows = new Map<string, NexusBrokeredSessionRecord>();
  return {
    async insert(record) {
      if (rows.has(record.tokenHash)) {
        return { ok: false, duplicate: true };
      }
      const stored: NexusBrokeredSessionRecord = {
        id: record.id ?? crypto.randomUUID(),
        tokenHash: record.tokenHash,
        authUserId: record.authUserId,
        organizationId: record.organizationId,
        nexusActorId: record.nexusActorId,
        nexusOrganizationId: record.nexusOrganizationId,
        membershipId: record.membershipId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        revokedAt: record.revokedAt,
      };
      rows.set(stored.tokenHash, stored);
      return { ok: true, record: stored };
    },
    async findByTokenHash(tokenHash) {
      return rows.get(tokenHash) ?? null;
    },
    async revokeByTokenHash(tokenHash, revokedAtIso) {
      const existing = rows.get(tokenHash);
      if (!existing) return { ok: false };
      rows.set(tokenHash, { ...existing, revokedAt: revokedAtIso });
      return { ok: true };
    },
  };
}

export async function defaultBrokeredSessionStore(): Promise<NexusBrokeredSessionStore> {
  const { createAdminSupabaseClient } = await import("@/app/lib/supabase/admin");
  const supabase = createAdminSupabaseClient();
  return {
    async insert(record) {
      const { data, error } = await supabase
        .from(NEXUS_BROKERED_SESSION_TABLE)
        .insert({
          token_hash: record.tokenHash,
          auth_user_id: record.authUserId,
          organization_id: record.organizationId,
          nexus_actor_id: record.nexusActorId,
          nexus_organization_id: record.nexusOrganizationId,
          membership_id: record.membershipId,
          created_at: record.createdAt,
          expires_at: record.expiresAt,
          revoked_at: record.revokedAt,
        })
        .select(
          "id, token_hash, auth_user_id, organization_id, nexus_actor_id, nexus_organization_id, membership_id, created_at, expires_at, revoked_at"
        )
        .single();
      if (error?.code === "23505") return { ok: false, duplicate: true };
      if (error || !data || typeof data.id !== "string") {
        throw new Error("session_store_unavailable");
      }
      return { ok: true, record: mapSessionRow(data as Record<string, unknown>) };
    },
    async findByTokenHash(tokenHash) {
      const { data, error } = await supabase
        .from(NEXUS_BROKERED_SESSION_TABLE)
        .select(
          "id, token_hash, auth_user_id, organization_id, nexus_actor_id, nexus_organization_id, membership_id, created_at, expires_at, revoked_at"
        )
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) throw new Error("session_store_unavailable");
      if (!data) return null;
      return mapSessionRow(data as Record<string, unknown>);
    },
    async revokeByTokenHash(tokenHash, revokedAtIso) {
      const { error } = await supabase
        .from(NEXUS_BROKERED_SESSION_TABLE)
        .update({ revoked_at: revokedAtIso })
        .eq("token_hash", tokenHash);
      if (error) return { ok: false };
      return { ok: true };
    },
  };
}

export async function defaultBrokeredRevalidationLookups(): Promise<NexusBrokeredRevalidationLookups> {
  const { createAdminSupabaseClient } = await import("@/app/lib/supabase/admin");
  const supabase = createAdminSupabaseClient();
  return {
    async authUserExists(authUserId) {
      const { data, error } = await supabase.auth.admin.getUserById(authUserId);
      if (error || !data.user?.id) return false;
      return data.user.id === authUserId;
    },
    async findMembershipById(membershipId) {
      const { data, error } = await supabase
        .from("organization_memberships")
        .select("id, organization_id, role, status, is_default, user_id")
        .eq("id", membershipId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return data as MembershipRow & { user_id: string };
    },
    async findOrganizationById(organizationId) {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, status, deleted_at")
        .eq("id", organizationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id as string,
        status: data.status as string,
        deleted_at: (data.deleted_at as string | null) ?? null,
      };
    },
  };
}

export async function createBrokeredHororaSession(
  binding: NexusResolvedBinding,
  options: {
    store?: NexusBrokeredSessionStore;
    now?: Date;
    environment?: SecureCookieEnvironment;
    ttlSeconds?: number;
  } = {}
): Promise<
  | {
      readonly ok: true;
      readonly cookieHeader: string;
      readonly redirectPath: string;
      readonly sessionId: string;
      readonly fingerprint: string;
    }
  | { readonly ok: false; readonly reason: NexusBrokeredSessionDenyReason }
> {
  const now = options.now ?? new Date();
  const ttl = options.ttlSeconds ?? NEXUS_BROKERED_SESSION_TTL_SECONDS;
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  const token = generateOpaqueSessionToken();
  const tokenHash = await hashOpaqueSessionToken(token);
  try {
    const store = options.store ?? (await defaultBrokeredSessionStore());
    const inserted = await store.insert({
      tokenHash,
      authUserId: binding.authUserId,
      organizationId: binding.organizationId,
      nexusActorId: binding.nexusActorId,
      nexusOrganizationId: binding.nexusOrganizationId,
      membershipId: binding.membershipId,
      createdAt,
      expiresAt,
      revokedAt: null,
    });
    if (!inserted.ok) {
      return { ok: false, reason: "session_store_unavailable" };
    }
    const environment = options.environment ?? resolveBrokeredCookieEnvironment();
    return {
      ok: true,
      cookieHeader: serializeBrokeredSessionCookie({
        token,
        maxAgeSeconds: ttl,
        environment,
      }),
      redirectPath: authorizedHororaPathForRole(binding.role),
      sessionId: inserted.record.id,
      fingerprint: tokenHashFingerprint(tokenHash),
    };
  } catch {
    return { ok: false, reason: "session_store_unavailable" };
  }
}

export async function resolveBrokeredHororaSessionFromCookies(
  cookies: CookieReader,
  options: {
    store?: NexusBrokeredSessionStore;
    lookups?: NexusBrokeredRevalidationLookups;
    now?: Date;
    requestKey?: object;
  } = {}
): Promise<
  | { readonly ok: true; readonly principal: NexusBrokeredPrincipal }
  | { readonly ok: false; readonly reason: NexusBrokeredSessionDenyReason }
> {
  const raw = cookies.get(NEXUS_BROKERED_SESSION_COOKIE_NAME)?.trim() ?? "";
  if (!raw) return { ok: false, reason: "cookie_missing" };
  try {
    const tokenHash = await hashOpaqueSessionToken(raw);
    const store = options.store ?? (await defaultBrokeredSessionStore());
    const record = await store.findByTokenHash(tokenHash);
    if (!record) return { ok: false, reason: "session_missing" };
    const now = options.now ?? new Date();
    if (record.revokedAt) return { ok: false, reason: "session_revoked" };
    if (Date.parse(record.expiresAt) <= now.getTime()) {
      return { ok: false, reason: "session_expired" };
    }
    const lookups = options.lookups ?? (await defaultBrokeredRevalidationLookups());
    const authExists = await lookups.authUserExists(record.authUserId);
    if (!authExists) return { ok: false, reason: "auth_user_mismatch" };
    const membership = await lookups.findMembershipById(record.membershipId);
    if (!membership || membership.id !== record.membershipId) {
      return { ok: false, reason: "membership_mismatch" };
    }
    if (membership.user_id !== record.authUserId) {
      return { ok: false, reason: "auth_user_mismatch" };
    }
    if (membership.status !== "active") {
      return { ok: false, reason: "local_permissions_invalid" };
    }
    if (membership.organization_id !== record.organizationId) {
      return { ok: false, reason: "cross_tenant" };
    }
    const role = mapOrganizationMembershipRoleToAppRole(membership.role);
    if (!role) {
      return { ok: false, reason: "local_permissions_invalid" };
    }
    const organization = await lookups.findOrganizationById(record.organizationId);
    if (!organization || organization.id !== record.organizationId) {
      return { ok: false, reason: "organization_mismatch" };
    }
    if (organization.deleted_at || organization.status !== "active") {
      return { ok: false, reason: "organization_inactive" };
    }
    const principal: NexusBrokeredPrincipal = {
      sessionId: record.id,
      authUserId: record.authUserId,
      organizationId: record.organizationId,
      nexusActorId: record.nexusActorId,
      nexusOrganizationId: record.nexusOrganizationId,
      membershipId: record.membershipId,
      membershipRole: membership.role as OrganizationMembershipRole,
      role,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
    if (options.requestKey) {
      rememberBrokeredPrincipal(options.requestKey, principal);
    }
    return { ok: true, principal };
  } catch {
    return { ok: false, reason: "session_store_unavailable" };
  }
}

export async function revokeBrokeredHororaSessionFromCookies(
  cookies: CookieReader,
  options: {
    store?: NexusBrokeredSessionStore;
    now?: Date;
  } = {}
): Promise<{ fingerprint: string | null; storeOk: boolean }> {
  const raw = cookies.get(NEXUS_BROKERED_SESSION_COOKIE_NAME)?.trim() ?? "";
  if (!raw) return { fingerprint: null, storeOk: true };
  try {
    const tokenHash = await hashOpaqueSessionToken(raw);
    const fingerprint = tokenHashFingerprint(tokenHash);
    try {
      const store = options.store ?? (await defaultBrokeredSessionStore());
      const revokedAt = (options.now ?? new Date()).toISOString();
      const result = await store.revokeByTokenHash(tokenHash, revokedAt);
      return { fingerprint, storeOk: result.ok };
    } catch {
      return { fingerprint, storeOk: false };
    }
  } catch {
    return { fingerprint: null, storeOk: false };
  }
}

export function toBrokeredVerifiedIdentity(principal: NexusBrokeredPrincipal): {
  readonly userId: string;
  readonly subject: string;
  readonly issuer: string;
  readonly audience: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly notBefore: null;
  readonly authMethod: "nexus_handoff";
} {
  return Object.freeze({
    userId: principal.authUserId,
    subject: principal.authUserId,
    issuer: NEXUS_BROKERED_SESSION_ISSUER,
    audience: NEXUS_HANDOFF_AUDIENCE,
    issuedAt: Math.floor(Date.parse(principal.createdAt) / 1000),
    expiresAt: Math.floor(Date.parse(principal.expiresAt) / 1000),
    notBefore: null,
    authMethod: "nexus_handoff" as const,
  });
}

export function readBrokeredSessionCookieFromHeader(
  cookieHeader: string | null
): CookieReader {
  const map = new Map<string, string>();
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const trimmed = part.trim();
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const name = trimmed.slice(0, separator);
      if (!map.has(name)) {
        map.set(name, trimmed.slice(separator + 1));
      }
    }
  }
  return {
    get(name: string) {
      return map.get(name);
    },
  };
}

function mapSessionRow(row: Record<string, unknown>): NexusBrokeredSessionRecord {
  return {
    id: String(row.id),
    tokenHash: String(row.token_hash),
    authUserId: String(row.auth_user_id),
    organizationId: String(row.organization_id),
    nexusActorId: String(row.nexus_actor_id),
    nexusOrganizationId: String(row.nexus_organization_id),
    membershipId: String(row.membership_id),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
