import { describe, expect, it } from "vitest";
import { formatChauffeurDisplayLabel } from "./commissions.shared";

describe("formatChauffeurDisplayLabel", () => {
  it("prefers nom with courriel", () => {
    expect(
      formatChauffeurDisplayLabel({
        id: 21,
        nom: "Vincent Blouin",
        courriel: "vincent@example.com",
      })
    ).toBe("Vincent Blouin (vincent@example.com)");
  });

  it("falls back to nom with id when courriel is missing", () => {
    expect(formatChauffeurDisplayLabel({ id: 11, nom: "Dominic Ouellet" })).toBe(
      "Dominic Ouellet (#11)"
    );
  });

  it("falls back to courriel or id-only label", () => {
    expect(formatChauffeurDisplayLabel({ id: 5, courriel: "ops@example.com" })).toBe(
      "ops@example.com"
    );
    expect(formatChauffeurDisplayLabel({ id: 7 })).toBe("Employé #7");
  });
});
