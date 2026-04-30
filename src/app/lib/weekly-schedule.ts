export type WeeklyScheduleMode = "fixed" | "variable";

export const WEEKLY_SCHEDULE_DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeeklyScheduleDayKey = (typeof WEEKLY_SCHEDULE_DAY_KEYS)[number];

export type WeeklyScheduleBreak = {
  enabled: boolean;
  time: string;
  minutes: number;
  paid: boolean;
};

export type WeeklyScheduleDayConfig = {
  active: boolean;
  start: string;
  end: string;
  plannedHours: number;
  pauseMinutes: number;
  breakAm: WeeklyScheduleBreak;
  lunch: WeeklyScheduleBreak;
  breakPm: WeeklyScheduleBreak;
};

export type WeeklyScheduleConfig = {
  mode: WeeklyScheduleMode;
  days: Record<WeeklyScheduleDayKey, WeeklyScheduleDayConfig>;
};

type LegacyScheduleLike = {
  schedule_start?: string | null;
  schedule_end?: string | null;
  planned_daily_hours?: number | null;
  planned_weekly_hours?: number | null;
  pause_minutes?: number | null;
  scheduled_work_days?: string[] | null;
  break_am_enabled?: boolean | null;
  break_am_time?: string | null;
  break_am_minutes?: number | null;
  break_am_paid?: boolean | null;
  lunch_enabled?: boolean | null;
  lunch_time?: string | null;
  lunch_minutes?: number | null;
  lunch_paid?: boolean | null;
  break_pm_enabled?: boolean | null;
  break_pm_time?: string | null;
  break_pm_minutes?: number | null;
  break_pm_paid?: boolean | null;
};

const TIME_HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeTime(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return TIME_HH_MM.test(trimmed) ? trimmed : fallback;
}

function sanitizeNonNegativeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function sanitizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeLegacyDayKey(value: string): WeeklyScheduleDayKey | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "monday" || normalized === "lundi") return "monday";
  if (normalized === "tuesday" || normalized === "mardi") return "tuesday";
  if (normalized === "wednesday" || normalized === "mercredi") return "wednesday";
  if (normalized === "thursday" || normalized === "jeudi") return "thursday";
  if (normalized === "friday" || normalized === "vendredi") return "friday";
  if (normalized === "saturday" || normalized === "samedi") return "saturday";
  if (normalized === "sunday" || normalized === "dimanche") return "sunday";
  return null;
}

export function createEmptyWeeklyScheduleBreak(): WeeklyScheduleBreak {
  return {
    enabled: false,
    time: "",
    minutes: 0,
    paid: false,
  };
}

export function createEmptyWeeklyScheduleDay(): WeeklyScheduleDayConfig {
  return {
    active: false,
    start: "",
    end: "",
    plannedHours: 0,
    pauseMinutes: 0,
    breakAm: createEmptyWeeklyScheduleBreak(),
    lunch: createEmptyWeeklyScheduleBreak(),
    breakPm: createEmptyWeeklyScheduleBreak(),
  };
}

export function createEmptyWeeklyScheduleConfig(
  mode: WeeklyScheduleMode = "fixed"
): WeeklyScheduleConfig {
  const days = Object.fromEntries(
    WEEKLY_SCHEDULE_DAY_KEYS.map((dayKey) => [dayKey, createEmptyWeeklyScheduleDay()])
  ) as Record<WeeklyScheduleDayKey, WeeklyScheduleDayConfig>;

  return {
    mode,
    days,
  };
}

function sanitizeBreak(value: unknown, fallback: WeeklyScheduleBreak): WeeklyScheduleBreak {
  if (!isObjectLike(value)) return { ...fallback };
  return {
    enabled: sanitizeBoolean(value.enabled, fallback.enabled),
    time: sanitizeTime(value.time, fallback.time),
    minutes: sanitizeNonNegativeNumber(value.minutes, fallback.minutes),
    paid: sanitizeBoolean(value.paid, fallback.paid),
  };
}

