import { describe, expect, it } from "vitest";

import { resolveHorodateurEmployeeDecisionCopy } from "./notifications.horodateur-phase0.shared";

describe("notifications horodateur Phase 0 — copy employe neutre", () => {
  it("n expose jamais refusée cote employe", () => {
    const rejected = resolveHorodateurEmployeeDecisionCopy("rejected");
    const combined = `${rejected.emailText} ${rejected.emailHtml} ${rejected.smsBody}`.toLowerCase();

    expect(combined).not.toContain("refusée");
    expect(combined).not.toContain("refusee");
    expect(combined).not.toContain("rejetée");
    expect(combined).not.toContain("administration a refus");
    expect(combined).toContain("vérifiez");
  });

  it("utilise le message accepte attendu", () => {
    const approved = resolveHorodateurEmployeeDecisionCopy("approved");
    expect(approved.emailText).toContain("Votre correction d'heure a été mise à jour.");
  });

  it("utilise le message ajuste attendu", () => {
    const adjusted = resolveHorodateurEmployeeDecisionCopy("adjusted");
    expect(adjusted.emailText).toContain("Votre correction d'heure a été ajustée.");
  });
});
