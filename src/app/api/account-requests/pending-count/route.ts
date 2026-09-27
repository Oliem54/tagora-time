import { NextRequest, NextResponse } from "next/server";
import {
  requireScopedDirectionAccountAccess,
  scopeAccountRequestQuery,
} from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const scoped = await requireScopedDirectionAccountAccess(req);
    if (!scoped.ok) return scoped.response;

    const supabase = createAdminSupabaseClient();
    const { count, error } = await scopeAccountRequestQuery(
      supabase.from("account_requests").select("*", { count: "exact", head: true }),
      scoped.scope
    ).eq("status", "pending");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: count ?? 0 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur comptage demandes comptes en attente.",
      },
      { status: 500 }
    );
  }
}
