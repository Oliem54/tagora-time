import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildEmployeMonHorairePayload } from "@/app/lib/employe-mon-horaire.server";
import type { ChauffeurEffectifsRow } from "@/app/api/direction/effectifs/_lib";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(_req);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }
    if (role !== "employe") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const linkRes = await supabase
      .from("chauffeurs")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (linkRes.error) {
      return NextResponse.json(
        { error: linkRes.error.message ?? "Profil employé introuvable." },
        { status: 500 }
      );
    }

    const row = linkRes.data as ChauffeurEffectifsRow | null;
    if (!row || typeof row.id !== "number") {
      return NextResponse.json(
        { error: "Aucun profil chauffeur lié à votre compte." },
        { status: 404 }
      );
    }

    const payload = await buildEmployeMonHorairePayload(supabase, row);
    if ("error" in payload) {
      return NextResponse.json({ error: payload.error }, { status: 500 });
    }

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur serveur." },
      { status: 500 }
    );
  }
}
