/**
 * Server-only signed read of Nexus AuthorizedModuleDirectory.
 * The private JWK stays in process env. Responses never include it or the JWT.
 */

import { randomUUID } from "node:crypto";
import type { JWK } from "jose";
import {
  HORORA_PRODUCTION_VERCEL_PROJECT_ID,
  HORORA_STAGING_VERCEL_PROJECT_ID,
} from "@/app/lib/canonical-domains";
import {
  HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
  HORORA_DIRECTORY_REFRESH_MS,
  isCanonicalNexusUserId,
  selectLocalCanonicalNexusUserId,
  type AuthorizedModuleDirectory,
  type AuthorizedModuleDirectoryEntry,
  type HororaCanonicalIdentityLink,
  type HororaDirectoryAccessStatus,
  type HororaDirectoryScope,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";
import {
  HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH,
  HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV,
  planAuthorizedDirectoryRequest,
  type HororaDirectoryServiceStatus,
} from "@/app/lib/auth/horora-authorized-module-directory-client.shared";
import { signHororaDirectoryAssertion } from "@/app/lib/auth/horora-directory-service-assertion.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const NEXUS_STAGING_DIRECTORY_ORIGIN = "https://app.staging.tagora.ca" as const;

/** One consolidated Nexus preview. Not a stable Staging alias. */
export const NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN =
  "https://tagora-nexus-staging-1m52r47y5-oliem54s-projects.vercel.app" as const;

export const HORORA_DIRECTORY_NEXUS_ORIGIN_ENV = "HORORA_DIRECTORY_NEXUS_ORIGIN" as const;

export const HORORA_DIRECTORY_CONSOLIDATED_PROOF_ENV =
  "HORORA_DIRECTORY_CONSOLIDATED_PROOF" as const;

const CONSOLIDATED_SCOPE = {
  tenantId: "tenant_tagora_internal",
  organizationId: "org_tagora_internal",
  moduleKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
} as const;

export const HORORA_DIRECTORY_STAGING_KEY_ID =
  "horora-staging-directory-es256-2026-11-12" as const;

const DIRECTORY_STATUSES = new Set(["ACTIVE", "PENDING", "SUSPENDED", "REVOKED"]);

type DirectoryEnv = Record<string, string | undefined>;

export type HororaDirectoryFetchFailure = {
  ok: false;
  httpStatus: number | null;
  classification:
    | "service_unavailable"
    | "query_rejected"
    | "unauthorized"
    | "tenant_isolated"
    | "contract_rejected";
  reasonCode: string | null;
};

export type HororaDirectoryFetchSuccess = {
  ok: true;
  httpStatus: 200;
  reasonCode: string;
  tenantId: string;
  organizationId: string;
  moduleKey: typeof HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY;
  businessPermissionsAuthority: false;
  defaultBusinessAccess: "DENY";
  identityMatch: "EXPLICIT_NUSER_MAPPING_ONLY";
  entries: AuthorizedModuleDirectoryEntry[];
};

export type HororaDirectoryFetchResult =
  | HororaDirectoryFetchSuccess
  | HororaDirectoryFetchFailure;

export type DirectorySessionObservation =
  | "held"
  | "unavailable"
  | "absent"
  | "active"
  | "pending"
  | "suspended"
  | "revoked";

const directoryCache = new Map<string, { at: number; result: HororaDirectoryFetchResult }>();

export function clearHororaDirectoryCacheForTests(): void {
  directoryCache.clear();
}

export function resolveHororaDirectoryOrigin(env: DirectoryEnv): string {
  const override = (env[HORORA_DIRECTORY_NEXUS_ORIGIN_ENV] ?? "").trim().replace(/\/$/, "");
  if (!override) return NEXUS_STAGING_DIRECTORY_ORIGIN;
  if (override === NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN) return override;
  return "";
}

export function isHororaStagingDirectoryRuntime(env: DirectoryEnv): boolean {
  const project = (env.VERCEL_PROJECT_ID ?? "").trim();
  const vercelEnv = (env.VERCEL_ENV ?? "").trim();
  if (!project || project !== HORORA_STAGING_VERCEL_PROJECT_ID) return false;
  if (vercelEnv === "production") return false;
  return vercelEnv === "preview";
}

export function readHororaDirectoryPrivateJwk(env: DirectoryEnv): JWK | null {
  const raw = (env[HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV] ?? "").trim();
  if (!raw || raw === "[SENSITIVE]") return null;
  try {
    const parsed = JSON.parse(raw) as JWK;
    if (parsed.kty !== "EC" || parsed.crv !== "P-256" || parsed.d === undefined) return null;
    if ((parsed.kid ?? "").trim() !== HORORA_DIRECTORY_STAGING_KEY_ID) return null;
    if (parsed.alg && parsed.alg !== "ES256") return null;
    return parsed;
  } catch {
    return null;
  }
}

function unavailable(reasonCode: string | null = "NEXUS_UNAVAILABLE"): HororaDirectoryFetchFailure {
  return { ok: false, httpStatus: null, classification: "service_unavailable", reasonCode };
}

function cacheKey(query: HororaDirectoryScope): string {
  return `${query.tenantId}|${query.organizationId}|${query.moduleKey}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseEntry(
  value: unknown,
  query: HororaDirectoryScope
): AuthorizedModuleDirectoryEntry | null {
  const row = asRecord(value);
  if (!row) return null;
  const userId = text(row.userId);
  const status = text(row.status);
  const organizationId = text(row.organizationId);
  const tenantId = text(row.tenantId);
  const technicalKey = text(row.technicalKey);
  if (!isCanonicalNexusUserId(userId)) return null;
  if (!DIRECTORY_STATUSES.has(status)) return null;
  if (technicalKey !== query.moduleKey) return null;
  if (organizationId !== query.organizationId) return null;
  if (tenantId !== query.tenantId) return null;
  if ("businessPermissions" in row && row.businessPermissions != null) return null;
  if ("defaultBusinessAccess" in row && row.defaultBusinessAccess !== "DENY") return null;
  const accessVersion = row.accessVersion;
  return {
    userId,
    displayName: text(row.displayName) || "Utilisateur Nexus",
    contactEmail: text(row.contactEmail) || null,
    technicalKey,
    status: status as Exclude<HororaDirectoryAccessStatus, "ABSENT">,
    organizationId,
    tenantId,
    nexusRoleKey: text(row.nexusRoleKey) || null,
    ...(typeof accessVersion === "number" ? { accessVersion } : {}),
  };
}

export function parseAuthorizedDirectoryPayload(
  payload: unknown,
  query: HororaDirectoryScope
): HororaDirectoryFetchSuccess | HororaDirectoryFetchFailure {
  const body = asRecord(payload);
  if (!body) return { ok: false, httpStatus: 200, classification: "contract_rejected", reasonCode: null };
  if (body.contract !== "AUTHORIZED_MODULE_DIRECTORY_V1") {
    return { ok: false, httpStatus: 200, classification: "contract_rejected", reasonCode: text(body.reasonCode) || null };
  }
  if (body.ok !== true || body.complete !== true) {
    const reasonCode = text(body.reasonCode) || null;
    const isolated =
      reasonCode === "ORGANIZATION_DENIED" ||
      reasonCode === "TENANT_UNKNOWN" ||
      reasonCode === "TENANT_INACTIVE" ||
      reasonCode === "ORGANIZATION_INACTIVE";
    return {
      ok: false,
      httpStatus: 200,
      classification: isolated ? "tenant_isolated" : "contract_rejected",
      reasonCode,
    };
  }
  if (body.businessPermissionsAuthority !== false) {
    return { ok: false, httpStatus: 200, classification: "contract_rejected", reasonCode: "BUSINESS_PERMISSIONS" };
  }
  if (body.defaultBusinessAccess !== "DENY") {
    return { ok: false, httpStatus: 200, classification: "contract_rejected", reasonCode: "DEFAULT_ACCESS" };
  }
  if (body.identityMatch !== "EXPLICIT_NUSER_MAPPING_ONLY" || body.emailMatch !== "FORBIDDEN") {
    return { ok: false, httpStatus: 200, classification: "contract_rejected", reasonCode: "IDENTITY_MATCH" };
  }
  if (text(body.tenantId) !== query.tenantId || text(body.organizationId) !== query.organizationId) {
    return { ok: false, httpStatus: 200, classification: "tenant_isolated", reasonCode: "SCOPE_MISMATCH" };
  }
  if (text(body.moduleKey) !== query.moduleKey) {
    return { ok: false, httpStatus: 200, classification: "contract_rejected", reasonCode: "MODULE_MISMATCH" };
  }
  if (!Array.isArray(body.entries)) {
    return { ok: false, httpStatus: 200, classification: "contract_rejected", reasonCode: "ENTRIES" };
  }
  const entries: AuthorizedModuleDirectoryEntry[] = [];
  for (const item of body.entries) {
    const entry = parseEntry(item, query);
    if (entry) entries.push(entry);
  }
  return {
    ok: true,
    httpStatus: 200,
    reasonCode: text(body.reasonCode) || "DIRECTORY_READY",
    tenantId: query.tenantId,
    organizationId: query.organizationId,
    moduleKey: query.moduleKey,
    businessPermissionsAuthority: false,
    defaultBusinessAccess: "DENY",
    identityMatch: "EXPLICIT_NUSER_MAPPING_ONLY",
    entries,
  };
}

function classifyHttpFailure(
  status: number,
  payload: unknown
): HororaDirectoryFetchFailure {
  const body = asRecord(payload);
  const reasonCode = text(body?.reasonCode) || null;
  if (status === 401) {
    return { ok: false, httpStatus: status, classification: "unauthorized", reasonCode };
  }
  if (status === 400) {
    return { ok: false, httpStatus: status, classification: "query_rejected", reasonCode };
  }
  if (
    status === 403 &&
    (reasonCode === "ORGANIZATION_DENIED" ||
      reasonCode === "TENANT_UNKNOWN" ||
      reasonCode === "TENANT_INACTIVE" ||
      reasonCode === "ORGANIZATION_INACTIVE" ||
      reasonCode === "SUBSCRIPTION_INACTIVE" ||
      reasonCode === "MODULE_UNKNOWN" ||
      reasonCode === "MODULE_CLOSED" ||
      reasonCode === "SERVICE_CLIENT_DENIED")
  ) {
    const isolated = reasonCode !== "SERVICE_CLIENT_DENIED" && reasonCode !== "MODULE_UNKNOWN" && reasonCode !== "MODULE_CLOSED";
    return {
      ok: false,
      httpStatus: status,
      classification: isolated ? "tenant_isolated" : "unauthorized",
      reasonCode,
    };
  }
  if (status === 503 || reasonCode === "NEXUS_UNAVAILABLE") {
    return { ok: false, httpStatus: status, classification: "service_unavailable", reasonCode };
  }
  return { ok: false, httpStatus: status, classification: "service_unavailable", reasonCode };
}

export function sessionRevocationDecision(input: {
  list: "ready" | "unavailable";
  status: HororaDirectoryAccessStatus | null;
}): { action: "keep" | "revoke"; observation: DirectorySessionObservation } {
  if (input.list === "unavailable") return { action: "keep", observation: "unavailable" };
  if (input.status === "REVOKED") return { action: "revoke", observation: "revoked" };
  if (input.status === "SUSPENDED") return { action: "revoke", observation: "suspended" };
  if (input.status === "ACTIVE") return { action: "keep", observation: "active" };
  if (input.status === "PENDING") return { action: "keep", observation: "pending" };
  return { action: "keep", observation: "absent" };
}

export async function fetchHororaStagingDirectory(input: {
  query: HororaDirectoryScope;
  env?: DirectoryEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
  allowOutsideVercel?: boolean;
}): Promise<HororaDirectoryFetchResult> {
  const env = input.env ?? process.env;
  const project = (env.VERCEL_PROJECT_ID ?? "").trim();
  const vercelEnv = (env.VERCEL_ENV ?? "").trim();
  if (project === HORORA_PRODUCTION_VERCEL_PROJECT_ID || vercelEnv === "production") {
    return unavailable("RUNTIME_FORBIDDEN");
  }
  if (!input.allowOutsideVercel && !isHororaStagingDirectoryRuntime(env)) {
    return unavailable("RUNTIME_HELD");
  }
  const plan = planAuthorizedDirectoryRequest(input.query);
  if (!plan.ok) {
    return { ok: false, httpStatus: null, classification: "query_rejected", reasonCode: "FILTER_REQUIRED" };
  }
  const privateJwk = readHororaDirectoryPrivateJwk(env);
  if (!privateJwk) return unavailable("DIRECTORY_KEY_UNAVAILABLE");
  let assertion = "";
  try {
    assertion = await signHororaDirectoryAssertion({
      privateJwk,
      query: plan.request.query,
      jti: randomUUID(),
      now: input.now,
    });
  } catch {
    return unavailable("DIRECTORY_KEY_UNAVAILABLE");
  }
  const origin = resolveHororaDirectoryOrigin(env);
  if (!origin) return unavailable("ORIGIN_REJECTED");
  const url = new URL(HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH, origin);
  url.searchParams.set("tenantId", plan.request.query.tenantId);
  url.searchParams.set("organizationId", plan.request.query.organizationId);
  url.searchParams.set("moduleKey", plan.request.query.moduleKey);
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${assertion}`,
      },
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return unavailable();
  }
  if (response.status >= 300 && response.status < 400) return unavailable("REDIRECT_REJECTED");
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return unavailable();
  }
  if (!response.ok) return classifyHttpFailure(response.status, payload);
  const parsed = parseAuthorizedDirectoryPayload(payload, plan.request.query);
  if (!parsed.ok) return { ...parsed, httpStatus: response.status };
  return parsed;
}

