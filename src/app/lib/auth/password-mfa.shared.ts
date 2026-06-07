export function isSafeInternalReturnPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export function loginPathForMissingMfaSession(nextPath: string | null): string {
  const safeNext = isSafeInternalReturnPath(nextPath) ? nextPath : null;
  const nextQuery = safeNext ? `?next=${encodeURIComponent(safeNext)}` : "";

  if (safeNext?.startsWith("/employe")) {
    return `/employe/login${nextQuery}`;
  }

  return `/direction/login${nextQuery}`;
}
