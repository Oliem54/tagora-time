import { describe, expect, it } from "vitest";
import type { Accrual } from "@/app/lib/commissions/accruals.shared";
import {
  deriveFinanceStatus,
  mapDomainErrorToApiCode,
  mapDomainErrorToHttpStatus,
  mapProcessingSuccessToDto,
} from "@/app/lib/commissions/compensation-processing-api.shared";
import type { CompensationProcessingSuccess } from "@/app/lib/commissions/compensation-processing.shared";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "@/app/lib/commissions/compensation-events.shared";

function buildSuccess(overrides: Partial<CompensationProcessingSuccess> = {}): CompensationProcessingSuccess {
  const event = {
    id: "11111111-1111-4111-8111-111111111111",
    event_type: COMPENSATION_EVENT_TYPE_SALE,
    status: COMPENSATION_EVENT_STATUS_ACTIVE,
    sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
    chauffeur_id: 21,
    amount: 10000,
    sold_at: "2026-07-01",
    delivered_at: "2026-07-03",
    invoiced_at: null,
    collected_at: null,
    company_context: null,
    external_reference: null,
    label: null,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z",
    eligibility: {
      is_eligible: true,
      criteria_evaluated: [],
      rejection_reason: null,
    },
    ...(overrides.event ?? {}),
  };

  return {
    event,
    context: overrides.context ?? {
      event,
      eligibility: event.eligibility,
      rules: [],
      sales_basis_amount: 10000,
      calculation_params: {},
      is_calculable: true,
      rejection_reason: null,
    },
    calculation: overrides.calculation ?? {
      lines: [
        {
          rule_name: "Commission",
          component: "commission",
          sales_basis_amount: 10000,
          calculated_amount: 500,
        },
      ],
      skipped: false,
      rejection_reason: null,
    },
    accrual_drafts: overrides.accrual_drafts ?? [],
    accruals: overrides.accruals ?? [
      {
        id: "accrual-1",
        compensation_event_id: event.id,
        component: "commission",
        rule_name: "Commission",
        label: "Commission",
        sales_basis_amount: 10000,
        calculated_amount: 500,
        status: "calculated",
        period_start: null,
        period_end: null,
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z",
        created_by: "admin-user-1",
        updated_by: "admin-user-1",
      } satisfies Accrual,
    ],
    history: overrides.history ?? [],
  };
}

describe("compensation-processing-api.shared", () => {
  it("mapDomainErrorToApiCode mappe ALREADY_PROCESSED depuis VALIDATION protegee", () => {
    expect(
      mapDomainErrorToApiCode("VALIDATION", [
        "Impossible de recalculer: des accruals sont en revue ou deja valides.",
      ])
    ).toBe("ALREADY_PROCESSED");
  });

  it("mapDomainErrorToApiCode mappe VALIDATION_ERROR pour les autres validations", () => {
    expect(mapDomainErrorToApiCode("VALIDATION", ["Regle 1: montant fixe invalide."])).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("mapDomainErrorToHttpStatus retourne les codes HTTP attendus", () => {
    expect(mapDomainErrorToHttpStatus("NOT_FOUND")).toBe(404);
    expect(mapDomainErrorToHttpStatus("INELIGIBLE")).toBe(422);
    expect(mapDomainErrorToHttpStatus("ALREADY_PROCESSED")).toBe(422);
    expect(mapDomainErrorToHttpStatus("UNAUTHORIZED")).toBe(401);
    expect(mapDomainErrorToHttpStatus("FORBIDDEN")).toBe(403);
    expect(mapDomainErrorToHttpStatus("CONFLICT")).toBe(409);
  });

  it("deriveFinanceStatus derive les statuts finance attendus", () => {
    const eligible = {
      is_eligible: true,
      criteria_evaluated: [],
      rejection_reason: null,
    };
    const ineligible = {
      is_eligible: false,
      criteria_evaluated: [],
      rejection_reason: "Vente annulée.",
    };

    expect(deriveFinanceStatus(ineligible, [])).toBe("NOT_ELIGIBLE");
    expect(deriveFinanceStatus(eligible, [])).toBe("ELIGIBLE");
    expect(
      deriveFinanceStatus(eligible, [{ status: "calculated" } as Accrual])
    ).toBe("CALCULATED");
    expect(
      deriveFinanceStatus(eligible, [{ status: "under_review" } as Accrual])
    ).toBe("UNDER_REVIEW");
    expect(
      deriveFinanceStatus(eligible, [{ status: "validated" } as Accrual])
    ).toBe("VALIDATED");
  });

  it("mapProcessingSuccessToDto produit le shape gelé V1", () => {
    const dto = mapProcessingSuccessToDto(buildSuccess(), {
      sessionId: "session-1",
      runId: "run-1",
      correlationId: "corr-1",
      startedAt: "2026-07-09T12:00:00.000Z",
      finishedAt: "2026-07-09T12:00:01.000Z",
      actorUserId: "admin-user-1",
    });

    expect(dto.ok).toBe(true);
    expect(dto.compensation_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(dto.session_id).toBe("session-1");
    expect(dto.run_id).toBe("run-1");
    expect(dto.finance_status).toBe("CALCULATED");
    expect(dto.summary.execution_type).toBe("initial");
    expect(dto.summary.accruals_created_count).toBe(1);
    expect(dto.meta.api_version).toBe("1.0");
    expect(dto.meta.engine_version).toBe("compensation-engine@1.0.0");
    expect(dto.accruals[0].processing_run_id).toBeNull();
  });
});
