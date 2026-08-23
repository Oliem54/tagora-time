import "server-only";

import type { NextRequest } from "next/server";
import {
  getAuthenticatedRequestUser,
  getStrictDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import {
  EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
  PORTAL_ROLE_AUTHORITY_CONFLICT,
  PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE,
  mergeAppMetadataOrganization,
  planChauffeurTenantStamp,
  planEmployeeMembership,
  planEmployeePortalAuthoritySave,
  verifyEmployeePortalAuthorityAfterWrite,
  type OnboardingCompanyRow,
  type OnboardingMembershipRow,
} from "@/app/lib/employee-onboarding-tenant.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export type DirectionEmployeeOnboardingActor = {
  userId: string;
  email: string | null;
  role: "direction" | "admin";
  organizationId: string;
};

export async function resolveDirectionEmployeeOnboardingActor(req: NextRequest): Promise<
  | { ok: true; actor: DirectionEmployeeOnboardingActor }
  | { ok: false; status: number; error: string }
> {
  const strict = await getStrictDirectionRequestUser(req);
  if (strict.mfaError) {
    return { ok: false, status: 403, error: "MFA_AAL2_REQUIRED" };
  }

  const auth = await getAuthenticatedRequestUser(req);
  if (!auth.user || (auth.role !== "direction" && auth.role !== "admin")) {
    return { ok: false, status: 403, error: "Acces refuse." };
  }
  if (!auth.organizationId) {
    return {
      ok: false,
      status: 403,
      error: "Membership organisation active requise.",
    };
  }

  return {
    ok: true,
    actor: {
      userId: auth.user.id,
      email: auth.user.email ?? null,
      role: auth.role,
      organizationId: auth.organizationId,
    },
  };
}

type CompanyDbRow = {
  id: string;
  organization_id: string;
  company_code: string;
  status: string;
  is_default: boolean;
};

async function loadOrganizationCompanies(organizationId: string): Promise<OnboardingCompanyRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_companies")
    .select("id, organization_id, company_code, status, is_default")
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  return ((data ?? []) as CompanyDbRow[]).map((row) => ({
    id: row.id,
    organization_id: row.organization_id,
    company_code: row.company_code,
    status: row.status,
    is_default: row.is_default === true,
  }));
}

export async function stampChauffeurTenantFromActor(input: {
  employeeId: number;
  actorOrganizationId: string;
  requestedPrimaryCompany: string | null;
  clientOrganizationId?: string | null;
  actif?: boolean | null;
}): Promise<{ ok: true; primaryCompany: string } | { ok: false; status: number; error: string; code: string }> {
  const admin = createAdminSupabaseClient();
  const { data: chauffeur, error } = await admin
    .from("chauffeurs")
    .select("id, organization_id, organization_company_id, primary_company, actif")
    .eq("id", input.employeeId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message, code: "chauffeur_lookup_failed" };
  }
  if (!chauffeur) {
    return { ok: false, status: 404, error: "Employe introuvable.", code: "employee_not_found" };
  }

  const companies = await loadOrganizationCompanies(input.actorOrganizationId);
  const planned = planChauffeurTenantStamp({
    serverOrganizationId: input.actorOrganizationId,
    clientOrganizationId: input.clientOrganizationId,
    requestedPrimaryCompany: input.requestedPrimaryCompany,
    companies,
    chauffeur: {
      organization_id: typeof chauffeur.organization_id === "string" ? chauffeur.organization_id : null,
      organization_company_id:
        typeof chauffeur.organization_company_id === "string"
          ? chauffeur.organization_company_id
          : null,
      primary_company:
        typeof chauffeur.primary_company === "string" ? chauffeur.primary_company : null,
      actif: chauffeur.actif === true,
    },
  });

  if (!planned.ok) {
    const status = planned.code === "cross_tenant_conflict" ? 409 : 400;
    return { ok: false, status, error: planned.error, code: planned.code };
  }

  const patch: Record<string, unknown> = {
    organization_id: planned.organizationId,
    organization_company_id: planned.organizationCompanyId,
    primary_company: planned.primaryCompany,
  };
  if (typeof input.actif === "boolean") {
    patch.actif = input.actif;
  }

  const { error: updateError } = await admin
    .from("chauffeurs")
    .update(patch)
    .eq("id", input.employeeId);

  if (updateError) {
    return { ok: false, status: 500, error: updateError.message, code: "chauffeur_stamp_failed" };
  }

  return { ok: true, primaryCompany: planned.primaryCompany };
}

