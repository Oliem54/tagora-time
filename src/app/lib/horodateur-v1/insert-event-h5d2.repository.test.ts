import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const insertMock = vi.fn();
const selectChauffeursMock = vi.fn();

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "horodateur_events") {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: () => insertMock({ ...payload }),
            }),
          }),
        };
      }
      if (table === "chauffeurs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => selectChauffeursMock(),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { insertEvent } from "./repository";

const baseInput = {
  employeeId: 42,
  occurredAt: "2026-07-15T12:00:00.000Z",
  workDate: "2026-07-15",
  weekStartDate: "2026-07-13",
  eventType: "quart_debut" as const,
  actorUserId: "actor-uuid-1111",
  actorRole: "employe" as const,
  sourceKind: "employe" as const,
  companyContext: "oliem_solutions" as const,
  status: "normal" as const,
  requiresApproval: false,
  userId: "should-not-write-by-default",
};

describe("insertEvent H5-D2 canonical vs legacy user_id", () => {
  beforeEach(() => {
    insertMock.mockReset();
    selectChauffeursMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("first insert is canonical without user_id and keeps employee_id + actor_user_id", async () => {
    insertMock.mockResolvedValueOnce({
      data: {
        id: "evt-1",
        employee_id: 42,
        actor_user_id: "actor-uuid-1111",
        occurred_at: baseInput.occurredAt,
        event_type: "quart_debut",
        work_date: baseInput.workDate,
        week_start_date: baseInput.weekStartDate,
        status: "normal",
      },
      error: null,
    });

    const row = await insertEvent(baseInput);

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("user_id");
    expect(payload.employee_id).toBe(42);
    expect(payload.actor_user_id).toBe("actor-uuid-1111");
    expect(row.employee_id).toBe(42);
    expect(row.actor_user_id).toBe("actor-uuid-1111");
  });

  it("adds user_id from chauffeurs.auth_user_id only on NOT NULL legacy error", async () => {
    insertMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "23502",
          message: 'null value in column "user_id" of relation "horodateur_events" violates not-null constraint',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "evt-2",
          employee_id: 42,
          user_id: "employee-auth-uuid",
          actor_user_id: "actor-uuid-1111",
          occurred_at: baseInput.occurredAt,
          event_type: "quart_debut",
          work_date: baseInput.workDate,
          week_start_date: baseInput.weekStartDate,
          status: "normal",
        },
        error: null,
      });

    selectChauffeursMock.mockResolvedValueOnce({
      data: { auth_user_id: "employee-auth-uuid" },
      error: null,
    });

    await insertEvent(baseInput);

    expect(insertMock).toHaveBeenCalledTimes(2);
    const first = insertMock.mock.calls[0][0] as Record<string, unknown>;
    const second = insertMock.mock.calls[1][0] as Record<string, unknown>;
    expect(first).not.toHaveProperty("user_id");
    expect(second.user_id).toBe("employee-auth-uuid");
    expect(second.user_id).not.toBe("actor-uuid-1111");
    expect(second.employee_id).toBe(42);
    expect(second.actor_user_id).toBe("actor-uuid-1111");
  });

  it("on missing employee_id column uses auth_user_id as employee, never actor", async () => {
    insertMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "42703",
          message: 'column "employee_id" of relation "horodateur_events" does not exist',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "evt-3",
          user_id: "employee-auth-uuid",
          actor_user_id: "actor-uuid-1111",
          occurred_at: baseInput.occurredAt,
          event_type: "quart_debut",
          work_date: baseInput.workDate,
          week_start_date: baseInput.weekStartDate,
          status: "normal",
        },
        error: null,
      });

    selectChauffeursMock.mockResolvedValueOnce({
      data: { auth_user_id: "employee-auth-uuid" },
      error: null,
    });

    await insertEvent(baseInput);

    const second = insertMock.mock.calls[1][0] as Record<string, unknown>;
    expect(second).not.toHaveProperty("employee_id");
    expect(second.user_id).toBe("employee-auth-uuid");
    expect(second.user_id).not.toBe(baseInput.actorUserId);
  });

  it("rethrows non-legacy errors without masking", async () => {
    insertMock.mockResolvedValueOnce({
      data: null,
      error: { code: "23503", message: "foreign key violation" },
    });

    await expect(insertEvent(baseInput)).rejects.toMatchObject({ code: "23503" });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
