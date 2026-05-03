import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Téléphone issu de chauffeurs (profil métier), pour préremplir l’enrôlement MFA SMS.
 * Lecture via client admin : évite les trous RLS selon les permissions direction.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("chauffeurs")
      .select("telephone")
      .eq("auth_user_id", user.id)
      .maybeSingle<{ telephone: string | null }>();

    if (error) {
      return NextResponse.json({ chauffeurTelephone: null });
    }

    const tel = typeof data?.telephone === "string" ? data.telephone.trim() : "";
    return NextResponse.json({ chauffeurTelephone: tel || null });
  } catch {
    return NextResponse.json({ chauffeurTelephone: null });
  }
}
