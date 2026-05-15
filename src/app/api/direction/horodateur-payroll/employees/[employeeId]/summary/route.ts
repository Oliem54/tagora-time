import { NextRequest, NextResponse } from "next/server";
import { requireHorodateurPayrollReadAccess } from "@/app/lib/horodateur-payroll/access.server";
import {
  getEmployeePayrollSettings,
  parseEmployeeIdParam,
} from "@/app/lib/horodateur-payroll/employee-payroll-settings.server";

export const dynamic = "force-dynamic";

/**
 * Lecture seule des paramètres financiers paie (direction, admin, employé sur son dossier).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const { employeeId: raw } = await params;
  const employeeId = parseEmployeeIdParam(raw);
  if (employeeId == null) {
    return NextResponse.json({ error: "Identifiant employe invalide." }, { status: 400 });
  }

  const auth = await requireHorodateurPayrollReadAccess(req, { targetEmployeeId: employeeId });
  if (!auth.ok) {
    return auth.response;
  }

  const result = await getEmployeePayrollSettings(auth.supabase, employeeId, {
    readOnly: true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({
    settings: result.settings,
    actor_role: auth.actorRole,
    permission_scope: "read",
  });
}
