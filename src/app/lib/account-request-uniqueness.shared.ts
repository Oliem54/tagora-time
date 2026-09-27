export const COMPANY_SCOPE_RULE =
  "pending_email_unique_per_organization_and_company" as const;

export const PENDING_ACCOUNT_REQUEST_UNIQUE_STATUS = "pending" as const;

const SAME_SCOPE_PENDING_MESSAGE =
  "Une demande en attente existe déjà pour ce courriel dans cette organisation et cette compagnie.";

const SAME_SCOPE_OPEN_MESSAGE =
  "Une demande déjà ouverte existe pour ce courriel dans cette organisation et cette compagnie.";

const SCOPE_REQUIRED_MESSAGE =
  "La demande doit être rattachée à une organisation et à une compagnie. Aucune ligne sans portée n'a été créée.";

export function normalizeAccountRequestEmail(email: string) {
  return email.trim().toLowerCase();
}

export function pendingEmailConflictInScope(input: {
  organizationId: string;
  organizationCompanyId: string;
  email: string;
  existingOrganizationId: string | null;
  existingOrganizationCompanyId: string | null;
  existingEmail: string;
  existingStatus: string;
}): boolean {
  if (input.existingStatus !== PENDING_ACCOUNT_REQUEST_UNIQUE_STATUS) return false;
  if (!input.existingOrganizationId || !input.existingOrganizationCompanyId) return false;
  if (input.existingOrganizationId !== input.organizationId) return false;
  if (input.existingOrganizationCompanyId !== input.organizationCompanyId) return false;
  return (
    normalizeAccountRequestEmail(input.existingEmail) ===
    normalizeAccountRequestEmail(input.email)
  );
}

export function unscopedAccountRequestInsertBlocked(input: {
  organizationId: string | null;
  organizationCompanyId: string | null;
}) {
  return !input.organizationId || !input.organizationCompanyId;
}

export function accountRequestDuplicateMessageRevealsOtherTenant(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("autre organisation") ||
    normalized.includes("autre tenant") ||
    normalized.includes("autre compagnie") ||
    normalized.includes("existe ailleurs")
  );
}

export function interpretAccountRequestInsertFailure(input: {
  code?: string | null;
  message?: string | null;
}) {
  const message = String(input.message ?? "");
  const normalized = message.toLowerCase();
  if (normalized.includes("account_request_scope_required")) {
    return {
      status: 409 as const,
      code: "account_request_scope_required" as const,
      error: SCOPE_REQUIRED_MESSAGE,
    };
  }
  if (
    input.code === "23505" ||
    normalized.includes("uq_account_requests_pending_email_tenant_company") ||
    normalized.includes("duplicate key")
  ) {
    return {
      status: 409 as const,
      code: "pending_email_exists_in_scope" as const,
      error: SAME_SCOPE_PENDING_MESSAGE,
    };
  }
  return null;
}

export function sameCompanyOpenRequestMessage(status: string) {
  if (status === "pending") return SAME_SCOPE_PENDING_MESSAGE;
  return SAME_SCOPE_OPEN_MESSAGE;
}
