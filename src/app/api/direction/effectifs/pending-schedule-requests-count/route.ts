import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json(
      { error: "Acces reserve a la direction et aux administrateurs." },
      { status: 403 }
    );
  }

  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from("effectifs_employee_schedule_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    console.error("[pending-schedule-requests-count]", error.message);
    return NextResponse.json({ count: 0, hadError: true }, { status: 200 });
  }

  const n = typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
  return NextResponse.json({ count: n, hadError: false });
}
