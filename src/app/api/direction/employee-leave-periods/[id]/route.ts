import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { EMPLOYEE_LEAVE_TYPES, type EmployeeLeaveType } from "@/app/lib/employee-leave-period.shared";
import {
  maybeInsertReturnVerificationAlert,
  notifyEmployeeWorkStatusUpdated,
} from "@/app/lib/employee-leave-period.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

function jsonError(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

type PatchBody = {
  action?: "update" | "end" | "cancel";
  leave_type?: string;
  start_date?: string;
  end_date?: string | null;
  expected_return_date?: string | null;
  is_indefinite?: boolean;
  reason_public?: string | null;
  private_note?: string | null;
  notify_employee?: boolean;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) return jsonError(401, "Non authentifié.");
  if (role !== "direction" && role !== "admin") {
    return jsonError(403, "Accès refusé.");
  }

  const { id: periodId } = await context.params;
  if (!periodId) return jsonError(400, "ID période manquant.");

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return jsonError(400, "JSON invalide.");
  }

  const action = body.action ?? "update";
  const supabase = createAdminSupabaseClient();

  const { data: current, error: curErr } = await supabase
    .from("employee_leave_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();

  if (curErr || !current) {
    return jsonError(404, "Période introuvable.");
  }

  const employeeId = Number(current.employee_id);
  const { data: emp } = await supabase
    .from("chauffeurs")
    .select("id, nom, courriel, telephone")
    .eq("id", employeeId)
    .maybeSingle();

  if (action === "end") {
    const { data: updated, error: upErr } = await supabase
      .from("employee_leave_periods")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        ended_by: user.id,
        updated_by: user.id,
      })
      .eq("id", periodId)
      .select("*")
      .maybeSingle();

    if (upErr || !updated) {
      return jsonError(500, upErr?.message ?? "Mise à jour impossible.");
    }

    await notifyEmployeeWorkStatusUpdated({
      employeeId,
      nom: typeof emp?.nom === "string" ? emp.nom : null,
      email: typeof emp?.courriel === "string" ? emp.courriel : null,
      phone: typeof emp?.telephone === "string" ? emp.telephone : null,
      notify: body.notify_employee !== false,
    });

    return NextResponse.json({ success: true, period: updated, message: "Retour au travail enregistré." });
  }

  if (action === "cancel") {
    const { data: updated, error: upErr } = await supabase
      .from("employee_leave_periods")
      .update({
        status: "cancelled",
        updated_by: user.id,
      })
      .eq("id", periodId)
      .select("*")
      .maybeSingle();

    if (upErr || !updated) {
      return jsonError(500, upErr?.message ?? "Annulation impossible.");
    }

    return NextResponse.json({ success: true, period: updated });
  }

  const leaveType = (body.leave_type ?? current.leave_type) as string;
  if (!EMPLOYEE_LEAVE_TYPES.includes(leaveType as EmployeeLeaveType)) {
    return jsonError(400, "Type de congé invalide.");
  }

  const updates: Record<string, unknown> = {
    leave_type: leaveType,
    updated_by: user.id,
  };

  if (body.start_date !== undefined) {
    const sd = String(body.start_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) return jsonError(400, "Date de début invalide.");
    updates.start_date = sd;
  }
  if (body.end_date !== undefined) {
    updates.end_date = body.end_date?.trim() || null;
  }
  if (body.expected_return_date !== undefined) {
    updates.expected_return_date = body.expected_return_date?.trim() || null;
  }
  if (body.is_indefinite !== undefined) {
    updates.is_indefinite = body.is_indefinite === true;
  }
  if (body.reason_public !== undefined) {
    updates.reason_public = body.reason_public?.trim() || null;
  }
  if (body.private_note !== undefined) {
    updates.private_note = body.private_note?.trim() || null;
  }

  const { data: updated, error: upErr } = await supabase
    .from("employee_leave_periods")
    .update(updates)
    .eq("id", periodId)
    .select("*")
    .maybeSingle();

  if (upErr || !updated) {
    return jsonError(500, upErr?.message ?? "Mise à jour impossible.");
  }

  const exp =
    (updated as { expected_return_date?: string | null }).expected_return_date ?? null;
  if (exp) {
    await maybeInsertReturnVerificationAlert(supabase, {
      employeeId,
      employeeName: typeof emp?.nom === "string" ? emp.nom : null,
      expectedReturnDate: exp,
      leavePeriodId: periodId,
    });
  }

  await notifyEmployeeWorkStatusUpdated({
    employeeId,
    nom: typeof emp?.nom === "string" ? emp.nom : null,
    email: typeof emp?.courriel === "string" ? emp.courriel : null,
    phone: typeof emp?.telephone === "string" ? emp.telephone : null,
    notify: body.notify_employee === true,
  });

  return NextResponse.json({ success: true, period: updated });
}
