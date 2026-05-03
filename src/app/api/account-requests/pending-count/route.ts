import { NextRequest, NextResponse } from "next/server";
import { getStrictDirectionRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user, role, mfaError } = await getStrictDirectionRequestUser(req);
    if (mfaError) return mfaError;

    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const { count, error } = await supabase
      .from("account_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

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
