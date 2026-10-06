import { hororaNexusLoginRedirectTarget } from "@/app/lib/auth/horora-nexus-routing.shared";

export function isSafeInternalReturnPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export function loginPathForMissingMfaSession(
  _nextPath: string | null,
  env: Parameters<typeof hororaNexusLoginRedirectTarget>[0] = process.env
): string {
  return hororaNexusLoginRedirectTarget(env);
}
