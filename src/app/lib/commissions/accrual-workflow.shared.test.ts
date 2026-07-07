import { describe, expect, it } from "vitest";
import {
  canTransitionAccrualStatus,
  getAllowedAccrualTransitions,
  validateAccrualStatusTransition,
} from "./accrual-workflow.shared";

describe("accrual workflow transitions Phase 1", () => {
  it("autorise calculated -> under_review -> validated", () => {
    expect(canTransitionAccrualStatus("calculated", "under_review")).toBe(true);
    expect(canTransitionAccrualStatus("under_review", "validated")).toBe(true);
  });

  it("autorise le retour under_review -> calculated", () => {
    expect(canTransitionAccrualStatus("under_review", "calculated")).toBe(true);
  });

  it("interdit validated -> under_review", () => {
    expect(canTransitionAccrualStatus("validated", "under_review")).toBe(false);
    expect(getAllowedAccrualTransitions("validated")).toEqual([]);
  });

  it("retourne une erreur explicite pour transition invalide", () => {
    const result = validateAccrualStatusTransition("validated", "calculated");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_TRANSITION");
  });
});
