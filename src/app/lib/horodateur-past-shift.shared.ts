import { diffMinutes, getLocalWorkDate } from "@/app/lib/horodateur-v1/rules";

export const PAST_SHIFT_DIRECTION_NOTE_PREFIX = "Action direction — heures passées";
export const PAST_SHIFT_EMPLOYEE_NOTE_PREFIX =
  "Demande employé — heures passées non enregistrées";

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

export function buildHorodateurOccurredAtIso(
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

function getDatePartsInToronto(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(valueByType.year);
  const month = Number(valueByType.month);
  const day = Number(valueByType.day);

  return {
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`,
    hour: Number(valueByType.hour),
    minute: Number(valueByType.minute),
  };
}

export function addMinutesToOccurredAt(iso: string, minutes: number): string {
  const next = new Date(new Date(iso).getTime() + minutes * 60_000);
  const parts = getDatePartsInToronto(next);
  const offset = getTorontoOffsetForWorkDate(parts.date);
  return `${parts.date}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:00${offset}`;
}

export type ParsedPastShiftWindow = {
  workDate: string;
  startIso: string;
  endIso: string;
  breakStartIso: string | null;
  breakEndIso: string | null;
  shiftMinutes: number;
};

export function parsePastShiftWindow(input: {
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
}):
  | { ok: true; value: ParsedPastShiftWindow }
  | { ok: false; error: string; code: string } {
  const workDate = input.date.trim();
  const startIso = buildHorodateurOccurredAtIso(workDate, input.startTime);
  const endIso = buildHorodateurOccurredAtIso(workDate, input.endTime);

  if (!startIso || !endIso) {
    return {
      ok: false,
      error: "Date ou heures invalides (format AAAA-MM-JJ et HH:MM attendus).",
      code: "invalid_past_shift_times",
    };
  }

  if (getLocalWorkDate(startIso) !== getLocalWorkDate(endIso)) {
    return {
      ok: false,
      error: "Le début et la fin doivent être sur la même date de travail.",
      code: "past_shift_crosses_midnight",
    };
  }

  const shiftMinutes = diffMinutes(startIso, endIso);
  if (shiftMinutes < 1) {
    return {
      ok: false,
      error: "L'heure de fin doit être après l'heure de début.",
      code: "past_shift_invalid_duration",
    };
  }

  const breakMinutes = Math.max(0, Math.floor(Number(input.breakMinutes ?? 0)));
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
    return {
      ok: false,
      error: "Durée de pause invalide.",
      code: "invalid_break_minutes",
    };
  }

  if (breakMinutes >= shiftMinutes) {
    return {
      ok: false,
      error: "La pause doit être plus courte que la durée du quart.",
      code: "break_exceeds_shift",
    };
  }

  let breakStartIso: string | null = null;
  let breakEndIso: string | null = null;

  if (breakMinutes > 0) {
    const preBreakMinutes = Math.floor((shiftMinutes - breakMinutes) / 2);
    breakStartIso = addMinutesToOccurredAt(startIso, preBreakMinutes);
    breakEndIso = addMinutesToOccurredAt(breakStartIso, breakMinutes);
  }

  const todayWorkDate = getLocalWorkDate(new Date().toISOString());
  if (workDate > todayWorkDate) {
    return {
      ok: false,
      error: "La date de travail ne peut pas être dans le futur.",
      code: "past_shift_future_date",
    };
  }

  return {
    ok: true,
    value: {
      workDate: getLocalWorkDate(startIso),
      startIso,
      endIso,
      breakStartIso,
      breakEndIso,
      shiftMinutes,
    },
  };
}

export function formatPastShiftEmployeeDetails(input: {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  shiftMinutes: number;
}) {
  return [
    `Date: ${input.workDate}`,
    `Début: ${input.startTime}`,
    `Fin: ${input.endTime}`,
    `Durée: ${input.shiftMinutes} min`,
    `Pause: ${input.breakMinutes} min`,
  ].join("\n");
}

export function composePastShiftNote(prefix: string, body: string) {
  const trimmed = body.trim();
  return trimmed ? `${prefix}\n${trimmed}` : prefix;
}
