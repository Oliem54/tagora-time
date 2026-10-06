import { describe, expect, it } from "vitest";
import {
  directionPresenceStatusLabel,
  employeePunchNextActionLabel,
  employeePunchStatusLabel,
  formatEmployeeDashboardDate,
  formatEmployeeWelcome,
  mapDirectionPresenceStatus,
  mapEmployeePunchStatus,
  readSessionFullName,
  resolveEmployeeGivenName,
} from "./employee-punch-status.shared";

describe("employee punch status presentation", () => {
  it("maps verified horodateur states to the four employee labels", () => {
    expect(mapEmployeePunchStatus("hors_quart")).toBe("non_pointe");
    expect(mapEmployeePunchStatus("en_quart")).toBe("en_service");
    expect(mapEmployeePunchStatus("en_pause")).toBe("en_pause");
    expect(mapEmployeePunchStatus("en_diner")).toBe("en_diner");
    expect(mapEmployeePunchStatus("termine")).toBe("quart_termine");
    expect(employeePunchStatusLabel("non_pointe")).toBe("Non pointé");
    expect(employeePunchStatusLabel("en_service")).toBe("En service");
    expect(employeePunchStatusLabel("en_pause")).toBe("En pause");
    expect(employeePunchStatusLabel("en_diner")).toBe("Au dîner");
    expect(employeePunchNextActionLabel("en_diner")).toBe("Terminer le dîner");
    expect(employeePunchNextActionLabel("en_service")).toBe("Pointer ma sortie");
    expect(employeePunchStatusLabel("quart_termine")).toBe("Quart terminé");
    expect(mapDirectionPresenceStatus("en_diner")).toBe("au_diner");
    expect(directionPresenceStatusLabel("au_diner")).toBe("Au dîner");
    expect(mapDirectionPresenceStatus("en_pause")).toBe("en_pause");
  });

  it("uses a neutral unavailable state instead of inventing data", () => {
    expect(mapEmployeePunchStatus("en_quart", { available: false })).toBe(
      "indisponible"
    );
    expect(mapEmployeePunchStatus("unknown_state")).toBe("indisponible");
    expect(employeePunchStatusLabel("indisponible")).toBe("Statut indisponible");
    expect(employeePunchNextActionLabel("indisponible")).toBe(
      "Pointage indisponible"
    );
  });

  it("resolves a given name only from verified full-name sources", () => {
    expect(
      resolveEmployeeGivenName({ employeeFullName: "Yves Tremblay" })
    ).toBe("Yves");
    expect(
      resolveEmployeeGivenName({
        employeeFullName: "  ",
        metadataFullName: "Yves",
      })
    ).toBe("Yves");
    expect(resolveEmployeeGivenName({})).toBeNull();
    expect(readSessionFullName({ user_metadata: { full_name: "Yves" } })).toBe(
      "Yves"
    );
    expect(
      readSessionFullName({ user_metadata: { email: "yves@example.com" } })
    ).toBeNull();
    expect(formatEmployeeWelcome("Yves")).toBe("Bonjour, Yves");
    expect(formatEmployeeWelcome(null)).toBe("Bonjour");
  });

  it("formats the current date in French without inventing a schedule", () => {
    const formatted = formatEmployeeDashboardDate(new Date("2026-09-07T16:00:00.000Z"));
    expect(formatted.length).toBeGreaterThan(8);
    expect(formatted.charAt(0)).toBe(formatted.charAt(0).toUpperCase());
  });
});
