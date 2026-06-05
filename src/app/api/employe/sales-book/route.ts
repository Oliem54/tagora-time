import { NextRequest, NextResponse } from "next/server";
import {
  loadEmployeeSalesBookObjectives,
  requireEmployeSalesBookAccess,
} from "@/app/lib/commissions/sales-book-grants.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireEmployeSalesBookAccess(req);
    if (!auth.ok) return auth.response;

    const objectives = await loadEmployeeSalesBookObjectives(auth.supabase, auth.chauffeurId);

    return NextResponse.json({
      chauffeur_id: auth.chauffeurId,
      objectives,
      read_only: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur livre de ventes." },
      { status: 500 }
    );
  }
}
