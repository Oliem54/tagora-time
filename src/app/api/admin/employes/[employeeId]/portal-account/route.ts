import { NextRequest, NextResponse } from "next/server";
import {
  extractRoleFromUser,
  getAuthenticatedRequestUser,
} from "@/app/lib/account-requests.server";
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
    const { user: caller, role } = await getAuthenticatedRequestUser(req);

    if (!caller) {
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

    const { supabase, authUserId } = await resolveEmployeeAuthUserId(id);

    if (!authUserId) {
      return NextResponse.json({
        authUserId: null,
        portalRole: null as AssignableRole | null,
      });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(authUserId);
    if (authError || !authData.user) {
      return NextResponse.json({
        authUserId,
        portalRole: null as AssignableRole | null,
      });
    }

    const explicitRole =
      typeof authData.user.app_metadata?.role === "string"
        ? authData.user.app_metadata.role
        : typeof authData.user.user_metadata?.role === "string"
          ? authData.user.user_metadata.role
          : null;
    const portalRole = parseAssignableRole(explicitRole) ?? extractRoleFromUser(authData.user);

    return NextResponse.json({
      authUserId,
      portalRole,
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
    const { user: caller, role } = await getAuthenticatedRequestUser(req);
    if (!caller) {
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
    if (currentRole === nextRole) {
      return NextResponse.json({ success: true, role: nextRole, unchanged: true });
    }

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

    const appMetadata = { ...(targetData.user.app_metadata ?? {}), role: nextRole };
    const userMetadata = { ...(targetData.user.user_metadata ?? {}), role: nextRole };
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase.from("user_role_audit_logs").insert({
      target_user_id: authUserId,
      target_employee_id: id,
      old_role: currentRole ?? currentRoleRaw ?? "unknown",
      new_role: nextRole,
      changed_by_user_id: caller.id,
      changed_by_email: caller.email ?? null,
      reason: reason || null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, role: nextRole });
  } catch (e) {
    console.error("[admin/employes/.../portal-account][PATCH] unexpected", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