function sanitizeDay(value: unknown, fallback: WeeklyScheduleDayConfig): WeeklyScheduleDayConfig {
  if (!isObjectLike(value)) return structuredClone(fallback);
  return {
    active: sanitizeBoolean(value.active, fallback.active),
    start: sanitizeTime(value.start, fallback.start),
    end: sanitizeTime(value.end, fallback.end),
    plannedHours: sanitizeNonNegativeNumber(value.plannedHours, fallback.plannedHours),
    pauseMinutes: sanitizeNonNegativeNumber(value.pauseMinutes, fallback.pauseMinutes),
    breakAm: sanitizeBreak(value.breakAm, fallback.breakAm),
    lunch: sanitizeBreak(value.lunch, fallback.lunch),
    breakPm: sanitizeBreak(value.breakPm, fallback.breakPm),
  };
}

export function sanitizeWeeklyScheduleConfig(value: unknown): WeeklyScheduleConfig | null {
  if (!isObjectLike(value)) return null;

  const mode = value.mode;
  if (mode !== "fixed" && mode !== "variable") {
    return null;
  }

  if (!isObjectLike(value.days)) {
    return null;
  }

  const base = createEmptyWeeklyScheduleConfig(mode);
  const sanitizedDays = {} as Record<WeeklyScheduleDayKey, WeeklyScheduleDayConfig>;

  for (const dayKey of WEEKLY_SCHEDULE_DAY_KEYS) {
    sanitizedDays[dayKey] = sanitizeDay(value.days[dayKey], base.days[dayKey]);
  }

  return {
    mode,
    days: sanitizedDays,
  };
}

export function isValidWeeklyScheduleConfig(value: unknown): value is WeeklyScheduleConfig {
  return sanitizeWeeklyScheduleConfig(value) !== null;
}

export function computeWeeklyPlannedHours(config: WeeklyScheduleConfig): number {
  return WEEKLY_SCHEDULE_DAY_KEYS.reduce((sum, dayKey) => {
    const day = config.days[dayKey];
    if (!day.active) return sum;
    return sum + sanitizeNonNegativeNumber(day.plannedHours, 0);
  }, 0);
}

export function createWeeklyScheduleFromLegacy(
  legacy: LegacyScheduleLike
): WeeklyScheduleConfig {
  const config = createEmptyWeeklyScheduleConfig("fixed");
  const activeDayKeys = new Set<WeeklyScheduleDayKey>();
  for (const rawDay of legacy.scheduled_work_days ?? []) {
    const key = normalizeLegacyDayKey(String(rawDay));
    if (key) activeDayKeys.add(key);
  }

  const defaultBreakAm: WeeklyScheduleBreak = {
    enabled: legacy.break_am_enabled === true,
    time: sanitizeTime(legacy.break_am_time),
    minutes: sanitizeNonNegativeNumber(legacy.break_am_minutes, 0),
    paid: legacy.break_am_paid !== false,
  };
  const defaultLunch: WeeklyScheduleBreak = {
    enabled: legacy.lunch_enabled === true,
    time: sanitizeTime(legacy.lunch_time),
    minutes: sanitizeNonNegativeNumber(legacy.lunch_minutes, 0),
    paid: legacy.lunch_paid === true,
  };
  const defaultBreakPm: WeeklyScheduleBreak = {
    enabled: legacy.break_pm_enabled === true,
    time: sanitizeTime(legacy.break_pm_time),
    minutes: sanitizeNonNegativeNumber(legacy.break_pm_minutes, 0),
    paid: legacy.break_pm_paid !== false,
  };

  const plannedDailyHours = sanitizeNonNegativeNumber(legacy.planned_daily_hours, 0);
  const start = sanitizeTime(legacy.schedule_start);
  const end = sanitizeTime(legacy.schedule_end);
  const pauseMinutes = sanitizeNonNegativeNumber(legacy.pause_minutes, 0);

  for (const dayKey of WEEKLY_SCHEDULE_DAY_KEYS) {
    config.days[dayKey] = {
      active: activeDayKeys.size > 0 ? activeDayKeys.has(dayKey) : false,
      start,
      end,
      plannedHours: plannedDailyHours,
      pauseMinutes,
      breakAm: { ...defaultBreakAm },
      lunch: { ...defaultLunch },
      breakPm: { ...defaultBreakPm },
    };
  }

  // Keep legacy fixed weekly total if provided by caller.
  const explicitWeekly = sanitizeNonNegativeNumber(legacy.planned_weekly_hours, -1);
  if (explicitWeekly >= 0 && plannedDailyHours > 0 && activeDayKeys.size > 0) {
    // Preserve daily values and allow caller to read explicit weekly from legacy if needed.
    // This helper intentionally does not override day values.
  }

  return config;
}
