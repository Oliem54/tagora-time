import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  EMPLOYEE_LEAVE_TYPES,
  publicLeaveTypeLabelFr,
  type EmployeeLeaveType,
} from "@/app/lib/employee-leave-period.shared";
import {
  insertLongLeaveStartedAlert,
  maybeInsertReturnVerificationAlert,
  notifyEmployeeWorkStatusUpdated,
} from "@/app/lib/employee-leave-period.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

function jsonError(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) return jsonError(401, "Non authentifié.");
  if (role !== "direction" && role !== "admin") {
    return jsonError(403, "Accès refusé.");
  }

  const { id } = await context.params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) return jsonError(400, "ID invalide.");

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("employee_leave_periods")
    .select("*")
    .eq("employee_id", employeeId)
    .order("start_date", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError(500, error.message ?? "Erreur chargement.");
  }

  return NextResponse.json({ success: true, periods: data ?? [] });
}

type PostBody = {
  leave_type?: string;
  start_date?: string;
  end_date?: string | null;
  expected_return_date?: string | null;
  is_indefinite?: boolean;
  reason_public?: string | null;
  private_note?: string | null;
  notify_employee?: boolean;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) return jsonError(401, "Non authentifié.");
  if (role !== "direction" && role !== "admin") {
    return jsonError(403, "Accès refusé.");
  }

  const { id } = await context.params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) return jsonError(400, "ID invalide.");

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return jsonError(400, "JSON invalide.");
  }

  const leaveType = (body.leave_type ?? "").trim() as EmployeeLeaveType;
  if (!EMPLOYEE_LEAVE_TYPES.includes(leaveType)) {
    return jsonError(400, "Type de congé invalide.");
  }
  const startDate = (body.start_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return jsonError(400, "Date de début invalide.");
  }

  const supabase = createAdminSupabaseClient();

  const existing = await supabase
    .from("employee_leave_periods")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "active")
    .maybeSingle();

  if (existing.data?.id) {
    return jsonError(
      400,
      "Un congé prolongé est déjà actif pour cet employé. Terminez-le ou annulez-le d’abord."
    );
  }

  const { data: emp, error: empErr } = await supabase
    .from("chauffeurs")
    .select("id, nom, courriel, telephone")
    .eq("id", employeeId)
    .maybeSingle();

  if (empErr || !emp) {
    return jsonError(404, "Employé introuvable.");
  }

  const row = {
    employee_id: employeeId,
    leave_type: leaveType,
    start_date: startDate,
    end_date: body.end_date?.trim() || null,
    expected_return_date: body.expected_return_date?.trim() || null,
    is_indefinite: body.is_indefinite === true,
    reason_public: body.reason_public?.trim() || null,
    private_note: body.private_note?.trim() || null,
    status: "active" as const,
    created_by: user.id,
    updated_by: user.id,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("employee_leave_periods")
    .insert(row)
    .select("*")
    .maybeSingle();

  if (insErr || !inserted) {
    return jsonError(500, insErr?.message ?? "Création impossible.");
  }

  await insertLongLeaveStartedAlert(supabase, {
    employeeId,
    employeeName: typeof emp.nom === "string" ? emp.nom : null,
    publicLabel: publicLeaveTypeLabelFr(leaveType),
    leavePeriodId: String(inserted.id),
  });

  if (row.expected_return_date) {
    await maybeInsertReturnVerificationAlert(supabase, {
      employeeId,
      employeeName: typeof emp.nom === "string" ? emp.nom : null,
      expectedReturnDate: row.expected_return_date,
      leavePeriodId: String(inserted.id),
    });
  }

  await notifyEmployeeWorkStatusUpdated({
    employeeId,
    nom: typeof emp.nom === "string" ? emp.nom : null,
    email: typeof emp.courriel === "string" ? emp.courriel : null,
    phone: typeof emp.telephone === "string" ? emp.telephone : null,
    notify: body.notify_employee !== false,
  });

  return NextResponse.json({ success: true, period: inserted });
}
