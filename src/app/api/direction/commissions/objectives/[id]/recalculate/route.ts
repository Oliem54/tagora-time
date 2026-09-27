import { NextRequest, NextResponse } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import { todayIsoLocal } from "@/app/lib/commissions/commissions.shared";
import { recalculateObjectiveCommissions } from "@/app/lib/commissions/recalculate.server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await params;
    const result = await recalculateObjectiveCommissions(supabase, id, todayIsoLocal());
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur recalcul commission." },
      { status: 500 }
    );
  }
}
