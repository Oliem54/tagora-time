import { describe, expect, it, vi } from "vitest";
import type { Accrual, AccrualStatusHistoryEntry } from "./accruals.shared";
import type {
  AccrualStatusHistoryRepository,
  AccrualsRepository,
} from "./accruals.persistence.shared";
import { createAccrualWorkflow } from "./accrual-workflow.server";

function buildAccrual(overrides: Partial<Accrual> = {}): Accrual {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    compensation_event_id: "11111111-1111-4111-8111-111111111111",
    component: "commission",
    rule_name: "Commission",
    label: "Commission",
    sales_basis_amount: 10000,
    calculated_amount: 500,
    status: "calculated",
    period_start: null,
    period_end: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z",
    ...overrides,
  };
}

function createMockRepositories(initialAccrual: Accrual) {
  let accrual = { ...initialAccrual };
  const history: AccrualStatusHistoryEntry[] = [];

  const accrualsRepository: AccrualsRepository = {
    list: vi.fn(),
    listByEventId: vi.fn(),
    getById: vi.fn(async (id) => (id === accrual.id ? accrual : null)),
    insertMany: vi.fn(),
    updateStatus: vi.fn(async (id, status, audit) => {
      if (id !== accrual.id) return null;
      accrual = {
        ...accrual,
        status,
        updated_by: audit?.actorUserId ?? null,
        updated_at: "2026-07-07T13:00:00.000Z",
      };
      return accrual;
    }),
    deleteByEventIdAndStatuses: vi.fn(),
  };

  const statusHistoryRepository: AccrualStatusHistoryRepository = {
    listByAccrualId: vi.fn(async () => history),
    append: vi.fn(async (payload) => {
      const entry: AccrualStatusHistoryEntry = {
        id: `history-${history.length + 1}`,
        accrual_id: payload.accrual_id,
        from_status: payload.from_status,
        to_status: payload.to_status,
        changed_at: "2026-07-07T13:00:00.000Z",
        changed_by: payload.changed_by ?? null,
        reason: payload.reason ?? null,
      };
      history.push(entry);
      return entry;
    }),
  };

  return { accrualsRepository, statusHistoryRepository, getAccrual: () => accrual, history };
}

describe("createAccrualWorkflow", () => {
  it("soumet un accrual en revue et valide avec historique", async () => {
    const mocks = createMockRepositories(buildAccrual());
    const workflow = createAccrualWorkflow(mocks);

    const review = await workflow.submitForReview(mocks.getAccrual().id, {
      actorUserId: "finance-1",
    });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.accrual.status).toBe("under_review");

    const validated = await workflow.validateAccrual(mocks.getAccrual().id, {
      actorUserId: "finance-1",
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.accrual.status).toBe("validated");
    expect(mocks.history).toHaveLength(2);
    expect(mocks.history[1]?.to_status).toBe("validated");
  });

  it("refuse validated -> under_review", async () => {
    const mocks = createMockRepositories(buildAccrual({ status: "validated" }));
    const workflow = createAccrualWorkflow(mocks);

    const result = await workflow.submitForReview(mocks.getAccrual().id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_TRANSITION");
    expect(mocks.history).toHaveLength(0);
  });

  it("permet le retour under_review -> calculated", async () => {
    const mocks = createMockRepositories(buildAccrual({ status: "under_review" }));
    const workflow = createAccrualWorkflow(mocks);

    const result = await workflow.sendBackToCalculated(mocks.getAccrual().id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accrual.status).toBe("calculated");
  });
});
