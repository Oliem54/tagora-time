import { describe, expect, it } from "vitest";
import {
  accrualWorkflowResultToResponse,
  compensationAccrualsServiceResultToResponse,
  parseAccrualListFilters,
  parseAccrualWorkflowActionFromBody,
} from "./_lib";

describe("parseAccrualListFilters", () => {
  it("exige compensation_event_id", () => {
    const result = parseAccrualListFilters(new URLSearchParams());
    expect(result).toEqual({
      ok: false,
      errors: ["Le parametre compensation_event_id est requis."],
    });
  });

  it("parse compensation_event_id valide", () => {
    const result = parseAccrualListFilters(
      new URLSearchParams("compensation_event_id=11111111-1111-4111-8111-111111111111")
    );
    expect(result).toEqual({
      ok: true,
      compensationEventId: "11111111-1111-4111-8111-111111111111",
    });
  });
});

describe("parseAccrualWorkflowActionFromBody", () => {
  it("rejette une action invalide", () => {
    const result = parseAccrualWorkflowActionFromBody({ action: "pay" });
    expect(result.ok).toBe(false);
  });

  it("parse submit_review avec raison optionnelle", () => {
    const result = parseAccrualWorkflowActionFromBody({
      action: "submit_review",
      reason: " Pret pour revue finance.",
    });
    expect(result).toEqual({
      ok: true,
      action: "submit_review",
      reason: "Pret pour revue finance.",
    });
  });
});

describe("compensationAccrualsServiceResultToResponse", () => {
  it("mappe une liste en 200", async () => {
    const response = compensationAccrualsServiceResultToResponse(
      { ok: true, value: [{ id: "a1" }] },
      { pluralKey: "accruals" }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accruals: [{ id: "a1" }] });
  });

  it("mappe une validation en 400", async () => {
    const response = compensationAccrualsServiceResultToResponse({
      ok: false,
      code: "VALIDATION",
      errors: ["Parametre manquant."],
    });
    expect(response.status).toBe(400);
  });

  it("mappe un not found en 404", async () => {
    const response = compensationAccrualsServiceResultToResponse({
      ok: false,
      code: "NOT_FOUND",
      errors: ["Accrual introuvable."],
    });
    expect(response.status).toBe(404);
  });
});

describe("accrualWorkflowResultToResponse", () => {
  it("mappe une transition invalide en 409", async () => {
    const response = accrualWorkflowResultToResponse({
      ok: false,
      code: "INVALID_TRANSITION",
      errors: ["Transition interdite."],
    });
    expect(response.status).toBe(409);
  });
});
