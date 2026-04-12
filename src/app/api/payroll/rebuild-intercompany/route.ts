import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { requireDirectionUser } from "@/app/lib/timeclock-api";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionUser(req, "terrain");

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.response.error },
        { status: auth.response.status }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: deliveries, error: deliveriesError } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .eq("intercompany_billable", true);

    if (deliveriesError) {
      throw deliveriesError;
    }

    let updatedRows = 0;

    for (const delivery of deliveries ?? []) {
      const deliveryCompany =
        typeof delivery.company_context === "string"
          ? delivery.company_context
          : typeof delivery.company === "string"
            ? delivery.company
            : typeof delivery.compagnie === "string"
              ? delivery.compagnie
              : null;
      const { error } = await supabase
        .from("temps_titan")
        .update({
          company_context: deliveryCompany,
          billing_company_context: delivery.billing_company_context,
          duree_heures: delivery.hours_billable ?? 0,
          distance_km: delivery.km_billable ?? 0,
          source_type: "livraison",
          source_id: String(delivery.id),
        })
        .eq("source_type", "livraison")
        .eq("source_id", String(delivery.id));

      if (!error) {
        updatedRows += 1;
      }
    }

    return NextResponse.json({
      success: true,
      rebuilt_rows: updatedRows,
      requested_by: auth.user.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur reconstruction refacturation intercompany.",
      },
      { status: 500 }
    );
  }
}
