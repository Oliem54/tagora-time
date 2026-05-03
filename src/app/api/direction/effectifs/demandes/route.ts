import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { mapScheduleRequestRow } from "@/app/lib/effectifs-schedule-request.shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    let employeChauffeurId: number | null = null;
    if (role === "employe") {
      const linkRes = await supabase
        .from("chauffeurs")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const lid = (linkRes.data as { id?: unknown } | null)?.id;
      employeChauffeurId =
        typeof lid === "number" && Number.isFinite(lid) ? lid : null;
      if (employeChauffeurId == null) {
        return NextResponse.json({ requests: [] });
      }
    }

    const q = req.nextUrl.searchParams;
    const status = q.get("status");
    const requestType = q.get("requestType");
    const startDate = q.get("startDate");
    const endDate = q.get("endDate");
    const employeeId = q.get("employeeId");

    let query = supabase
      .from("effectifs_employee_schedule_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (role === "employe") {
      query = query.eq("employee_id", employeChauffeurId as number);
    } else if (employeeId && /^\d+$/.test(employeeId)) {
      query = query.eq("employee_id", Number(employeeId));
    }

    if (status) query = query.eq("status", status);
    if (requestType) query = query.eq("request_type", requestType);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ids = [
      ...new Set((data ?? []).map((r) => Number((r as Record<string, unknown>).employee_id)).filter((n) => Number.isFinite(n))),
    ];
    const namesById = new Map<number, string | null>();
    if (ids.length > 0) {
      const nomRes = await supabase.from("chauffeurs").select("id, nom").in("id", ids);
      if (!nomRes.error && nomRes.data) {
        for (const row of nomRes.data as { id: number; nom: string | null }[]) {
          namesById.set(row.id, row.nom);
        }
      }
    }

    let requests = (data ?? [])
      .map((r) =>
        mapScheduleRequestRow(
          r as Record<string, unknown>,
          namesById.get(Number((r as Record<string, unknown>).employee_id)) ?? null
        )
      )
      .filter((r) => r != null);
    if (startDate || endDate) {
      requests = requests.filter((r) => {
        const start = r.requestedStartDate ?? r.requestedDate ?? "";
        const end = r.requestedEndDate ?? r.requestedDate ?? "";
        if (!start || !end) return false;
        if (startDate && end < startDate) return false;
        if (endDate && start > endDate) return false;
        return true;
      });
    }
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur chargement demandes direction.",
      },
      { status: 500 }
    );
  }
}
