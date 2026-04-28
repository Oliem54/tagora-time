import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { requireDirectionOrAdmin } from "@/app/api/disponibilites/_lib";

export async function GET(req: NextRequest) {
  try {
    const access = await requireDirectionOrAdmin(req);
    if (!access.ok) return access.response;

    const supabase = createAdminSupabaseClient();

    const [
      dayClosuresRes,
      vehiculeUnavailabilitiesRes,
      remorqueUnavailabilitiesRes,
      vehiculesRes,
      remorquesRes,
    ] = await Promise.all([
      supabase
        .from("delivery_day_closures")
        .select("*")
        .eq("status", "active")
        .order("closure_date", { ascending: true }),
      supabase
        .from("vehicule_unavailabilities")
        .select("*")
        .eq("status", "active")
        .order("start_at", { ascending: true }),
      supabase
        .from("remorque_unavailabilities")
        .select("*")
        .eq("status", "active")
        .order("start_at", { ascending: true }),
      supabase.from("vehicules").select("id, nom, plaque, description, actif").order("id"),
      supabase.from("remorques").select("id, nom, plaque, description, actif").order("id"),
    ]);

    const firstError =
      dayClosuresRes.error ||
      vehiculeUnavailabilitiesRes.error ||
      remorqueUnavailabilitiesRes.error ||
      vehiculesRes.error ||
      remorquesRes.error;

    if (firstError) {
      return NextResponse.json(
        { error: firstError.message || "Chargement des disponibilites impossible." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      dayClosures: dayClosuresRes.data ?? [],
      vehiculeUnavailabilities: vehiculeUnavailabilitiesRes.data ?? [],
      remorqueUnavailabilities: remorqueUnavailabilitiesRes.data ?? [],
      vehicules: vehiculesRes.data ?? [],
      remorques: remorquesRes.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur lors du chargement des disponibilites.",
      },
      { status: 500 }
    );
  }
}
