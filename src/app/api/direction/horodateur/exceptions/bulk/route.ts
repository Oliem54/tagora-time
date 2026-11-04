import { NextRequest, NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import { hororaSupervisorHttpServerTarget } from "@/app/lib/auth/horora-supervisor-grant.shared";
import {
  canRunExceptionBulkAction,
  EXCEPTION_BULK_ACTIONS,
  type ExceptionBulkAction,
  type ExceptionBulkFilter,
} from "@/app/lib/horodateur-v1/horodateur-exception-bulk.shared";
import {
  listExceptionBulkCompanies,
  runExceptionBulkAction,
} from "@/app/lib/horodateur-v1/horodateur-exception-bulk.server";

function asAction(value: unknown): ExceptionBulkAction | null {
  return EXCEPTION_BULK_ACTIONS.includes(value as ExceptionBulkAction)
    ? (value as ExceptionBulkAction)
    : null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req, "approve_anomalies", {
      target: hororaSupervisorHttpServerTarget(),
    });
    if (!auth.ok) return auth.response;
    if (!canRunExceptionBulkAction(auth.debug.auth.role)) {
      return NextResponse.json(
        { ok: false, code: "forbidden_role" },
        { status: 403 }
      );
    }
    const companies = await listExceptionBulkCompanies(auth.organizationId);
    return NextResponse.json({ ok: true, companies });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/exceptions/bulk",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req, "approve_anomalies", {
      target: hororaSupervisorHttpServerTarget(),
    });
    if (!auth.ok) return auth.response;
    if (!canRunExceptionBulkAction(auth.debug.auth.role)) {
      return NextResponse.json(
        { ok: false, code: "forbidden_role" },
        { status: 403 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      selection?: unknown;
      ids?: unknown;
      organizationCompanyId?: unknown;
      page?: unknown;
      pageSize?: unknown;
      confirmedCount?: unknown;
      idempotencyKey?: unknown;
      motif?: unknown;
      filters?: Partial<ExceptionBulkFilter>;
    };
    const action = asAction(body.action);
    const organizationCompanyId =
      typeof body.organizationCompanyId === "string" ? body.organizationCompanyId.trim() : "";
    if (!action || !organizationCompanyId) {
      return NextResponse.json(
        { ok: false, code: "organization_and_company_required" },
        { status: 400 }
      );
    }
    const selection = body.selection === "all_filtered" ? "all_filtered" : "page";
    const filters = body.filters ?? {};
    const filter: ExceptionBulkFilter = {
      organizationId: auth.organizationId,
      organizationCompanyId,
      periodFrom: filters.periodFrom ?? null,
      periodTo: filters.periodTo ?? null,
      employeeId: typeof filters.employeeId === "number" ? filters.employeeId : null,
      exceptionType: filters.exceptionType ?? null,
      status: filters.status ?? null,
      gravity: filters.gravity ?? null,
      expectedEventType: filters.expectedEventType ?? null,
      punchPresence: filters.punchPresence ?? null,
      notificationState: filters.notificationState ?? null,
      search: filters.search ?? null,
      archiveState: filters.archiveState ?? "active",
      includeDeleted: filters.includeDeleted === true,
    };
    const result = await runExceptionBulkAction({
      organizationId: auth.organizationId,
      actorUserId: auth.user.id,
      action,
      selection,
      ids: Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [],
      filter,
      page: typeof body.page === "number" ? body.page : 1,
      pageSize: typeof body.pageSize === "number" ? body.pageSize : 25,
      confirmedCount: typeof body.confirmedCount === "number" ? body.confirmedCount : undefined,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      motif: typeof body.motif === "string" ? body.motif : null,
    });
    if (action === "export" && result && "rows" in result && Array.isArray(result.rows)) {
      const header = "id,employee_id,exception_type,status,requested_at,work_date,gravity,notification";
      const lines = result.rows.map((row) =>
        [
          row.id,
          row.employeeId,
          row.exceptionType,
          row.status,
          row.requestedAt,
          row.workDate ?? "",
          row.gravity,
          row.notificationState,
        ].join(",")
      );
      return new NextResponse([header, ...lines].join("\n"), {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/exceptions/bulk",
    });
  }
}
