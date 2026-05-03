import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import {
  dualWriteDossierIntervention,
  getChauffeurCompanyKey,
  getChauffeurIdForAuthUser,
} from "@/app/lib/app-alerts-dual-write.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    if (role !== "employe" && role !== "direction" && role !== "admin") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (!hasUserPermission(user, "dossiers")) {
      return NextResponse.json({ error: "Permission dossiers requise." }, { status: 403 });
    }

    const body = (await req.json()) as {
      nom?: unknown;
      client?: unknown;
      description?: unknown;
    };

    const nom = typeof body.nom === "string" ? body.nom.trim() : "";
    const client = typeof body.client === "string" ? body.client.trim() : "";
    const description = typeof body.description === "string" ? body.description : "";

    if (!nom) {
      return NextResponse.json({ error: "Référence liée requise." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data: inserted, error: insertError } = await admin
      .from("dossiers")
      .insert({
        nom,
        client: client || null,
        description,
        statut: "Nouveau",
        user_id: user.id,
      })
      .select("id")
      .single<{ id: number }>();

    if (insertError || !inserted?.id) {
      return NextResponse.json(
        { error: insertError?.message ?? "Insertion impossible." },
        { status: 400 }
      );
    }

    const employeeId = await getChauffeurIdForAuthUser(admin, user.id);
    const companyKey = employeeId ? await getChauffeurCompanyKey(admin, employeeId) : null;

    try {
      await dualWriteDossierIntervention({
        supabase: admin,
        dossierId: inserted.id,
        description,
        nom,
        client: client || null,
        employeeId,
        companyKey,
      });
    } catch (e) {
      console.warn("[app_alerts] dossiers dual-write", e);
    }

    return NextResponse.json({ success: true, id: inserted.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur." },
      { status: 500 }
    );
  }
}
