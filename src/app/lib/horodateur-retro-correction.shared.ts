import { getLocalWorkDate } from "@/app/lib/horodateur-v1/rules";
import { diffMinutes } from "@/app/lib/horodateur-v1/rules";
export const STAFF_RETRO_CORRECTION_REASON_LABEL = "En attente admin";

export const STAFF_RETRO_CORRECTION_NOTE_PREFIX =
  "Demande direction/admin — correction rétroactive";

export const STAFF_RETRO_FORGOTTEN_EVENT_TYPES = [
  { value: "punch_in", label: "Début de quart oublié" },
  { value: "punch_out", label: "Fin de quart oubliée" },
  { value: "break_start", label: "Début pause oublié" },
  { value: "break_end", label: "Fin pause oubliée" },
  { value: "meal_start", label: "Début dîner oublié" },
  { value: "meal_end", label: "Fin dîner oubliée" },
] as const;

export type StaffRetroForgottenEventType =
  (typeof STAFF_RETRO_FORGOTTEN_EVENT_TYPES)[number]["value"];

const TORONTO_TZ = "America/Toronto";

function getTorontoOffsetForWorkDate(workDate: string): string {
  const probe = new Date(`${workDate}T12:00:00`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = raw.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (!match) {
    return new Date().toISOString().match(/([+-]\d{2}:\d{2})$/)?.[1] ?? "-04:00";
  }
  const sign = match[1].startsWith("-") ? "-" : "+";
  const hours = Math.abs(Number.parseInt(match[1], 10))
    .toString()
    .padStart(2, "0");
  const minutes = (match[2] ?? "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

export function buildStaffRetroOccurredAtIso(
  workDate: string,
  timeHHMM: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return null;
  }

  const match = timeHHMM.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  const offset = getTorontoOffsetForWorkDate(workDate);

  return `${workDate}T${hours}:${minutes}:00${offset}`;
}

export function staffRetroForgottenEventLabel(value: StaffRetroForgottenEventType) {
  return (
    STAFF_RETRO_FORGOTTEN_EVENT_TYPES.find((item) => item.value === value)?.label ??
    value
  );
}

export function isStaffRetroForgottenEventType(
  value: unknown
): value is StaffRetroForgottenEventType {
  return STAFF_RETRO_FORGOTTEN_EVENT_TYPES.some((item) => item.value === value);
}

export function composeStaffRetroCorrectionNote(reason: string) {
  const trimmed = reason.trim();
  return trimmed
    ? `${STAFF_RETRO_CORRECTION_NOTE_PREFIX}\n${trimmed}`
    : STAFF_RETRO_CORRECTION_NOTE_PREFIX;
}

export function isStaffRetroCorrectionException(input: {
  reason_label?: string | null;
  details?: string | null;
}) {
  if (input.reason_label === STAFF_RETRO_CORRECTION_REASON_LABEL) {
    return true;
  }
  const details = String(input.details ?? "");
  return (
    details.includes(STAFF_RETRO_CORRECTION_NOTE_PREFIX) ||
    details.includes("Demande direction/admin")
  );
}

export function isStaffRetroCorrectionEventNote(note: string | null | undefined) {
  const value = String(note ?? "");
  return value.includes(STAFF_RETRO_CORRECTION_NOTE_PREFIX);
}

export function formatStaffRetroCorrectionDetails(input: {
  eventType: StaffRetroForgottenEventType;
  workDate: string;
  time: string;
  reason: string;
}) {
  return [
    `Type : ${staffRetroForgottenEventLabel(input.eventType)}`,
    `Date : ${input.workDate}`,
    `Heure : ${input.time}`,
    "",
    input.reason.trim(),
  ].join("\n");
}

export function parsePastShiftRetroSuggestionFromEvents(
  events: Array<{ canonicalType: string | null; eventType: string; status?: string }>
): StaffRetroForgottenEventType | null {
  const approved = events.filter(
    (ev) => !ev.status || ev.status === "normal" || ev.status === "approuve"
  );
  const types = new Set(
    approved
      .map((ev) => ev.canonicalType ?? ev.eventType)
      .filter(Boolean) as string[]
  );

  const hasIn = types.has("punch_in") || types.has("quart_debut");
  const hasOut = types.has("punch_out") || types.has("quart_fin");
  const hasBreakStart = types.has("break_start") || types.has("pause_debut");
  const hasBreakEnd = types.has("break_end") || types.has("pause_fin");
  const hasMealStart = types.has("meal_start") || types.has("dinner_debut");
  const hasMealEnd = types.has("meal_end") || types.has("dinner_fin");

  if (!hasIn) {
    return "punch_in";
  }
  if (hasBreakStart && !hasBreakEnd) {
    return "break_end";
  }
  if (hasMealStart && !hasMealEnd) {
    return "meal_end";
  }
  if (!hasOut) {
    return "punch_out";
  }
  if (hasIn && hasOut && !hasBreakStart) {
    return "break_start";
  }
  return null;
}

export function validateStaffRetroCorrectionInput(input: {
  date: string;
  time: string;
  endTime?: string;
}) {
  const occurredAt = buildStaffRetroOccurredAtIso(input.date, input.time);
  if (!occurredAt) {
    return {
      ok: false as const,
      error: "Date ou heure invalides (AAAA-MM-JJ et HH:MM attendus).",
      code: "invalid_retro_correction_times",
    };
  }

  const todayWorkDate = getLocalWorkDate(new Date().toISOString());
  if (input.date > todayWorkDate) {
    return {
      ok: false as const,
      error: "La date de travail ne peut pas être dans le futur.",
      code: "retro_correction_future_date",
    };
  }

  if (input.endTime) {
    const endIso = buildStaffRetroOccurredAtIso(input.date, input.endTime);
    if (!endIso || diffMinutes(occurredAt, endIso) < 1) {
      return {
        ok: false as const,
        error: "L'heure demandée est invalide.",
        code: "invalid_retro_correction_times",
      };
    }
  }

  return { ok: true as const, occurredAt };
}
