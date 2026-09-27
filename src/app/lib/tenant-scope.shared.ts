export type TenantCompanyRow = {
  organizationId: string | null;
  organizationCompanyId: string | null;
};

export type TenantScope = {
  organizationId: string;
  organizationCompanyIds: readonly string[];
};

export type CompanyDirectoryRow = {
  organizationId: string;
  organizationCompanyId: string;
  companyCode: string;
};

export function assessClientScope(input: {
  sessionOrganizationId: string | null;
  allowedCompanyIds: readonly string[];
  clientOrganizationId?: unknown;
  clientCompanyId?: unknown;
}):
  | { ok: true }
  | { ok: false; code: "organization_missing" | "organization_mismatch" | "company_mismatch" } {
  if (!input.sessionOrganizationId) {
    return { ok: false, code: "organization_missing" };
  }

  const clientOrganizationId = readOptionalId(input.clientOrganizationId);
  if (clientOrganizationId && clientOrganizationId !== input.sessionOrganizationId) {
    return { ok: false, code: "organization_mismatch" };
  }

  const clientCompanyId = readOptionalId(input.clientCompanyId);
  if (clientCompanyId && !input.allowedCompanyIds.includes(clientCompanyId)) {
    return { ok: false, code: "company_mismatch" };
  }

  return { ok: true };
}

export function tenantRowIsVisible(row: TenantCompanyRow, scope: TenantScope): boolean {
  if (!row.organizationId || !row.organizationCompanyId) return false;
  if (row.organizationId !== scope.organizationId) return false;
  return scope.organizationCompanyIds.includes(row.organizationCompanyId);
}

export function commissionLineVisibleToViewer(input: {
  role: "employe" | "direction" | "admin" | null;
  viewerChauffeurId: number | null;
  lineChauffeurId: number | null;
  row: TenantCompanyRow;
  scope: TenantScope;
}): boolean {
  if (!tenantRowIsVisible(input.row, input.scope)) return false;
  if (input.role === "employe") {
    return (
      input.viewerChauffeurId != null &&
      input.lineChauffeurId != null &&
      input.viewerChauffeurId === input.lineChauffeurId
    );
  }
  return input.role === "direction" || input.role === "admin";
}

export function resolveCompanyInOrganization(input: {
  organizationId: string;
  companyCode: string | null;
  directory: readonly CompanyDirectoryRow[];
}):
  | { ok: true; organizationId: string; organizationCompanyId: string }
  | { ok: false; code: "company_unscoped" | "company_ambiguous" } {
  const code = normalizeCode(input.companyCode);
  if (!code) return { ok: false, code: "company_unscoped" };
  const matches = input.directory.filter(
    (row) => row.organizationId === input.organizationId && row.companyCode === code
  );
  if (matches.length !== 1) {
    return { ok: false, code: matches.length === 0 ? "company_unscoped" : "company_ambiguous" };
  }
  return {
    ok: true,
    organizationId: matches[0].organizationId,
    organizationCompanyId: matches[0].organizationCompanyId,
  };
}

function readOptionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCode(value: string | null): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
