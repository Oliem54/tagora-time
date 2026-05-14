import { NextRequest, NextResponse } from "next/server";
import { formatIsoDateLocal, addDaysLocal } from "@/app/api/direction/effectifs/_lib";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  isEmployeeAbsentOnCalendarDate,
  publicLeaveTypeLabelFr,
  type EmployeeLeavePeriodRow,
} from "@/app/lib/employee-leave-period.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

function jsonError(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Liste des employés (chauffeurs) pour la direction / admin.
 * Query : status=active|inactive|all (défaut active), q=recherche nom/courriel
 */
export async function GET(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return jsonError(401, "Non authentifié.");
    }
    if (role !== "direction" && role !== "admin") {
      return jsonError(403, "Accès refusé.");
    }

    const { searchParams } = new URL(req.url);
    const rawStatus = (searchParams.get("status") ?? "active").toLowerCase();
    const status =
      rawStatus === "inactive" || rawStatus === "all" || rawStatus === "active"
        ? rawStatus
        : "active";
    const q = (searchParams.get("q") ?? "").trim();
    const workStatus = (searchParams.get("work_status") ?? "all").toLowerCase();

    const supabase = createAdminSupabaseClient();

    let query = supabase
      .from("chauffeurs")
      .select("id, nom, courriel, telephone, actif, primary_company, fonctions, fonction_autre, can_deliver")
      .order("id", { ascending: true });

    if (status === "active") {
      query = query.eq("actif", true);
    } else if (status === "inactive") {
      query = query.or("actif.eq.false,actif.is.null");
    }

    const { data, error } = await query;

    if (error) {
      console.error("[employes-list]", error);
      return jsonError(500, error.message ?? "Chargement impossible.");
    }

    let rows = data ?? [];
    if (q.length > 0) {
      const lower = q.toLowerCase();
      rows = rows.filter((r) => {
        const nom = (r.nom ?? "").toLowerCase();
        const mail = (r.courriel ?? "").toLowerCase();
        return nom.includes(lower) || mail.includes(lower);
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = formatIsoDateLocal(today);

    const leaveByEmployee = new Map<number, EmployeeLeavePeriodRow>();
    const leaveRes = await supabase.from("employee_leave_periods").select("*").eq("status", "active");
    if (!leaveRes.error && leaveRes.data) {
      for (const raw of leaveRes.data as Record<string, unknown>[]) {
        const empId = Number(raw.employee_id);
        if (!Number.isFinite(empId)) continue;
        leaveByEmployee.set(empId, {
          id: String(raw.id ?? ""),
          employee_id: empId,
          leave_type: typeof raw.leave_type === "string" ? raw.leave_type : "other",
          start_date: String(raw.start_date ?? ""),
          end_date: raw.end_date != null ? String(raw.end_date) : null,
          expected_return_date:
            raw.expected_return_date != null ? String(raw.expected_return_date) : null,
          is_indefinite: raw.is_indefinite === true,
          status: "active",
          reason_public: typeof raw.reason_public === "string" ? raw.reason_public : null,
          private_note: typeof raw.private_note === "string" ? raw.private_note : null,
          created_by: typeof raw.created_by === "string" ? raw.created_by : null,
          updated_by: typeof raw.updated_by === "string" ? raw.updated_by : null,
          created_at: String(raw.created_at ?? ""),
          updated_at: String(raw.updated_at ?? ""),
          ended_at: raw.ended_at != null ? String(raw.ended_at) : null,
          ended_by: typeof raw.ended_by === "string" ? raw.ended_by : null,
        });
      }
    }

    type WorkTag =
      | "available"
      | "long_leave"
      | "sick"
      | "indefinite";

    function tagForEmployee(empId: number): { tag: WorkTag; label: string | null } {
      const p = leaveByEmployee.get(empId);
      if (!p || !isEmployeeAbsentOnCalendarDate(p, todayIso)) {
        return { tag: "available", label: null };
      }
      const label = publicLeaveTypeLabelFr(p.leave_type);
      if (p.leave_type === "sick_leave") {
        return { tag: "sick", label };
      }
      if (p.is_indefinite || !p.expected_return_date) {
        return { tag: "indefinite", label };
      }
      return { tag: "long_leave", label };
    }

    const enriched = rows.map((r) => {
      const t = tagForEmployee(r.id);
      return {
        ...r,
        workStatusTag: t.tag,
        workStatusLabel: t.label,
      };
    });

    let filtered = enriched;
    if (workStatus === "available") {
      filtered = enriched.filter((e) => e.workStatusTag === "available");
    } else if (workStatus === "long_leave") {
      filtered = enriched.filter((e) => e.workStatusTag === "long_leave");
    } else if (workStatus === "sick") {
      filtered = enriched.filter((e) => e.workStatusTag === "sick");
    } else if (workStatus === "indefinite") {
      filtered = enriched.filter((e) => e.workStatusTag === "indefinite");
    }

    const longLeaveActiveCount = enriched.filter((e) => e.workStatusTag !== "available").length;

    return NextResponse.json({
      success: true,
      employees: filtered,
      meta: {
        longLeaveActiveCount,
        todayIso,
        returnSoonCount: (() => {
          const t3 = formatIsoDateLocal(addDaysLocal(today, 3));
          let n = 0;
          for (const p of leaveByEmployee.values()) {
            if (p.expected_return_date === t3) n += 1;
          }
          return n;
        })(),
      },
    });
  } catch (e) {
    console.error("[employes-list]", e);
    return jsonError(500, e instanceof Error ? e.message : "Erreur inattendue.");
  }
}
