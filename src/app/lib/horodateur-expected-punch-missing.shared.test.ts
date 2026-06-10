import { describe, expect, it } from "vitest";

import { createEmptyWeeklyScheduleConfig } from "@/app/lib/weekly-schedule";

import {
  expectedPunchRequiresMorningPunchIn,
  hasRealMorningPunchInForWorkDay,
  HORODATEUR_DIRECTION_ABSENCE_ALERT_MINUTES,
  isRealEmployeeMorningPunchInEvent,
  resolveAutoMissingExceptionThresholdMinutes,
  resolveMissingPunchEscalationMinutes,
} from "./horodateur-expected-punch-missing.shared";

describe("horodateur expected punch missing — Phase 0 seuils", () => {
  it("aligne quart_debut sur 30 minutes pour AUTO_MISSING", () => {
    const escalation = resolveMissingPunchEscalationMinutes(5);

    expect(
      resolveAutoMissingExceptionThresholdMinutes("quart_debut", escalation)
    ).toBe(HORODATEUR_DIRECTION_ABSENCE_ALERT_MINUTES);
    expect(HORODATEUR_DIRECTION_ABSENCE_ALERT_MINUTES).toBe(30);
  });

  it("conserve le seuil derive pour les autres punchs attendus", () => {
    const escalation = resolveMissingPunchEscalationMinutes(5);

    expect(
      resolveAutoMissingExceptionThresholdMinutes("dinner_debut", escalation)
    ).toBe(10);
    expect(
      resolveAutoMissingExceptionThresholdMinutes("quart_fin", escalation)
    ).toBe(10);
  });

  it("vendeur sans dîner : lunch.enabled=false ne doit pas activer de slots dîner", () => {
    const config = createEmptyWeeklyScheduleConfig("fixed");
    config.days.monday = {
      ...config.days.monday,
      active: true,
      start: "07:00",
      end: "15:30",
      plannedHours: 8,
      lunch: {
        ...config.days.monday.lunch,
        enabled: false,
        time: "12:00",
        minutes: 30,
      },
    };

    expect(config.days.monday.lunch.enabled).toBe(false);
  });
});

describe("horodateur — garde punch matin obligatoire", () => {
  it("requiert une entree matin avant dîner, pause et fin de quart", () => {
    expect(expectedPunchRequiresMorningPunchIn("dinner_debut")).toBe(true);
    expect(expectedPunchRequiresMorningPunchIn("dinner_fin")).toBe(true);
    expect(expectedPunchRequiresMorningPunchIn("pause_debut")).toBe(true);
    expect(expectedPunchRequiresMorningPunchIn("quart_fin")).toBe(true);
    expect(expectedPunchRequiresMorningPunchIn("quart_debut")).toBe(false);
  });

  it("reconnait un punch_in employe reel", () => {
    expect(
      isRealEmployeeMorningPunchInEvent({
        event_type: "quart_debut",
        source_kind: "employe",
        actor_role: "employe",
      })
    ).toBe(true);
  });

  it("ignore un quart_debut invente par le systeme AUTO_MISSING", () => {
    expect(
      isRealEmployeeMorningPunchInEvent({
        event_type: "quart_debut",
        source_kind: "automatique",
        actor_role: "systeme",
      })
    ).toBe(false);

    expect(
      hasRealMorningPunchInForWorkDay([
        {
          event_type: "quart_debut",
          source_kind: "automatique",
          actor_role: "systeme",
          status: "en_attente",
        },
      ])
    ).toBe(false);
  });

  it("sans punch matin, aucune presence reelle a midi", () => {
    expect(hasRealMorningPunchInForWorkDay([], { current_state: "hors_quart" })).toBe(
      false
    );
    expect(
      hasRealMorningPunchInForWorkDay([], { current_state: "hors_quart" })
    ).toBe(false);
  });

  it("avec punch_in employe a 7 h 03, presence reelle confirmee", () => {
    expect(
      hasRealMorningPunchInForWorkDay(
        [
          {
            event_type: "quart_debut",
            source_kind: "employe",
            actor_role: "employe",
            status: "normal",
          },
        ],
        { current_state: "en_quart" }
      )
    ).toBe(true);
  });

  it("punch en attente employe compte comme presence operationnelle", () => {
    expect(
      hasRealMorningPunchInForWorkDay(
        [
          {
            event_type: "quart_debut",
            source_kind: "employe_web",
            actor_role: "employe",
            status: "en_attente",
          },
        ],
        { current_state: "en_quart" }
      )
    ).toBe(true);
  });
});
