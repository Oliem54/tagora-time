import { describe, expect, it } from "vitest";
import {
  countDirectionLivePresence,
  directionPresenceStatusLabel,
  employeePunchNextActionLabel,
  employeePunchStatusLabel,
  formatEmployeeDashboardDate,
  formatEmployeeWelcome,
  mapDirectionPresenceStatus,
  mapEmployeePunchStatus,
  matchesDirectionLiveFilter,
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
    expect(mapDirectionPresenceStatus("en_diner")).not.toBe(
      mapDirectionPresenceStatus("en_pause")
    );
  });

  it("counts and filters Direction pause and dinner as separate states", () => {
    const board = [
      { state: "en_quart" },
      { state: "en_pause" },
      { state: "en_pause", needsAttention: true },
      { state: "en_diner" },
      { state: "termine" },
      { state: "hors_quart" },
    ];
    const counts = countDirectionLivePresence(board);

    expect(counts.paused).toBe(2);
    expect(counts.diner).toBe(1);
    expect(counts.active).toBe(1);
    expect(counts.paused + counts.diner).toBe(3);

    const paused = board.filter((row) => matchesDirectionLiveFilter(row, "en_pause"));
    const dining = board.filter((row) => matchesDirectionLiveFilter(row, "au_diner"));

    expect(paused.map((row) => row.state)).toEqual(["en_pause", "en_pause"]);
    expect(dining.map((row) => row.state)).toEqual(["en_diner"]);
    expect(paused.some((row) => row.state === "en_diner")).toBe(false);
    expect(dining.some((row) => row.state === "en_pause")).toBe(false);
    expect(board.filter((row) => matchesDirectionLiveFilter(row, "tous"))).toHaveLength(
      board.length
    );
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
