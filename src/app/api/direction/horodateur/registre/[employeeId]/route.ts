import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import { buildHorodateurRegistreEmployeeDetail } from "@/app/lib/horodateur-v1/registre-service.server";

function isoDateStrict(value: string | null): { ok: true; value: string } | { ok: false } {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return { ok: false };
  }
  const d = `${value.trim()}T12:00:00.000Z`;
  if (!Number.isFinite(Date.parse(d))) {
    return { ok: false };
  }
  return { ok: true, value: value.trim() };
}

type RouteContext = { params: Promise<{ employeeId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { employeeId: rawId } = await context.params;
    const employeeId = Number(rawId);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return buildHorodateurValidationErrorResponse({
        error: "Identifiant employe invalide.",
        code: "invalid_employee_id",
        route: "/api/direction/horodateur/registre/[employeeId]",
      });
    }

    const url = new URL(req.url);
    const startParsed = isoDateStrict(url.searchParams.get("startDate"));
    const endParsed = isoDateStrict(url.searchParams.get("endDate"));
    if (!startParsed.ok || !endParsed.ok) {
      return buildHorodateurValidationErrorResponse({
        error:
          "Parametres startDate et endDate requis au format YYYY-MM-DD.",
        code: "invalid_dates",
        route: "/api/direction/horodateur/registre/[employeeId]",
      });
    }

    const detail = await buildHorodateurRegistreEmployeeDetail({
      employeeId,
      startDate: startParsed.value,
      endDate: endParsed.value,
    });

    return NextResponse.json({
      success: true,
      employeeId,
      ...detail,
      ...(process.env.NODE_ENV !== "production" ? { debug: auth.debug } : {}),
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/registre/[employeeId]",
    });
  }
}
