import { describe, expect, it } from "vitest";
import { loginPathForMissingMfaSession } from "@/app/lib/auth/password-mfa.shared";

describe("loginPathForMissingMfaSession", () => {
  it("redirige vers employe/login pour un next employé", () => {
    expect(loginPathForMissingMfaSession("/employe/dashboard")).toBe(
      "/employe/login?next=%2Femploye%2Fdashboard"
    );
  });

  it("redirige vers direction/login par défaut", () => {
    expect(loginPathForMissingMfaSession("/direction/dashboard")).toBe(
      "/direction/login?next=%2Fdirection%2Fdashboard"
    );
    expect(loginPathForMissingMfaSession(null)).toBe("/direction/login");
  });
});
