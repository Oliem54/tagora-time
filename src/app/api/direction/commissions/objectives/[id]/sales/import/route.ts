import { NextRequest, NextResponse } from "next/server";
import {
  getUserDisplayName,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { todayIsoLocal } from "@/app/lib/commissions/commissions.shared";
import { insertSaleLines } from "@/app/lib/commissions/sales-ledger.server";
import { parseCommissionSalesCsv } from "@/app/lib/commissions/sales-ledger.shared";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const csv = typeof body.csv === "string" ? body.csv : "";
    const parsed = parseCommissionSalesCsv(csv);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await insertSaleLines({
      supabase: auth.supabase,
      user: auth.user,
      objectiveId: id,
      actorName: getUserDisplayName(auth.user),
      todayIso: todayIsoLocal(),
      drafts: parsed.rows.map((row) => ({
        ...row,
        kind: "sale" as const,
        source: "import" as const,
        correctsLineId: null,
      })),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: "code" in result ? result.code : undefined },
        { status: result.status }
      );
    }

    return NextResponse.json({ imported: parsed.rows.length, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur import des ventes." },
      { status: 500 }
    );
  }
}
