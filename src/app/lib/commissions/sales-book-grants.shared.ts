const COMMISSION_BOOK_GRANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCommissionBookGrantId(value: string): boolean {
  return COMMISSION_BOOK_GRANT_ID_PATTERN.test(value.trim());
}

export function normalizeCommissionTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function isGrantExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  return !Number.isFinite(parsed) || parsed <= Date.now();
}

export function isCommissionGrantActiveRow(row: {
  revoked_at?: unknown;
  expires_at?: unknown;
  can_view?: boolean | null;
}) {
  const revokedAt = normalizeCommissionTimestamp(row.revoked_at);
  const expiresAt = normalizeCommissionTimestamp(row.expires_at);
  return row.can_view !== false && !revokedAt && !isGrantExpired(expiresAt);
}

export function isCommissionBookGrantRevoked(grant: {
  revoked_at?: string | null;
}): boolean {
  const revokedAt = grant.revoked_at?.trim() ?? "";
  return revokedAt.length > 0;
}

export function isRevokeRequestedInBody(body: Record<string, unknown>): boolean {
  return body.revoke === true || body.revoke === "true";
}