export async function ensureEmployeeOrganizationMembership(input: {
  authUserId: string;
  organizationId: string;
}): Promise<{ ok: true; action: "insert" | "repair" | "noop" } | { ok: false; status: number; error: string; code: string }> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, status, is_default")
    .eq("user_id", input.authUserId);

  if (error) {
    return { ok: false, status: 500, error: error.message, code: "membership_lookup_failed" };
  }

  const existing = ((data ?? []) as OnboardingMembershipRow[]).map((row) => ({
    ...row,
    is_default: row.is_default === true,
  }));

  const planned = planEmployeeMembership({
    authUserId: input.authUserId,
    organizationId: input.organizationId,
    existingMemberships: existing,
  });

  if (!planned.ok) {
    return {
      ok: false,
      status: planned.status,
      error: planned.error,
      code: planned.code,
    };
  }

  if (planned.action === "noop") {
    return { ok: true, action: "noop" };
  }

  if (planned.action === "insert") {
    const { error: insertError } = await admin.from("organization_memberships").insert({
      organization_id: input.organizationId,
      user_id: input.authUserId,
      role: planned.role,
      status: planned.status,
      is_default: planned.isDefault,
      joined_at: new Date().toISOString(),
      suspended_at: null,
    });
    if (insertError) {
      if (insertError.code === "23505") {
        return ensureEmployeeOrganizationMembership(input);
      }
      return { ok: false, status: 500, error: insertError.message, code: "membership_insert_failed" };
    }
    return { ok: true, action: "insert" };
  }

  const { error: updateError } = await admin
    .from("organization_memberships")
    .update({
      role: planned.role,
      status: planned.status,
      is_default: planned.isDefault,
      suspended_at: null,
      joined_at: new Date().toISOString(),
    })
    .eq("id", planned.membershipId);

  if (updateError) {
    return { ok: false, status: 500, error: updateError.message, code: "membership_repair_failed" };
  }
  return { ok: true, action: "repair" };
}

export type EmployeePortalAuthorityFailure = {
  ok: false;
  status: number;
  error: string;
  code: string;
  requestedRole?: string;
  authoritativeRole?: string | null;
};

export async function loadOnboardingMembershipsForAuthUser(authUserId: string): Promise<
  | { ok: true; memberships: OnboardingMembershipRow[] }
  | EmployeePortalAuthorityFailure
> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, status, is_default")
    .eq("user_id", authUserId);

  if (error) {
    return { ok: false, status: 500, error: error.message, code: "membership_lookup_failed" };
  }

  return {
    ok: true,
    memberships: ((data ?? []) as OnboardingMembershipRow[]).map((row) => ({
      ...row,
      is_default: row.is_default === true,
    })),
  };
}

export async function loadChauffeurAuthUserId(employeeId: number): Promise<
  | { ok: true; authUserId: string | null }
  | EmployeePortalAuthorityFailure
> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("chauffeurs")
    .select("id, auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message, code: "chauffeur_lookup_failed" };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Employe introuvable.", code: "employee_not_found" };
  }

  return {
    ok: true,
    authUserId: typeof data.auth_user_id === "string" ? data.auth_user_id : null,
  };
}

export async function evaluateEmployeePortalAuthoritySave(input: {
  actorOrganizationId: string;
  employeeId: number;
  resolvedAuthUserId: string;
  requestedPortalRole: string;
}): Promise<
  | { ok: true; plan: Extract<ReturnType<typeof planEmployeePortalAuthoritySave>, { ok: true }> }
  | EmployeePortalAuthorityFailure
> {
  const memberships = await loadOnboardingMembershipsForAuthUser(input.resolvedAuthUserId);
  if (!memberships.ok) return memberships;
  const chauffeur = await loadChauffeurAuthUserId(input.employeeId);
  if (!chauffeur.ok) return chauffeur;

  const plan = planEmployeePortalAuthoritySave({
    requestedPortalRole: input.requestedPortalRole,
    actorOrganizationId: input.actorOrganizationId,
    chauffeurAuthUserId: chauffeur.authUserId,
    resolvedAuthUserId: input.resolvedAuthUserId,
    existingMemberships: memberships.memberships,
  });

  if (!plan.ok) {
    return {
      ok: false,
      status: plan.status,
      error: plan.error,
      code: plan.code,
      requestedRole: plan.requestedRole,
      authoritativeRole: plan.authoritativeRole,
    };
  }

  return { ok: true, plan };
}

export async function applyEmployeePortalMembershipAndChauffeurLink(input: {
  actorOrganizationId: string;
  employeeId: number;
  resolvedAuthUserId: string;
  plan: Extract<ReturnType<typeof planEmployeePortalAuthoritySave>, { ok: true }>;
}): Promise<{ ok: true } | EmployeePortalAuthorityFailure> {
  const membership = await ensureEmployeeOrganizationMembership({
    authUserId: input.resolvedAuthUserId,
    organizationId: input.actorOrganizationId,
  });
  if (!membership.ok) {
    if (membership.code === "direction_conversion_forbidden") {
      return {
        ok: false,
        status: membership.status,
        error: PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE,
        code: PORTAL_ROLE_AUTHORITY_CONFLICT,
      };
    }
    return membership;
  }

  if (input.plan.linkChauffeur) {
    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from("chauffeurs")
      .update({ auth_user_id: input.resolvedAuthUserId })
      .eq("id", input.employeeId)
      .is("auth_user_id", null);
    if (error) {
      return { ok: false, status: 500, error: error.message, code: "chauffeur_auth_link_failed" };
    }
  }

  return { ok: true };
}