async function readCachedDirectory(input: {
  query: HororaDirectoryScope;
  env: DirectoryEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<HororaDirectoryFetchResult> {
  const key = cacheKey(input.query);
  const nowMs = (input.now ?? new Date()).getTime();
  const cached = directoryCache.get(key);
  if (cached && nowMs - cached.at < HORORA_DIRECTORY_REFRESH_MS) return cached.result;
  const result = await fetchHororaStagingDirectory({
    query: input.query,
    env: input.env,
    fetchImpl: input.fetchImpl,
    now: input.now,
  });
  directoryCache.set(key, { at: nowMs, result });
  return result;
}

/** Production keeps this result. A local nuser display is not a directory grant. */
export function uncertifiedDirectoryRead(): {
  ok: false;
  status: "service_uncertified";
  directory: null;
  revocationEnforced: false;
  localCanonicalIdentityGrantsAccess: false;
} {
  return {
    ok: false,
    status: "service_uncertified",
    directory: null,
    revocationEnforced: false,
    localCanonicalIdentityGrantsAccess: false,
  };
}

export function localCanonicalNexusUserIdForUncertifiedDirectory(input: {
  authUserId: string | null;
  links: readonly HororaCanonicalIdentityLink[];
  scope: HororaDirectoryScope | null;
}): string | null {
  return selectLocalCanonicalNexusUserId({
    authUserId: input.authUserId,
    links: input.links,
    scope: input.scope,
    directoryConnected: false,
  });
}

export async function readLiveAuthorizedModuleDirectory(input: {
  query: HororaDirectoryScope;
  env?: DirectoryEnv;
  fetchImpl?: typeof fetch;
}): Promise<
  | {
      ok: true;
      status: "ready";
      directory: AuthorizedModuleDirectory;
      revocationEnforced: true;
    }
  | {
      ok: false;
      status: Exclude<HororaDirectoryServiceStatus, "ready">;
      directory: null;
      revocationEnforced: false;
      localCanonicalIdentityGrantsAccess?: false;
    }
> {
  const env = input.env ?? process.env;
  if (!isHororaStagingDirectoryRuntime(env)) {
    return uncertifiedDirectoryRead();
  }
  const fetched = await fetchHororaStagingDirectory({
    query: input.query,
    env,
    fetchImpl: input.fetchImpl,
  });
  if (!fetched.ok) {
    const status: Exclude<HororaDirectoryServiceStatus, "ready"> =
      fetched.classification === "query_rejected" ? "query_rejected" : "service_unavailable";
    return { ok: false, status, directory: null, revocationEnforced: false };
  }
  return {
    ok: true,
    status: "ready",
    revocationEnforced: true,
    directory: {
      technicalKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
      connected: true,
      entries: fetched.entries,
    },
  };
}

async function loadActiveDirectoryScope(input: {
  hororaOrganizationId: string;
  nexusOrganizationId: string;
}): Promise<HororaDirectoryScope | null> {
  const admin = createAdminSupabaseClient();
  const mapResult = await admin
    .from("horora_nexus_organization_map")
    .select("nexus_organization_id, nexus_tenant_id, organization_id, status")
    .eq("organization_id", input.hororaOrganizationId)
    .eq("status", "active");
  if (mapResult.error || !Array.isArray(mapResult.data) || mapResult.data.length !== 1) return null;
  const row = mapResult.data[0];
  const tenantId = text(row.nexus_tenant_id);
  const nexusOrganizationId = text(row.nexus_organization_id);
  if (!tenantId || nexusOrganizationId !== input.nexusOrganizationId) return null;
  return {
    tenantId,
    organizationId: nexusOrganizationId,
    moduleKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
  };
}

export async function inspectLiveDirectorySession(input: {
  nexusActorId: string;
  hororaOrganizationId: string;
  nexusOrganizationId: string;
  env?: DirectoryEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
  scope?: HororaDirectoryScope | null;
}): Promise<{ action: "keep" | "revoke"; observation: DirectorySessionObservation }> {
  const env = input.env ?? process.env;
  if (!isHororaStagingDirectoryRuntime(env)) return { action: "keep", observation: "held" };
  if (!isCanonicalNexusUserId(input.nexusActorId)) {
    return { action: "keep", observation: "absent" };
  }
  let scope = input.scope ?? null;
  if (!scope) {
    try {
      scope = await loadActiveDirectoryScope({
        hororaOrganizationId: input.hororaOrganizationId,
        nexusOrganizationId: input.nexusOrganizationId,
      });
    } catch {
      return { action: "keep", observation: "unavailable" };
    }
  }
  if (!scope) return { action: "keep", observation: "unavailable" };
  let listed: HororaDirectoryFetchResult;
  try {
    listed = await readCachedDirectory({
      query: scope,
      env,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
  } catch {
    return { action: "keep", observation: "unavailable" };
  }
  if (!listed.ok) return sessionRevocationDecision({ list: "unavailable", status: null });
  const entry = listed.entries.find((row) => row.userId === input.nexusActorId) ?? null;
  return sessionRevocationDecision({
    list: "ready",
    status: entry?.status ?? "ABSENT",
  });
}

const PROOF_STATUSES = new Set(["ACTIVE", "PENDING", "SUSPENDED", "REVOKED"]);

export type DirectoryCallSummary = {
  httpStatus: number | null;
  reasonCode: string | null;
  contentType: string;
  contract: string | null;
  complete: boolean | null;
  tenantId: string | null;
  organizationId: string | null;
  moduleKey: string | null;
  businessPermissionsAuthority: boolean | null;
  defaultBusinessAccess: string | null;
  identityMatch: string | null;
  emailMatch: string | null;
  entryCount: number;
  canonicalUserCount: number;
  statusCounts: Record<string, number>;
  roleKeys: string[];
  sensitivePermissionPresent: boolean;
  htmlBody: boolean;
};

export type ConsolidatedDirectoryProof = {
  signedRequestSent: boolean;
  originHost: string;
  directory: DirectoryCallSummary;
  replay: { httpStatus: number | null; reasonCode: string | null };
  foreign: { httpStatus: number | null; reasonCode: string | null };
  directoryReady: boolean;
  realDirectoryData: boolean;
  replayDenied: boolean;
  foreignTenantDenied: boolean;
  moduleAuthorization: boolean;
  sensitivePermissionDisclosed: boolean;
  failureDependency: string | null;
};

function emptyCall(): DirectoryCallSummary {
  return {
    httpStatus: null,
    reasonCode: null,
    contentType: "",
    contract: null,
    complete: null,
    tenantId: null,
    organizationId: null,
    moduleKey: null,
    businessPermissionsAuthority: null,
    defaultBusinessAccess: null,
    identityMatch: null,
    emailMatch: null,
    entryCount: 0,
    canonicalUserCount: 0,
    statusCounts: {},
    roleKeys: [],
    sensitivePermissionPresent: false,
    htmlBody: false,
  };
}

function sensitivePermissionPresent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => sensitivePermissionPresent(item));
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      (normalized === "businesspermissions" || normalized === "businesspermission") &&
      nested != null
    ) {
      return true;
    }
    if (sensitivePermissionPresent(nested)) return true;
  }
  return false;
}

