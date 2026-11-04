/**
 * Local HORORA adapter for the Nexus access contract.
 * Active only in `next dev` on a loopback host, and never against Production Supabase.
 * The fixture does not call Nexus and does not write Nexus tables.
 */

import { isHororaPortalRole } from "@/app/lib/auth/horora-role-model.shared";
import { getDashboardPathForRole, type AppRole } from "@/app/lib/auth/roles";
import { isLocalHostname, normalizeHostname } from "@/app/lib/canonical-domains";
import {
  HORORA_PRODUCTION_SUPABASE_HOST,
  readSupabaseHostname,
} from "@/app/lib/supabase/supabase-host.shared";

export const HORORA_LOCAL_NEXUS_FIXTURE_ENV = "HORORA_LOCAL_NEXUS_FIXTURE" as const;
export const HORORA_LOCAL_FIXTURE_ROLE_ENV = "HORORA_LOCAL_FIXTURE_ROLE" as const;
export const HORORA_LOCAL_FIXTURE_COOKIE_NAME = "horora_local_fixture" as const;
export const HORORA_LOCAL_FIXTURE_SESSION_SOURCE = "local_nexus_fixture" as const;

export const HORORA_LOCAL_FIXTURE_USER_ID =
  "00000000-0000-4000-8000-0000000000a1" as const;
export const HORORA_LOCAL_FIXTURE_ORGANIZATION_ID =
  "00000000-0000-4000-8000-0000000000a2" as const;
export const HORORA_LOCAL_FIXTURE_MEMBERSHIP_ID =
  "00000000-0000-4000-8000-0000000000a3" as const;
export const HORORA_LOCAL_FIXTURE_TERRAIN_PERMISSION = "terrain" as const;

export type HororaServingSessionSource = "nexus_handoff" | "local_nexus_fixture";

export type HororaLocalNexusFixtureInput = {
  readonly nodeEnv: string | undefined;
  readonly vercelEnv: string | undefined;
  readonly hostname: string | null | undefined;
  readonly flag: string | undefined;
  readonly supabaseUrl: string | null | undefined;
};

export function isHororaServingSessionSource(
  source: string | null | undefined
): source is HororaServingSessionSource {
  return source === "nexus_handoff" || source === HORORA_LOCAL_FIXTURE_SESSION_SOURCE;
}

export function readHororaLocalFixtureRole(raw: string | undefined): AppRole {
  const role = raw?.trim().toLowerCase();
  if (isHororaPortalRole(role)) {
    return role;
  }
  return "direction";
}

export function readHororaLocalFixtureTerrainPermissions(
  input: HororaLocalNexusFixtureInput
): readonly [typeof HORORA_LOCAL_FIXTURE_TERRAIN_PERMISSION] | readonly [] {
  if (!isHororaLocalNexusFixtureEnabled(input)) return [];
  return [HORORA_LOCAL_FIXTURE_TERRAIN_PERMISSION];
}

export function isHororaLocalNexusFixtureEnabled(
  input: HororaLocalNexusFixtureInput
): boolean {
  if (input.flag !== "true") return false;
  if (input.nodeEnv !== "development") return false;
  if (input.vercelEnv === "production" || input.vercelEnv === "preview") return false;

  const host = normalizeHostname(input.hostname);
  if (host && !isLocalHostname(host)) return false;

  const supabaseHost = readSupabaseHostname(input.supabaseUrl);
  if (supabaseHost === HORORA_PRODUCTION_SUPABASE_HOST) return false;

  return true;
}

export function isProcessLocalNexusFixtureEnabled(hostname?: string | null): boolean {
  return isHororaLocalNexusFixtureEnabled({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    hostname: hostname ?? null,
    flag: process.env[HORORA_LOCAL_NEXUS_FIXTURE_ENV],
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

export function resolveHororaModuleEntryUrl(productionLoginUrl: string): string {
  if (!isProcessLocalNexusFixtureEnabled()) {
    return productionLoginUrl;
  }
  return getDashboardPathForRole(
    readHororaLocalFixtureRole(process.env[HORORA_LOCAL_FIXTURE_ROLE_ENV])
  );
}
