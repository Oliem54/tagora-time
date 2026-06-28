import { describe, expect, it } from "vitest";
import {
  buildEmployeeResourceSelectLabel,
  hasLinkedPortalAccount,
} from "./employee-resource-select.shared";

describe("buildEmployeeResourceSelectLabel", () => {
  it("builds a full label with all available fields", () => {
    expect(
      buildEmployeeResourceSelectLabel({
        id: 21,
        nom: "Vincent Blouin",
        courriel: "blouin20100@gmail.com",
        fonctions: ["technicien"],
        primary_company: "oliem_solutions",
      })
    ).toBe(
      "#21 · Vincent Blouin · blouin20100@gmail.com · Technicien · Oliem Solutions"
    );
  });

  it("omits missing optional fields", () => {
    expect(
      buildEmployeeResourceSelectLabel({
        id: 20,
        nom: "Guillaume Bousquet",
        courriel: "dvlp@oliem.ca",
        fonctions: [],
        primary_company: "oliem_solutions",
      })
    ).toBe("#20 · Guillaume Bousquet · dvlp@oliem.ca · Oliem Solutions");
  });
});

describe("hasLinkedPortalAccount", () => {
  it("accepts non-empty auth user ids", () => {
    expect(hasLinkedPortalAccount("uuid-123")).toBe(true);
    expect(hasLinkedPortalAccount("  ")).toBe(false);
    expect(hasLinkedPortalAccount(null)).toBe(false);
  });
});
