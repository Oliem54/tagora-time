import { NextRequest, NextResponse } from "next/server";
import {
  extractRoleFromUser,
  getAuthenticatedRequestUser,
} from "@/app/lib/account-requests.server";
import {
  commitAuditedOrganizationRole,
  loadOnboardingMembershipsForAuthUser,
  prepareAuthoritativePortalRole,
  verifyEmployeePortalAccessAfterWrite,
} from "@/app/lib/employee-onboarding-tenant.server";
import { sessionPortalRoleForOrganization } from "@/app/lib/employee-onboarding-tenant.shared";
import {
  APP_METADATA_ROLE_ANNOUNCEMENT_FAILED,
  recordedRoleSecondarySyncPending,
} from "@/app/lib/employee-role-audit-commit.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type AssignableRole = "employe" | "direction" | "manager" | "admin";

function parseAssignableRole(value: unknown): AssignableRole | null {
  if (value === "employe" || value === "direction" || value === "manager" || value === "admin") {
    return value;
  }
  return null;
}

async function resolveEmployeeAuthUserId(employeeId: number) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: rowError } = await supabase
    .from("chauffeurs")
    .select("auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (rowError) {
    throw rowError;
  }

  const authUserId =
    row && typeof (row as { auth_user_id?: unknown }).auth_user_id === "string"
      ? (row as { auth_user_id: string }).auth_user_id.trim() || null
      : null;

  return { supabase, authUserId };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const authenticated = await getAuthenticatedRequestUser(req);
    const caller = authenticated.user;
    const role = authenticated.role;

    if (!caller || !authenticated.organizationId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ error: "Acces reserve aux administrateurs." }, { status: 403 });
    }

    const { employeeId: raw } = await params;
    const id = Number(String(raw ?? "").trim());
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: "Identifiant employe invalide." }, { status: 400 });
    }

    const { authUserId } = await resolveEmployeeAuthUserId(id);

    if (!authUserId) {
      return NextResponse.json({
        authUserId: null,
        portalRole: null as AssignableRole | null,
      });
    }

    const memberships = await loadOnboardingMembershipsForAuthUser(authUserId);
    const portalRole = memberships.ok
      ? sessionPortalRoleForOrganization(memberships.memberships, authenticated.organizationId)
      : null;

    return NextResponse.json({
      authUserId,
      portalRole,
      authoritativeRole: portalRole,
    });
  } catch (e) {
    console.error("[admin/employes/.../portal-account][GET] unexpected", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const authenticated = await getAuthenticatedRequestUser(req);
    const caller = authenticated.user;
    const role = authenticated.role;
    if (!caller || !authenticated.organizationId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ error: "Acces reserve aux administrateurs." }, { status: 403 });
    }

    const { employeeId: raw } = await params;
    const id = Number(String(raw ?? "").trim());
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: "Identifiant employe invalide." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      role?: unknown;
      reason?: unknown;
    };
    const nextRole = parseAssignableRole(body.role);
    if (!nextRole) {
      return NextResponse.json({ error: "Role invalide." }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : null;

    const { supabase, authUserId } = await resolveEmployeeAuthUserId(id);
    if (!authUserId) {
      return NextResponse.json({ error: "Aucun compte portail lie a cet employe." }, { status: 404 });
    }

    const { data: targetData, error: targetError } = await supabase.auth.admin.getUserById(authUserId);
    if (targetError || !targetData.user) {
      return NextResponse.json({ error: "Compte portail introuvable." }, { status: 404 });
    }

    const currentRoleRaw =
      typeof targetData.user.app_metadata?.role === "string"
        ? targetData.user.app_metadata.role
        : typeof targetData.user.user_metadata?.role === "string"
          ? targetData.user.user_metadata.role
          : null;
    const currentRole = parseAssignableRole(currentRoleRaw) ?? extractRoleFromUser(targetData.user);

    // Prevent removing admin role from the last active admin.
    if ((currentRole === "admin" || currentRoleRaw === "admin") && nextRole !== "admin") {
      const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listError) {
        return NextResponse.json({ error: "Impossible de verifier les admins actifs." }, { status: 500 });
      }
      const adminCount = (usersPage.users ?? []).filter((u) => {
        const roleValue =
          typeof u.app_metadata?.role === "string"
            ? u.app_metadata.role
            : typeof u.user_metadata?.role === "string"
              ? u.user_metadata.role
              : null;
        return roleValue === "admin";
      }).length;

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Impossible de retirer le role admin: dernier admin actif." },
          { status: 409 }
        );
      }
    }

    const prepared = await prepareAuthoritativePortalRole({
      source: "admin_portal_account",
      actorRole: "admin",
      actorUserId: caller.id,
      actorOrganizationId: authenticated.organizationId,
      targetAuthUserId: authUserId,
      requestedRole: nextRole,
      preserveExistingRole: false,
      blockSelf: true,
    });
    if (!prepared.ok) {
      return NextResponse.json(
        {
          error: prepared.error,
          code: prepared.code,
          requestedRole: prepared.requestedRole,
          authoritativeRole: prepared.authoritativeRole,
          missingRight: prepared.missingRight ?? null,
        },
        { status: prepared.status }
      );
    }

    let roleAudited = false;
    if (prepared.action !== "noop") {
      const committed = await commitAuditedOrganizationRole({
        actorUserId: caller.id,
        actorEmail: caller.email ?? null,
        organizationId: authenticated.organizationId,
        targetUserId: authUserId,
        targetEmployeeId: id,
        newRole: prepared.role,
        isDefault: prepared.isDefault,
        reason: reason || "admin_portal_role",
      });
      if (!committed.ok) {
        return NextResponse.json(
          {
            success: false,
            error: committed.error,
            code: committed.code,
            rolePersisted: false,
            audited: false,
          },
          { status: committed.status }
        );
      }
      roleAudited = committed.audited;
    }

    const appMetadata = { ...(targetData.user.app_metadata ?? {}), role: prepared.role };
    const userMetadata = { ...(targetData.user.user_metadata ?? {}), role: prepared.role };
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (updateError) {
      if (roleAudited) {
        return NextResponse.json(recordedRoleSecondarySyncPending(prepared.role), { status: 409 });
      }
      return NextResponse.json(
        {
          success: false,
          error: updateError.message,
          code: APP_METADATA_ROLE_ANNOUNCEMENT_FAILED,
          rolePersisted: false,
          audited: false,
          secondarySync: "failed",
        },
        { status: 500 }
      );
    }

    const verified = await verifyEmployeePortalAccessAfterWrite({
      actorOrganizationId: authenticated.organizationId,
      employeeId: id,
      resolvedAuthUserId: authUserId,
      requestedPortalRole: prepared.role,
    });
    if (!verified.ok) {
      return NextResponse.json(
        { error: verified.error, code: verified.code },
        { status: verified.status }
      );
    }

    return NextResponse.json({ success: true, role: prepared.role, authoritativeRole: prepared.role });
  } catch (e) {
    console.error("[admin/employes/.../portal-account][PATCH] unexpected", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
