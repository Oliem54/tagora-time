import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import { buildHorodateurRegistre } from "@/app/lib/horodateur-v1/registre-service.server";
import type {
  RegistreCompanyParam,
  RegistreStatusFilter,
} from "@/app/lib/horodateur-v1/registre-types";

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

function parseCompanyParam(raw: string | null): RegistreCompanyParam {
  const v = (raw ?? "all").trim().toLowerCase();
  if (v === "titan" || v === "titan_produits_industriels") {
    return "titan_produits_industriels";
  }
  if (v === "oliem" || v === "oliem_solutions") {
    return "oliem_solutions";
  }
  return "all";
}

function parseStatusParam(raw: string | null): RegistreStatusFilter {
  const v = (raw ?? "all").trim().toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, RegistreStatusFilter> = {
    all: "all",
    tous: "all",
    complet: "complet",
    complete: "complet",
    incomplet: "incomplet",
    en_attente: "en_attente",
    pending: "en_attente",
    corrige: "corrige",
    corrected: "corrige",
    exception: "exception",
  };
  return map[v] ?? "all";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);
    if (!auth.ok) {
      return auth.response;
    }

    const url = new URL(req.url);
    const startParsed = isoDateStrict(url.searchParams.get("startDate"));
    const endParsed = isoDateStrict(url.searchParams.get("endDate"));
    if (!startParsed.ok || !endParsed.ok) {
      return buildHorodateurValidationErrorResponse({
        error:
          "Parametres startDate et endDate requis au format YYYY-MM-DD.",
        code: "invalid_dates",
        route: "/api/direction/horodateur/registre",
      });
    }

    const employeeRaw = url.searchParams.get("employeeId");
    let employeeId: number | undefined;
    if (employeeRaw && employeeRaw.trim() && employeeRaw !== "all") {
      const n = Number(employeeRaw);
      if (!Number.isFinite(n) || n <= 0) {
        return buildHorodateurValidationErrorResponse({
          error: "employeeId invalide.",
          code: "invalid_employee_id",
          route: "/api/direction/horodateur/registre",
        });
      }
      employeeId = n;
    }

    const company = parseCompanyParam(url.searchParams.get("company"));
    const status = parseStatusParam(url.searchParams.get("status"));

    const payload = await buildHorodateurRegistre({
      startDate: startParsed.value,
      endDate: endParsed.value,
      employeeId: employeeId ?? null,
      company,
      status,
    });

    return NextResponse.json({
      success: true,
      summary: payload.summary,
      employees: payload.employees,
      dailyDetails: payload.dailyDetails,
      exceptions: payload.exceptions,
      pendingApprovals: payload.pendingApprovals,
      employeeOptions: payload.employeeOptions,
      companyOptions: payload.companyOptions,
      exportPlanned: payload.exportPlanned,
      ...(process.env.NODE_ENV !== "production" ? { debug: auth.debug } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("Periode invalide")
        ? error.message
        : undefined;
    if (message) {
      return buildHorodateurValidationErrorResponse({
        error: message,
        code: "invalid_period",
        route: "/api/direction/horodateur/registre",
      });
    }
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/registre",
    });
  }
}
