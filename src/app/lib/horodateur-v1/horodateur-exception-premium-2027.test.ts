import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateHorodateurOperationalWrite } from "@/app/lib/horodateur-v1/horodateur-exception-guard.shared";
import {
  assertBulkPatchDoesNotTouchOperationalTime,
  buildExceptionBulkPatch,
  canRunExceptionBulkAction,
  deriveExceptionGravity,
  exceptionMatchesBulkFilter,
  paginateMatched,
  sameIdempotentBulkRequest,
  type ExceptionBulkCandidate,
} from "@/app/lib/horodateur-v1/horodateur-exception-bulk.shared";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const COMPANY_A = "33333333-3333-3333-3333-333333333333";
const COMPANY_B = "44444444-4444-4444-4444-444444444444";

function row(overrides: Partial<ExceptionBulkCandidate> = {}): ExceptionBulkCandidate {
  return {
    id: "exc-1",
    organizationId: ORG_A,
    organizationCompanyId: COMPANY_A,
    employeeId: 7,
    exceptionType: "outside_schedule",
    status: "en_attente",
    requestedAt: "2026-09-27T12:00:00.000Z",
    workDate: "2026-09-27",
    reasonLabel: "Hors horaire",
    details: null,
    expectedEventType: "quart_debut",
    directionEmailNotifiedAt: null,
    directionSmsNotifiedAt: null,
    directionReminderEmailNotifiedAt: null,
    directionReminderSmsNotifiedAt: null,
    notificationFailed: false,
    archivedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("exception operational guard", () => {
  it("blocks a missing organization", () => {
    expect(
      evaluateHorodateurOperationalWrite({
        organizationId: " ",
        incidentWorkDate: "2026-09-27",
        cutoverAtIso: null,
        cutoverWorkDate: null,
        maintenanceLocked: false,
      }).reason
    ).toBe("organization_required");
  });

  it("blocks every path while the maintenance lock is active", () => {
    expect(
      evaluateHorodateurOperationalWrite({
        organizationId: ORG_A,
        incidentWorkDate: "2026-09-28",
        incidentAtIso: "2026-09-28T12:00:00.000Z",
        cutoverAtIso: null,
        cutoverWorkDate: null,
        maintenanceLocked: true,
      }).reason
    ).toBe("maintenance_lock");
  });

  it("blocks dates before the operational cutover", () => {
    expect(
      evaluateHorodateurOperationalWrite({
        organizationId: ORG_A,
        incidentWorkDate: "2026-09-24",
        incidentAtIso: "2026-09-24T08:00:00-04:00",
        cutoverAtIso: "2026-09-24T19:45:00-04:00",
        cutoverWorkDate: "2026-09-24",
        maintenanceLocked: false,
      }).reason
    ).toBe("before_operational_cutover");
  });

  it("allows a later operational date when the lock is off", () => {
    expect(
      evaluateHorodateurOperationalWrite({
        organizationId: ORG_A,
        incidentWorkDate: "2026-09-25",
        incidentAtIso: "2026-09-25T08:00:00-04:00",
        cutoverAtIso: "2026-09-24T19:45:00-04:00",
        cutoverWorkDate: "2026-09-24",
        maintenanceLocked: false,
      }).allowed
    ).toBe(true);
  });
});

describe("exception bulk scope", () => {
  const filter = {
    organizationId: ORG_A,
    organizationCompanyId: COMPANY_A,
  };

  it("rejects another tenant and another company", () => {
    expect(exceptionMatchesBulkFilter(row({ organizationId: ORG_B }), filter)).toBe(false);
    expect(exceptionMatchesBulkFilter(row({ organizationCompanyId: COMPANY_B }), filter)).toBe(false);
  });

  it("filters period, gravity, punch presence and notification state", () => {
    expect(
      exceptionMatchesBulkFilter(row(), {
        ...filter,
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        gravity: "standard",
        punchPresence: "present",
        notificationState: "pending",
      })
    ).toBe(true);
    expect(deriveExceptionGravity("shift_too_long")).toBe("critique");
    expect(
      exceptionMatchesBulkFilter(row({ exceptionType: "shift_too_long" }), {
        ...filter,
        gravity: "standard",
      })
    ).toBe(false);
  });

  it("paginates on the server result", () => {
    const page = paginateMatched([row(), row({ id: "exc-2" }), row({ id: "exc-3" })], 2, 1);
    expect(page.total).toBe(3);
    expect(page.rows.map((item) => item.id)).toEqual(["exc-2"]);
  });

  it("allows owner and direction, and refuses an employee", () => {
    expect(canRunExceptionBulkAction("organization_owner")).toBe(true);
    expect(canRunExceptionBulkAction("direction")).toBe(true);
    expect(canRunExceptionBulkAction("admin")).toBe(true);
    expect(canRunExceptionBulkAction("employe")).toBe(false);
  });

  it("archives, restores and soft-deletes without touching punches, shifts or hours", () => {
    const archived = buildExceptionBulkPatch({
      row: row(),
      action: "archive",
      actorUserId: "user-1",
      motif: "lot",
      bulkActionId: "bulk-1",
      nowIso: "2026-09-27T13:00:00.000Z",
    });
    const restored = buildExceptionBulkPatch({
      row: row({ archivedAt: "2026-09-27T13:00:00.000Z" }),
      action: "restore",
      actorUserId: "user-1",
      motif: null,
      bulkActionId: "bulk-1",
      nowIso: "2026-09-27T14:00:00.000Z",
    });
    const deleted = buildExceptionBulkPatch({
      row: row(),
      action: "soft_delete",
      actorUserId: "user-1",
      motif: "test",
      bulkActionId: "bulk-1",
      nowIso: "2026-09-27T15:00:00.000Z",
    });
    expect(archived.kind).toBe("update");
    expect(restored.kind).toBe("update");
    expect(deleted.kind).toBe("update");
    if (deleted.kind === "update") {
      expect(deleted.values.deleted_at).toBeTruthy();
      expect(deleted.values).not.toHaveProperty("shift_id");
      expect(deleted.values).not.toHaveProperty("source_event_id");
    }
    expect(assertBulkPatchDoesNotTouchOperationalTime(archived)).toBe(true);
    expect(assertBulkPatchDoesNotTouchOperationalTime(restored)).toBe(true);
    expect(assertBulkPatchDoesNotTouchOperationalTime(deleted)).toBe(true);
    expect(
      buildExceptionBulkPatch({
        row: row({ status: "approuve" }),
        action: "approve",
        actorUserId: "user-1",
        motif: null,
        bulkActionId: "bulk-1",
        nowIso: "2026-09-27T15:00:00.000Z",
      }).kind
    ).toBe("noop");
  });

  it("replays only the same idempotent action and count", () => {
    expect(
      sameIdempotentBulkRequest({
        previousAction: "archive",
        action: "archive",
        previousCount: 4,
        confirmedCount: 4,
      })
    ).toBe(true);
    expect(
      sameIdempotentBulkRequest({
        previousAction: "archive",
        action: "soft_delete",
        previousCount: 4,
        confirmedCount: 4,
      })
    ).toBe(false);
  });
});

describe("exception premium foundation files", () => {
  const root = process.cwd();

  it("keeps logical delete as the only removal and scopes audit RLS by tenant and company", () => {
    const sql = readFileSync(
      join(root, "supabase/migrations/20260927134259_horodateur_exception_bulk_foundation.sql"),
      "utf8"
    );
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("horodateur_exception_bulk_audit");
    expect(sql).toContain("current_user_can_access_organization");
    expect(sql).toContain("organization_company_id");
    expect(sql.toLowerCase()).not.toContain("security definer");
    expect(sql.toLowerCase()).not.toContain("delete from public.horodateur_exceptions");
  });

  it("renders the bulk console for mobile and desktop", () => {
    const css = readFileSync(
      join(root, "src/app/direction/horodateur/horodateur-exception-bulk.css"),
      "utf8"
    );
    const ui = readFileSync(
      join(root, "src/app/direction/horodateur/HorodateurExceptionBulkConsole.tsx"),
      "utf8"
    );
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("@media (min-width: 768px)");
    expect(ui).toContain("Sélectionner la page");
    expect(ui).toContain("Sélectionner toutes les lignes filtrées");
    expect(ui).toContain("Suppression logique");
    expect(ui).not.toContain("suppression définitive");
  });
});
