import { describe, expect, it } from "vitest";
import {
  assertRuleKindIsNotEmployeeIdentifier,
  validateActiveVersionImmutable,
  validateAssignmentIdentity,
  validateTemplateCode,
} from "@/app/lib/commissions/generic-pay-plan-contracts";
import {
  buildQaExternalReference,
  calculateGenericPayPlanAmount,
  decodeGenericPayPlanTrace,
  encodeGenericPayPlanTrace,
  normalizePayPlanCode,
  resolvePayPlanBeneficiaryDisplay,
  validateAndNormalizeTemplateCode,
  validatePlanDisplayName,
} from "@/app/lib/commissions/generic-pay-plan.shared";

describe("generic pay plan 6F shared", () => {
  it("normalizes template codes", () => {
    expect(normalizePayPlanCode("  QA_6F_Demo  ")).toBe("qa_6f_demo");
    expect(normalizePayPlanCode("Bad Code!")).toBeNull();
  });

  it("rejects invalid codes", () => {
    expect(validateAndNormalizeTemplateCode("Nope!").ok).toBe(false);
    expect(validateTemplateCode("bad code").ok).toBe(false);
  });

  it("accepts a valid template name and code", () => {
    expect(validatePlanDisplayName("Plan QA").ok).toBe(true);
    expect(validateAndNormalizeTemplateCode("qa_6f_plan").ok).toBe(true);
  });

  it("calculates percentage of eligible sales", () => {
    const result = calculateGenericPayPlanAmount({
      ruleKind: "percentage_of_eligible_sales",
      saleAmount: 1000,
      ratePercent: 5,
      fixedAmount: null,
      minimumVolume: null,
      tierThresholdFrom: null,
      tierRatePercent: null,
      tierAmount: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.eligible) {
      expect(result.calculatedAmount).toBe(50);
      expect(result.basisAmount).toBe(1000);
      expect(result.ratePercent).toBe(5);
    }
  });

  it("rejects below minimum volume condition", () => {
    const result = calculateGenericPayPlanAmount({
      ruleKind: "percentage_of_eligible_sales",
      saleAmount: 100,
      ratePercent: 10,
      fixedAmount: null,
      minimumVolume: 500,
      tierThresholdFrom: null,
      tierRatePercent: null,
      tierAmount: null,
    });
    expect(result.ok && result.eligible).toBe(false);
  });

  it("applies tier threshold and rate", () => {
    const result = calculateGenericPayPlanAmount({
      ruleKind: "percentage_of_eligible_sales",
      saleAmount: 2000,
      ratePercent: 1,
      fixedAmount: null,
      minimumVolume: null,
      tierThresholdFrom: 1000,
      tierRatePercent: 8,
      tierAmount: null,
    });
    expect(result.ok && result.eligible && result.calculatedAmount).toBe(160);
  });

  it("calculates fixed amount rule", () => {
    const result = calculateGenericPayPlanAmount({
      ruleKind: "fixed_amount_per_unit",
      saleAmount: 1,
      ratePercent: null,
      fixedAmount: 125,
      minimumVolume: null,
      tierThresholdFrom: null,
      tierRatePercent: null,
      tierAmount: null,
    });
    expect(result.ok && result.eligible && result.calculatedAmount).toBe(125);
  });

  it("encodes and decodes calculation trace", () => {
    const encoded = encodeGenericPayPlanTrace({
      template_id: "t1",
      template_code: "qa_6f_plan",
      template_name: "Plan QA",
      version_id: "v1",
      version_number: 1,
      rule_module_id: "r1",
      rule_kind: "percentage_of_eligible_sales",
      rule_name: "5%",
      assignment_id: "a1",
      employee_id: 12,
      organization_id: "11111111-1111-1111-1111-111111111111",
      basis_amount: 1000,
      rate_percent: 5,
      fixed_amount: null,
      calculated_amount: 50,
      event_id: "e1",
      accrual_id: "c1",
      processed_at: "2026-08-04T12:00:00.000Z",
    });
    const decoded = decodeGenericPayPlanTrace(encoded);
    expect(decoded?.calculated_amount).toBe(50);
    expect(decoded?.template_code).toBe("qa_6f_plan");
  });

  it("builds qa external references", () => {
    expect(buildQaExternalReference("Run One")).toBe("qa_6f_run_one");
  });

  it("validates assignment identity", () => {
    expect(
      validateAssignmentIdentity({
        employee_id: 3,
        organization_uuid: "11111111-1111-1111-1111-111111111111",
        version_id: "v1",
      }).ok
    ).toBe(true);
    expect(
      validateAssignmentIdentity({
        employee_id: 0,
        organization_uuid: "11111111-1111-1111-1111-111111111111",
        version_id: "v1",
      }).ok
    ).toBe(false);
  });

  it("blocks mutating an active version", () => {
    expect(
      validateActiveVersionImmutable(
        { status: "active", is_immutable: true },
        true
      ).ok
    ).toBe(false);
  });

  it("rejects employee identifiers as rule kinds", () => {
    expect(assertRuleKindIsNotEmployeeIdentifier("employee_12").ok).toBe(false);
    expect(
      assertRuleKindIsNotEmployeeIdentifier("percentage_of_eligible_sales").ok
    ).toBe(true);
  });

  it("rejects unsupported rule kinds for V1 calc", () => {
    const result = calculateGenericPayPlanAmount({
      ruleKind: "annual_volume_bonus",
      saleAmount: 100,
      ratePercent: 1,
      fixedAmount: null,
      minimumVolume: null,
      tierThresholdFrom: null,
      tierRatePercent: null,
      tierAmount: null,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects cross-tenant style assignment without organization", () => {
    expect(
      validateAssignmentIdentity({
        employee_id: 9,
        organization_uuid: "",
        version_id: "v1",
      }).ok
    ).toBe(false);
  });

  it("displays Yves as primary beneficiary when name is available", () => {
    const display = resolvePayPlanBeneficiaryDisplay({
      employeeId: 2,
      displayName: "Yves",
    });
    expect(display.primary).toBe("Yves");
    expect(display.secondary).toBe("Employé #2");
    expect(display.usedTechnicalFallback).toBe(false);
  });

  it("keeps the internal employee identifier as secondary info", () => {
    const display = resolvePayPlanBeneficiaryDisplay({
      employeeId: 2,
      displayName: "Yves Tremblay",
    });
    expect(display.employeeId).toBe(2);
    expect(display.secondary).toBe("Employé #2");
  });

  it("falls back to email when name is absent", () => {
    const display = resolvePayPlanBeneficiaryDisplay({
      employeeId: 2,
      displayName: "  ",
      email: "yves@example.com",
    });
    expect(display.primary).toBe("yves@example.com");
    expect(display.secondary).toBe("Employé #2");
  });

  it("uses technical fallback only as last resort", () => {
    const display = resolvePayPlanBeneficiaryDisplay({
      employeeId: 2,
    });
    expect(display.primary).toBe("Employé #2");
    expect(display.secondary).toBeNull();
    expect(display.usedTechnicalFallback).toBe(true);
  });

  it("rejects cross-tenant beneficiary name sources", () => {
    const display = resolvePayPlanBeneficiaryDisplay({
      employeeId: 2,
      displayName: "Yves",
      sourceOrganizationId: "11111111-1111-1111-1111-111111111111",
      expectedOrganizationId: "22222222-2222-2222-2222-222222222222",
    });
    expect(display.primary).toBe("Employé #2");
    expect(display.usedTechnicalFallback).toBe(true);
  });

  it("leaves calculated amount and traceability unchanged by beneficiary display", () => {
    const trace = {
      template_id: "t1",
      template_code: "qa_6f_plan",
      template_name: "Plan QA",
      version_id: "v1",
      version_number: 1,
      rule_module_id: "r1",
      rule_kind: "percentage_of_eligible_sales",
      rule_name: "5%",
      assignment_id: "a1",
      employee_id: 2,
      organization_id: "11111111-1111-1111-1111-111111111111",
      basis_amount: 1000,
      rate_percent: 5,
      fixed_amount: null,
      calculated_amount: 50,
      event_id: "e1",
      accrual_id: "c1",
      processed_at: "2026-08-04T12:00:00.000Z",
    };
    const before = encodeGenericPayPlanTrace(trace);
    const display = resolvePayPlanBeneficiaryDisplay({
      employeeId: trace.employee_id,
      displayName: "Yves",
    });
    const after = decodeGenericPayPlanTrace(before);
    expect(display.primary).toBe("Yves");
    expect(after?.calculated_amount).toBe(50);
    expect(after?.accrual_id).toBe("c1");
    expect(after?.event_id).toBe("e1");
    expect(before).toBe(encodeGenericPayPlanTrace(trace));
  });
});
