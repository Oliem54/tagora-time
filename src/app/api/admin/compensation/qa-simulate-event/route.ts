import { NextRequest, NextResponse } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import {
  compensationEventInputFromBody,
  compensationEventServiceResultToResponse,
} from "@/app/api/direction/commissions/sales-events/_lib";
import {
  readConfiguredSupabasePublicUrl,
  readRequestHostname,
} from "@/app/lib/auth/mfa.shared";
import { COMPENSATION_EVENT_TYPE_SALE } from "@/app/lib/commissions/compensation-events.shared";
import { getCompensationEventsService } from "@/app/lib/commissions/compensation-events.service.factory.server";
import {
  COMPENSATION_QA_DEFAULTS,
  isCompensationQaSimulatorAllowed,
} from "@/app/lib/commissions/compensation-qa.shared";

export const dynamic = "force-dynamic";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Simulateur QA staging uniquement — crée un événement de commission de test.
 * Interdit hors localhost/preview staging et hors projet Supabase staging.
 */
export async function POST(req: NextRequest) {
  const hostname = readRequestHostname(req.headers);
  const supabaseUrl = readConfiguredSupabasePublicUrl();

  if (!isCompensationQaSimulatorAllowed({ hostname, supabaseUrl })) {
    return NextResponse.json(
      {
        error: "Simulateur QA indisponible hors environnement staging local.",
        code: "QA_SIMULATOR_FORBIDDEN",
      },
      { status: 403 }
    );
  }

  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const soldAt =
      typeof body.sold_at === "string" && body.sold_at.trim()
        ? body.sold_at.trim()
        : todayIsoDate();
    const saleState =
      typeof body.sale_state === "string" && body.sale_state.trim()
        ? body.sale_state.trim()
        : COMPENSATION_QA_DEFAULTS.sale_state;
    const deliveredAt =
      saleState === "delivered" ||
      saleState === "invoiced" ||
      saleState === "collected"
        ? typeof body.delivered_at === "string" && body.delivered_at.trim()
          ? body.delivered_at.trim()
          : soldAt
        : null;

    const input = compensationEventInputFromBody({
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      chauffeur_id: body.chauffeur_id ?? COMPENSATION_QA_DEFAULTS.chauffeur_id,
      amount: body.amount ?? COMPENSATION_QA_DEFAULTS.amount,
      sold_at: soldAt,
      sale_state: saleState,
      delivered_at: deliveredAt,
      status: body.status ?? COMPENSATION_QA_DEFAULTS.status,
      company_context:
        body.company_context ?? COMPENSATION_QA_DEFAULTS.company_context,
      external_reference:
        body.external_reference ?? COMPENSATION_QA_DEFAULTS.external_reference,
      label: body.label ?? COMPENSATION_QA_DEFAULTS.label,
      notes: body.notes ?? COMPENSATION_QA_DEFAULTS.notes,
    });

    const service = getCompensationEventsService();
    const result = await service.createSaleEvent(input, { actorUserId: auth.user.id });

    return compensationEventServiceResultToResponse(result, {
      successStatus: 201,
      singularKey: "event",
    });
  } catch (error) {
    return compensationEventServiceResultToResponse({
      ok: false,
      code: "PERSISTENCE",
      errors: [
        error instanceof Error
          ? error.message
          : "Erreur serveur simulateur QA commission.",
      ],
    });
  }
}
