import { describe, expect, it } from "vitest";
import {
  isInclusiveFourteenDayPeriod,
  payrollOperationalErrorMessage,
} from "./payroll-accountant-operational.shared";

describe("payroll accountant operational shared helpers", () => {
  it("defaults to an inclusive two-week span", () => {
    expect(isInclusiveFourteenDayPeriod("2026-08-14", "2026-08-27")).toBe(true);
    expect(isInclusiveFourteenDayPeriod("2026-08-14", "2026-08-26")).toBe(false);
    expect(isInclusiveFourteenDayPeriod("not-a-date", "2026-08-27")).toBe(false);
  });

  it("maps blocked, forced, confirm and issued codes to French messages", () => {
    expect(payrollOperationalErrorMessage("blocked_incomplete")).toContain("incomplet");
    expect(payrollOperationalErrorMessage("forced_reason_required")).toContain("motif");
    expect(payrollOperationalErrorMessage("confirm_required")).toContain("Confirmez");
    expect(payrollOperationalErrorMessage("issued_immutable")).toContain("emis");
    expect(payrollOperationalErrorMessage("browser_organization_rejected")).toContain(
      "navigateur"
    );
    expect(payrollOperationalErrorMessage("company_tenant_mismatch")).toContain(
      "entreprise"
    );
  });
});