function summarizeDirectoryCall(
  status: number | null,
  contentType: string,
  payload: unknown
): DirectoryCallSummary {
  const summary = emptyCall();
  summary.httpStatus = status;
  summary.contentType = contentType;
  summary.htmlBody = contentType.includes("text/html");
  const body = asRecord(payload);
  if (!body) return summary;
  summary.sensitivePermissionPresent = sensitivePermissionPresent(body);
  summary.reasonCode = text(body.reasonCode) || null;
  summary.contract = text(body.contract) || null;
  summary.complete = typeof body.complete === "boolean" ? body.complete : null;
  summary.tenantId = text(body.tenantId) || null;
  summary.organizationId = text(body.organizationId) || null;
  summary.moduleKey = text(body.moduleKey) || null;
  summary.businessPermissionsAuthority =
    typeof body.businessPermissionsAuthority === "boolean"
      ? body.businessPermissionsAuthority
      : null;
  summary.defaultBusinessAccess = text(body.defaultBusinessAccess) || null;
  summary.identityMatch = text(body.identityMatch) || null;
  summary.emailMatch = text(body.emailMatch) || null;
  if (!Array.isArray(body.entries)) return summary;
  const roles = new Set<string>();
  for (const item of body.entries) {
    const row = asRecord(item);
    if (!row) continue;
    summary.entryCount += 1;
    const userId = text(row.userId);
    if (isCanonicalNexusUserId(userId)) summary.canonicalUserCount += 1;
    const statusName = text(row.status);
    if (PROOF_STATUSES.has(statusName)) {
      summary.statusCounts[statusName] = (summary.statusCounts[statusName] ?? 0) + 1;
    }
    const role = text(row.nexusRoleKey);
    if (role && !role.includes("@") && role.length <= 64) roles.add(role);
  }
  summary.roleKeys = Array.from(roles).slice(0, 12);
  return summary;
}

