import { describe, expect, it } from "vitest";
import {
  resolveHorodateurExceptionDisplay,
  resolveHorodateurPendingExceptionDisplay,
} from "@/app/lib/horodateur-exception-display.shared";

describe("resolveHorodateurExceptionDisplay", () => {
  it("maps quart_debut auto-missing punch to a human business case", () => {
    const display = resolveHorodateurExceptionDisplay({
      category: "horodateur_exception",
      status: "open",
      priority: "high",
      employeeId: 9,
      employeeLabel: "Employé #9",
      message: [
        "Employé : Martin ST-Gelais",
        "Type : missing_punch_adjustment",
        "Motif système : Punch attendu manquant",
        "Note employé : AUTO_MISSING_EXPECTED_PUNCH:quart_debut:2026-06-05",
        "Début de quart prévu à 07:00 — punch non enregistré.",
      ].join("\n"),
      dedupeKey: "horodateur_exception:exc-1",
    });

    expect(display?.caseLabel).toBe("Début de quart non punché");
    expect(display?.humanTitle).toBe("Début de quart non punché");
    expect(display?.employeeName).toBe("Martin ST-Gelais");
    expect(display?.employeeIdLabel).toBe("ID employé #9");
    expect(display?.expectedTime).toBe("07:00");
    expect(display?.dateLabel).toContain("2026");
    expect(display?.humanSummary).toBe(
      "Martin ST-Gelais devait commencer son quart à 07:00, mais aucun punch de début de quart n'a été enregistré le 5 juin 2026."
    );
    expect(display?.smsText).toContain("Martin ST-Gelais");
    expect(display?.smsText).toContain("début de quart");
    expect(display?.emailSubject).toContain("début de quart non punché");
    expect(display?.emailPreview).toContain("Martin ST-Gelais");
  });

  it.each([
    ["quart_fin", "Fin de quart non punchée"],
    ["pause_debut", "Début de pause non punché"],
    ["pause_fin", "Fin de pause non punchée"],
    ["dinner_debut", "Début de dîner non punché"],
    ["diner_debut", "Début de dîner non punché"],
    ["dinner_fin", "Fin de dîner non punchée"],
    ["diner_fin", "Fin de dîner non punchée"],
  ])("maps %s", (eventType, expectedLabel) => {
    const display = resolveHorodateurExceptionDisplay({
      category: "horodateur_exception",
      status: "open",
      message: `AUTO_MISSING_EXPECTED_PUNCH:${eventType}:2026-06-05\nTest prévu à 08:15 — punch non enregistré.`,
      exceptionType: "missing_punch_adjustment",
    });

    expect(display?.caseLabel).toBe(expectedLabel);
  });

  it("maps shift_too_long to quart ouvert trop longtemps", () => {
    const display = resolveHorodateurExceptionDisplay({
      category: "horodateur_exception",
      status: "open",
      exceptionType: "shift_too_long",
      employeeName: "Alex",
    });

    expect(display?.caseLabel).toBe("Quart ouvert trop longtemps");
  });

  it("maps staff retro correction", () => {
    const display = resolveHorodateurExceptionDisplay({
      category: "horodateur_exception",
      status: "open",
      reasonLabel: "En attente admin",
      details: "Demande direction/admin — correction rétroactive",
      employeeName: "Alex",
    });

    expect(display?.caseLabel).toBe("Correction rétroactive demandée");
  });

  it("returns null for non horodateur alerts", () => {
    expect(
      resolveHorodateurExceptionDisplay({
        category: "notification_failure",
        status: "open",
      })
    ).toBeNull();
  });

  it("maps pending horodateur exceptions with human employee name", () => {
    const display = resolveHorodateurPendingExceptionDisplay({
      id: "exc-42",
      employee_id: 9,
      exception_type: "missing_punch_adjustment",
      reason_label: "Punch attendu manquant",
      details:
        "AUTO_MISSING_EXPECTED_PUNCH:dinner_fin:2026-06-03\nFin de dîner prévu à 12:30 — punch non enregistré.",
      status: "en_attente",
      employee: {
        employeeId: 9,
        fullName: "Patrick Dufour",
        email: null,
      },
      event: {
        event_type: "dinner_fin",
        occurred_at: "2026-06-03T12:30:00-04:00",
      },
    });

    expect(display?.caseLabel).toBe("Fin de dîner non punchée");
    expect(display?.employeeName).toBe("Patrick Dufour");
    expect(display?.employeeIdLabel).toBe("ID employé #9");
    expect(display?.humanSummary).toContain("Patrick Dufour");
    expect(display?.humanSummary).not.toContain("AUTO_MISSING_EXPECTED_PUNCH");
  });
});
