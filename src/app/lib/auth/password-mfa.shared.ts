import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

export function isSafeInternalReturnPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export function loginPathForMissingMfaSession(_nextPath: string | null): string {
  return NEXUS_PUBLIC_LOGIN_URL;
}