async function dispatchDirectoryGet(input: {
  origin: string;
  query: HororaDirectoryScope;
  assertion: string;
  fetchImpl: typeof fetch;
}): Promise<DirectoryCallSummary> {
  const url = new URL(HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH, input.origin);
  url.searchParams.set("tenantId", input.query.tenantId);
  url.searchParams.set("organizationId", input.query.organizationId);
  url.searchParams.set("moduleKey", input.query.moduleKey);
  let response: Response;
  try {
    response = await input.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.assertion}`,
      },
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return { ...emptyCall(), reasonCode: "NETWORK" };
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status >= 300 && response.status < 400) {
    return { ...emptyCall(), httpStatus: response.status, contentType, reasonCode: "REDIRECT_REJECTED" };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return summarizeDirectoryCall(response.status, contentType, payload);
}

function failureDependency(input: {
  directory: DirectoryCallSummary;
  replayStatus: number | null;
}): string | null {
  const status = input.directory.httpStatus;
  const reason = input.directory.reasonCode;
  if (input.directory.htmlBody) return "VERCEL_DEPLOYMENT_PROTECTION";
  if (status === 200 && reason === "DIRECTORY_READY") return null;
  if (status === 503 && reason === "NEXUS_UNAVAILABLE" && input.replayStatus === 401) {
    return "NEXUS_AUTHORITY_SNAPSHOT";
  }
  if (status === 503 && input.replayStatus === 503) {
    return "NEXUS_DIRECTORY_SERVICE_SCOPE_TAGORA_TIME";
  }
  if (status === 401 && reason === "SERVICE_CLIENT_DENIED") return "SERVICE_AUTHENTICATION";
  if (status === 403 && reason === "ORGANIZATION_DENIED") return "SERVICE_SCOPE_ALLOWLIST";
  if (status === 403 && (reason === "MODULE_UNKNOWN" || reason === "MODULE_CLOSED")) {
    return "MODULE_KEY";
  }
  return reason;
}

export async function runConsolidatedDirectoryProof(input: {
  env?: DirectoryEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
} = {}): Promise<ConsolidatedDirectoryProof> {
  const env = input.env ?? process.env;
  const refused = (dependency: string): ConsolidatedDirectoryProof => ({
    signedRequestSent: false,
    originHost: "",
    directory: emptyCall(),
    replay: { httpStatus: null, reasonCode: null },
    foreign: { httpStatus: null, reasonCode: null },
    directoryReady: false,
    realDirectoryData: false,
    replayDenied: false,
    foreignTenantDenied: false,
    moduleAuthorization: false,
    sensitivePermissionDisclosed: false,
    failureDependency: dependency,
  });
  const project = (env.VERCEL_PROJECT_ID ?? "").trim();
  const vercelEnv = (env.VERCEL_ENV ?? "").trim();
  if (project === HORORA_PRODUCTION_VERCEL_PROJECT_ID || vercelEnv === "production") {
    return refused("RUNTIME_FORBIDDEN");
  }
  if ((env[HORORA_DIRECTORY_CONSOLIDATED_PROOF_ENV] ?? "").trim() !== "1") {
    return refused("PROOF_DISABLED");
  }
  if (resolveHororaDirectoryOrigin(env) !== NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN) {
    return refused("ORIGIN_NOT_THE_CONSOLIDATED_CANDIDATE");
  }
  const privateJwk = readHororaDirectoryPrivateJwk(env);
  if (!privateJwk) return refused("DIRECTORY_KEY_UNAVAILABLE");
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  let assertion = "";
  try {
    assertion = await signHororaDirectoryAssertion({
      privateJwk,
      query: CONSOLIDATED_SCOPE,
      jti: randomUUID(),
      now,
    });
  } catch {
    return refused("DIRECTORY_KEY_UNAVAILABLE");
  }
  const directory = await dispatchDirectoryGet({
    origin: NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN,
    query: CONSOLIDATED_SCOPE,
    assertion,
    fetchImpl,
  });
  const replay = await dispatchDirectoryGet({
    origin: NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN,
    query: CONSOLIDATED_SCOPE,
    assertion,
    fetchImpl,
  });
  let foreignAssertion = "";
  try {
    foreignAssertion = await signHororaDirectoryAssertion({
      privateJwk,
      query: {
        tenantId: "tenant_isolation_probe",
        organizationId: "org_isolation_probe",
        moduleKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
      },
      jti: randomUUID(),
      now,
    });
  } catch {
    foreignAssertion = "";
  }
  const foreign = foreignAssertion
    ? await dispatchDirectoryGet({
        origin: NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN,
        query: {
          tenantId: "tenant_isolation_probe",
          organizationId: "org_isolation_probe",
          moduleKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
        },
        assertion: foreignAssertion,
        fetchImpl,
      })
    : emptyCall();
  const directoryReady =
    directory.httpStatus === 200 &&
    directory.reasonCode === "DIRECTORY_READY" &&
    directory.contract === "AUTHORIZED_MODULE_DIRECTORY_V1" &&
    directory.complete === true &&
    directory.tenantId === CONSOLIDATED_SCOPE.tenantId &&
    directory.organizationId === CONSOLIDATED_SCOPE.organizationId &&
    directory.moduleKey === CONSOLIDATED_SCOPE.moduleKey;
  const sensitive = directory.sensitivePermissionPresent || foreign.sensitivePermissionPresent;
  return {
    signedRequestSent: true,
    originHost: new URL(NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN).host,
    directory,
    replay: { httpStatus: replay.httpStatus, reasonCode: replay.reasonCode },
    foreign: { httpStatus: foreign.httpStatus, reasonCode: foreign.reasonCode },
    directoryReady,
    realDirectoryData:
      directoryReady &&
      directory.businessPermissionsAuthority === false &&
      directory.defaultBusinessAccess === "DENY" &&
      directory.identityMatch === "EXPLICIT_NUSER_MAPPING_ONLY" &&
      directory.emailMatch === "FORBIDDEN" &&
      directory.canonicalUserCount === directory.entryCount &&
      !sensitive,
    replayDenied:
      directory.httpStatus !== 401 &&
      replay.httpStatus === 401 &&
      replay.reasonCode === "SERVICE_CLIENT_DENIED",
    foreignTenantDenied:
      foreign.httpStatus === 403 && foreign.reasonCode === "ORGANIZATION_DENIED",
    moduleAuthorization: directoryReady && directory.moduleKey === "tagora_time",
    sensitivePermissionDisclosed: sensitive,
    failureDependency: failureDependency({ directory, replayStatus: replay.httpStatus }),
  };
}