export async function verifyEmployeePortalAccessAfterWrite(input: {
  actorOrganizationId: string;
  employeeId: number;
  resolvedAuthUserId: string;
  requestedPortalRole: string;
}): Promise<{ ok: true } | EmployeePortalAuthorityFailure> {
  const memberships = await loadOnboardingMembershipsForAuthUser(input.resolvedAuthUserId);
  if (!memberships.ok) return memberships;
  const chauffeur = await loadChauffeurAuthUserId(input.employeeId);
  if (!chauffeur.ok) return chauffeur;

  const admin = createAdminSupabaseClient();
  const { data: authData, error } = await admin.auth.admin.getUserById(input.resolvedAuthUserId);
  if (error) {
    return { ok: false, status: 500, error: error.message, code: "auth_reread_failed" };
  }

  const appMetadataRole =
    typeof authData.user?.app_metadata?.role === "string" ? authData.user.app_metadata.role : null;

  const verified = verifyEmployeePortalAuthorityAfterWrite({
    requestedPortalRole: input.requestedPortalRole,
    actorOrganizationId: input.actorOrganizationId,
    resolvedAuthUserId: input.resolvedAuthUserId,
    chauffeurAuthUserId: chauffeur.authUserId,
    appMetadataRole,
    memberships: memberships.memberships,
  });

  if (!verified.ok) {
    return { ok: false, status: 409, error: verified.error, code: verified.code };
  }

  return { ok: true };
}

export async function completeEmployeeTenantAccess(input: {
  actorOrganizationId: string;
  employeeId: number;
  authUserId: string;
  requestedPrimaryCompany: string | null;
  existingAppMetadata?: Record<string, unknown> | null;
}): Promise<{ ok: true } | EmployeePortalAuthorityFailure> {
  const evaluated = await evaluateEmployeePortalAuthoritySave({
    actorOrganizationId: input.actorOrganizationId,
    employeeId: input.employeeId,
    resolvedAuthUserId: input.authUserId,
    requestedPortalRole: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
  });
  if (!evaluated.ok) {
    return evaluated;
  }

  const stamped = await stampChauffeurTenantFromActor({
    employeeId: input.employeeId,
    actorOrganizationId: input.actorOrganizationId,
    requestedPrimaryCompany: input.requestedPrimaryCompany,
  });
  if (!stamped.ok) {
    return stamped;
  }

  const applied = await applyEmployeePortalMembershipAndChauffeurLink({
    actorOrganizationId: input.actorOrganizationId,
    employeeId: input.employeeId,
    resolvedAuthUserId: input.authUserId,
    plan: evaluated.plan,
  });
  if (!applied.ok) {
    return applied;
  }

  const admin = createAdminSupabaseClient();
  const { data: authData } = await admin.auth.admin.getUserById(input.authUserId);
  const existing =
    input.existingAppMetadata ??
    ((authData.user?.app_metadata ?? {}) as Record<string, unknown>);
  const { error: metaError } = await admin.auth.admin.updateUserById(input.authUserId, {
    app_metadata: {
      ...mergeAppMetadataOrganization(existing, input.actorOrganizationId),
      role: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
    },
  });
  if (metaError) {
    return { ok: false, status: 500, error: metaError.message, code: "app_metadata_org_stamp_failed" };
  }

  const verified = await verifyEmployeePortalAccessAfterWrite({
    actorOrganizationId: input.actorOrganizationId,
    employeeId: input.employeeId,
    resolvedAuthUserId: input.authUserId,
    requestedPortalRole: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
  });
  if (!verified.ok) {
    return verified;
  }

  return { ok: true };
}

export async function createTenantStampedChauffeur(input: {
  actorOrganizationId: string;
  payload: Record<string, unknown>;
}): Promise<
  | { ok: true; id: number; primaryCompany: string }
  | { ok: false; status: number; error: string; code: string }
> {
  const requestedPrimaryCompany =
    typeof input.payload.primary_company === "string" ? input.payload.primary_company : null;
  const companies = await loadOrganizationCompanies(input.actorOrganizationId);
  const planned = planChauffeurTenantStamp({
    serverOrganizationId: input.actorOrganizationId,
    clientOrganizationId:
      typeof input.payload.organization_id === "string" ? input.payload.organization_id : null,
    requestedPrimaryCompany,
    companies,
  });
  if (!planned.ok) {
    return { ok: false, status: 400, error: planned.error, code: planned.code };
  }

  const insertPayload = { ...input.payload };
  delete insertPayload.id;
  delete insertPayload.auth_user_id;
  delete insertPayload.organization_id;
  delete insertPayload.organization_company_id;
  insertPayload.organization_id = planned.organizationId;
  insertPayload.organization_company_id = planned.organizationCompanyId;
  insertPayload.primary_company = planned.primaryCompany;
  if (insertPayload.actif !== false) {
    insertPayload.actif = true;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("chauffeurs")
    .insert([insertPayload])
    .select("id")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return {
      ok: false,
      status,
      error: error.message,
      code: error.code === "23505" ? "email_already_used" : "chauffeur_insert_failed",
    };
  }

  return { ok: true, id: Number(data.id), primaryCompany: planned.primaryCompany };
}
