import { NextRequest, NextResponse } from "next/server";
import { requireHorodateurFinancialAccess } from "@/app/lib/horodateur-payroll/access.server";
import { assertFinancialFieldsAllowedForRole } from "@/app/lib/horodateur-payroll/financial-field-guard.server";
import {
  getEmployeePayrollSettings,
  parseEmployeeIdParam,
  updateEmployeePayrollSettings,
} from "@/app/lib/horodateur-payroll/employee-payroll-settings.server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const auth = await requireHorodateurFinancialAccess(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { employeeId: raw } = await params;
  const employeeId = parseEmployeeIdParam(raw);
  if (employeeId == null) {
    return NextResponse.json({ error: "Identifiant employe invalide." }, { status: 400 });
  }

  const result = await getEmployeePayrollSettings(auth.supabase, employeeId, {
    readOnly: false,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ settings: result.settings });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const auth = await requireHorodateurFinancialAccess(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { employeeId: raw } = await params;
  const employeeId = parseEmployeeIdParam(raw);
  if (employeeId == null) {
    return NextResponse.json({ error: "Identifiant employe invalide." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const guard = assertFinancialFieldsAllowedForRole(body, "admin");
  if (!guard.ok) {
    return NextResponse.json(
      {
        error: guard.message,
        code: guard.code,
        ...(guard.rejectedFields ? { rejected_fields: guard.rejectedFields } : {}),
      },
      { status: guard.code === "HORODATEUR_FINANCIAL_ADMIN_ONLY" ? 403 : 400 }
    );
  }

  const reason =
    typeof body === "object" &&
    body !== null &&
    "reason" in body &&
    typeof (body as { reason?: unknown }).reason === "string"
      ? (body as { reason: string }).reason
      : null;

  const updated = await updateEmployeePayrollSettings(
    auth.supabase,
    employeeId,
    guard.payload,
    {
      user: auth.user,
      actorRole: auth.actorRole,
      reason,
    }
  );

  if (!updated.ok) {
    return NextResponse.json(
      { error: updated.message, ...(updated.code ? { code: updated.code } : {}) },
      { status: updated.status }
    );
  }

  return NextResponse.json({ settings: updated.settings });
}
