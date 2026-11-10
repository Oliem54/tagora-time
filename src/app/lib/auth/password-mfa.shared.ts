import {
  hororaLoginLocationForDecision,
  resolveHororaNexusLoginTarget,
} from "@/app/lib/canonical-domains";

export function isSafeInternalReturnPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export function loginPathForMissingMfaSession(
  _nextPath: string | null,
  hostname?: string | null
): string {
  const host =
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : null);
  return hororaLoginLocationForDecision(resolveHororaNexusLoginTarget({ hostname: host }));
}
