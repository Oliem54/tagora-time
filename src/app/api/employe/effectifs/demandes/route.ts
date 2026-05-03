import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { mapScheduleRequestRow } from "@/app/lib/effectifs-schedule-request.shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || role !== "employe") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const linkRes = await supabase
      .from("chauffeurs")
      .select("id, nom")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const employeeId = (linkRes.data as { id?: unknown } | null)?.id;
    const employeeNom =
      linkRes.data && typeof (linkRes.data as { nom?: unknown }).nom === "string"
        ? ((linkRes.data as { nom: string }).nom ?? null)
        : null;
    if (typeof employeeId !== "number" || !Number.isFinite(employeeId)) {
      return NextResponse.json(
        { error: "Profil employé non lié. Contactez la direction." },
        { status: 403 }
      );
    }

    const q = req.nextUrl.searchParams;
    const status = q.get("status");
    const requestType = q.get("requestType");

    let query = supabase
      .from("effectifs_employee_schedule_requests")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (status) query = query.eq("status", status);
    if (requestType) query = query.eq("request_type", requestType);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const requests = (data ?? [])
      .map((r) => mapScheduleRequestRow(r as Record<string, unknown>, employeeNom))
      .filter((r) => r != null);
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur chargement demandes employé.",
      },
      { status: 500 }
    );
  }
}
