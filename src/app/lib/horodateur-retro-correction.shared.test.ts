import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { paidOperationalPunchBlock } from "./horodateur-v1/employee-punch-eligibility.shared";
import { toCanonicalEventType } from "./horodateur-v1/rules";
import {
  parsePastShiftRetroSuggestionFromEvents,
  refusedStaffRetroForgottenEventMessage,
  staffRetroForgottenEventOptions,
  type StaffRetroForgottenEventType,
} from "./horodateur-retro-correction.shared";

const root = process.cwd();

function offered(
  input: { pausePaid?: boolean; lunchPaid?: boolean }
): StaffRetroForgottenEventType[] {
  return staffRetroForgottenEventOptions(input).map((item) => item.value);
}

describe("correction rétroactive Direction et pointages payés", () => {
  it("retire la pause payée et le dîner payé que le serveur refuse", () => {
    const paidPause = { pausePaid: true, lunchPaid: false };
    const paidDinner = { pausePaid: false, lunchPaid: true };
    const bothPaid = { pausePaid: true, lunchPaid: true };
    const neither = { pausePaid: false, lunchPaid: false };

    expect(offered(paidPause)).toEqual([
      "punch_in",
      "punch_out",
      "meal_start",
      "meal_end",
    ]);
    expect(offered(paidDinner)).toEqual([
      "punch_in",
      "punch_out",
      "break_start",
      "break_end",
    ]);
    expect(offered(bothPaid)).toEqual(["punch_in", "punch_out"]);
    expect(offered(neither)).toEqual([
      "punch_in",
      "punch_out",
      "break_start",
      "break_end",
      "meal_start",
      "meal_end",
    ]);

    for (const employee of [paidPause, paidDinner, bothPaid, neither]) {
      for (const eventType of offered(employee)) {
        expect(
          paidOperationalPunchBlock(employee, toCanonicalEventType(eventType))
        ).toBeNull();
      }
    }

    expect(paidOperationalPunchBlock(paidPause, "break_start")?.code).toBe(
      "paid_break_no_punch_required"
    );
    expect(paidOperationalPunchBlock(paidPause, "break_end")?.status).toBe(409);
    expect(paidOperationalPunchBlock(paidDinner, "meal_start")?.code).toBe(
      "paid_lunch_no_punch_required"
    );
    expect(paidOperationalPunchBlock(paidDinner, "meal_end")?.status).toBe(409);
    expect(refusedStaffRetroForgottenEventMessage("break_end", paidPause)).toContain(
      "pause est payée"
    );
    expect(refusedStaffRetroForgottenEventMessage("meal_end", paidDinner)).toContain(
      "dîner est payé"
    );
    expect(refusedStaffRetroForgottenEventMessage("break_end", neither)).toBeNull();
    expect(refusedStaffRetroForgottenEventMessage("punch_out", bothPaid)).toBeNull();
  });

  it("suggère la sortie quand la fin de pause ou de dîner payé n'est pas pointable", () => {
    const openPause = [
      { canonicalType: "punch_in", eventType: "punch_in", status: "normal" },
      { canonicalType: "break_start", eventType: "pause_debut", status: "approuve" },
    ];
    const openDinner = [
      { canonicalType: "punch_in", eventType: "quart_debut", status: "normal" },
      { canonicalType: "meal_start", eventType: "dinner_debut", status: "normal" },
    ];

    expect(
      parsePastShiftRetroSuggestionFromEvents(openPause, {
        pausePaid: false,
        lunchPaid: false,
      })
    ).toBe("break_end");
    expect(
      parsePastShiftRetroSuggestionFromEvents(openPause, {
        pausePaid: true,
        lunchPaid: false,
      })
    ).toBe("punch_out");
    expect(
      parsePastShiftRetroSuggestionFromEvents(openDinner, { lunchPaid: false })
    ).toBe("meal_end");
    expect(
      parsePastShiftRetroSuggestionFromEvents(openDinner, { lunchPaid: true })
    ).toBe("punch_out");
  });

  it("branche le sélecteur rétroactif sur les mêmes drapeaux que le serveur", () => {
    const modal = readFileSync(
      join(root, "src/app/components/horodateur/HorodateurRetroCorrectionModal.tsx"),
      "utf8"
    );
    const live = readFileSync(
      join(root, "src/app/direction/horodateur/DirectionHorodateurClient.tsx"),
      "utf8"
    );
    const past = readFileSync(
      join(
        root,
        "src/app/direction/horodateur/quarts/DirectionHorodateurPastShiftsClient.tsx"
      ),
      "utf8"
    );

    expect(modal).toContain("staffRetroForgottenEventOptions");
    expect(modal.startsWith('"use client"')).toBe(true);
    expect(live).toContain("pausePaid={retroPaidFlags.pausePaid}");
    expect(live).toContain("lunchPaid={retroPaidFlags.lunchPaid}");
    expect(past).toContain("pausePaid={retroPaidFlags.pausePaid}");
    expect(past).toContain("lunchPaid={retroPaidFlags.lunchPaid}");
    expect(past).toContain("selectedRow.pausePaid === true");
  });
});
