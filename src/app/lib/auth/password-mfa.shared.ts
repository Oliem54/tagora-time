import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import {
  isHororaStagingNexusHost,
  NEXUS_STAGING_PORTAL_MODULES_URL,
  resolveHororaNexusLoginUrl,
} from "@/app/lib/auth/nexus-handoff-config";

let nexusHandoffLogoutInProgress = false;

export function markNexusHandoffLogout(): void {
  nexusHandoffLogoutInProgress = true;
}

export function isNexusHandoffLogoutInProgress(): boolean {
  return nexusHandoffLogoutInProgress;
}

export function resolveNexusHandoffLogoutUrl(hostname: string | null | undefined): string {
  if (isHororaStagingNexusHost(hostname)) {
    return NEXUS_STAGING_PORTAL_MODULES_URL;
  }
  return NEXUS_PUBLIC_LOGIN_URL;
}

export function isSafeInternalReturnPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export function loginPathForMissingMfaSession(_nextPath: string | null): string {
  return resolveHororaNexusLoginUrl();
}
