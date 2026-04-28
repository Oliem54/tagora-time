import { NextRequest, NextResponse } from "next/server";
import {
  extractRoleFromUser,
  getAuthenticatedRequestUser,
} from "@/app/lib/account-requests.server";
import type { AppRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

    const supabase = createAdminSupabaseClient();
    const { data: row, error: rowError } = await supabase
      .from("chauffeurs")
      .select("auth_user_id")
      .eq("id", id)
      .maybeSingle();

    if (rowError) {
      console.error("[admin/employes/.../portal-account][GET] chauffeurs", rowError);
      return NextResponse.json({ error: "Lecture fiche impossible." }, { status: 500 });
    }

    const authUserId =
      row && typeof (row as { auth_user_id?: unknown }).auth_user_id === "string"
        ? (row as { auth_user_id: string }).auth_user_id.trim() || null
        : null;

    if (!authUserId) {
      return NextResponse.json({
        authUserId: null,
        portalRole: null as AppRole | null,
      });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(authUserId);
    if (authError || !authData.user) {
      return NextResponse.json({
        authUserId,
        portalRole: null as AppRole | null,
      });
    }

    const portalRole = extractRoleFromUser(authData.user);

    return NextResponse.json({
      authUserId,
      portalRole,
    });
  } catch (e) {
    console.error("[admin/employes/.../portal-account][GET] unexpected", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
